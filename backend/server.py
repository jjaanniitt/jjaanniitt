from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import hashlib
import secrets
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
JWT_DAYS = 30
ADMIN_EMAIL = os.environ['ADMIN_EMAIL'].strip().lower()
ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']

# ---------------------------------------------------------------------------
# Object storage (Emergent managed) — profile photos
# ---------------------------------------------------------------------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "node-gestiune"
storage_key = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Subscription plans
# ---------------------------------------------------------------------------
PLANS = {
    "free":    {"name": "Free",    "price": 0,   "max_partners": 1,   "max_orders_month": 20},
    "basic":   {"name": "Basic",   "price": 50,  "max_partners": 10,  "max_orders_month": 50},
    "avansat": {"name": "Avansat", "price": 100, "max_partners": 50,  "max_orders_month": 1000},
    "pro":     {"name": "Pro",     "price": 200, "max_partners": None, "max_orders_month": None},
}


def liters_for(size: str) -> float:
    s = (size or "").strip().lower().replace(",", ".")
    if s.endswith("l"):
        try:
            return float(s[:-1])
        except ValueError:
            return 0.0
    return 0.0

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
bearer = HTTPBearer(auto_error=False)


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(pw: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), h.encode("utf-8"))
    except (ValueError, UnicodeError):
        return False


def make_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "email": email, "iat": now, "exp": now + timedelta(days=JWT_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Neautentificat")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG], options={"require": ["sub", "exp"]})
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    except (jwt.InvalidTokenError, ValueError, TypeError):
        user = None
    if not user:
        raise HTTPException(status_code=401, detail="Sesiune expirata")
    return user


async def require_parent(user=Depends(current_user)):
    if user.get("role") != "parent":
        raise HTTPException(status_code=403, detail="Doar firma-mama poate face aceasta actiune")
    return user


def org_id_of(user: dict) -> str:
    return user.get("organization_id")


def is_partner(user: dict) -> bool:
    return user.get("role") == "partner"


def collab_query(user: dict, extra: Optional[dict] = None) -> dict:
    """Scope a collaborators query to the user's org (+ own partner for partner role)."""
    q = {"deleted_at": None, "organization_id": org_id_of(user)}
    if is_partner(user):
        q["id"] = user.get("partner_id")
    if extra:
        q.update(extra)
    return q


def data_query(user: dict, extra: Optional[dict] = None) -> dict:
    """Scope clients/orders/consignments to org (+ own collaborator for partner role)."""
    q = {"deleted_at": None, "organization_id": org_id_of(user)}
    if is_partner(user):
        q["collaborator_id"] = user.get("partner_id")
    if extra:
        q.update(extra)
    return q


async def get_org(user: dict) -> dict:
    org = await db.organizations.find_one({"id": org_id_of(user)}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organizatie negasita")
    return org


# ---------------------------------------------------------------------------
# Catalog (seeded from the client's Excel)
# ---------------------------------------------------------------------------
CATALOG = [
    {"id": "ocean-det-3l",   "category": "Ocean",               "variant": "Detergent",         "size": "3L",   "price": 40, "order": 1},
    {"id": "ocean-det-5l",   "category": "Ocean",               "variant": "Detergent",         "size": "5L",   "price": 60, "order": 2},
    {"id": "ocean-bal-3l",   "category": "Ocean",               "variant": "Balsam",            "size": "3L",   "price": 45, "order": 3},
    {"id": "ocean-bal-5l",   "category": "Ocean",               "variant": "Balsam",            "size": "5L",   "price": 70, "order": 4},
    {"id": "floral-det-3l",  "category": "Floral",              "variant": "Detergent",         "size": "3L",   "price": 40, "order": 5},
    {"id": "floral-det-5l",  "category": "Floral",              "variant": "Detergent",         "size": "5L",   "price": 60, "order": 6},
    {"id": "floral-bal-3l",  "category": "Floral",              "variant": "Balsam",            "size": "3L",   "price": 45, "order": 7},
    {"id": "floral-bal-5l",  "category": "Floral",              "variant": "Balsam",            "size": "5L",   "price": 70, "order": 8},
    {"id": "lavanda-det-3l", "category": "Lavanda",             "variant": "Detergent",         "size": "3L",   "price": 40, "order": 9},
    {"id": "lavanda-det-5l", "category": "Lavanda",             "variant": "Detergent",         "size": "5L",   "price": 60, "order": 10},
    {"id": "lavanda-bal-3l", "category": "Lavanda",             "variant": "Balsam",            "size": "3L",   "price": 45, "order": 11},
    {"id": "lavanda-bal-5l", "category": "Lavanda",             "variant": "Balsam",            "size": "5L",   "price": 70, "order": 12},
    {"id": "vase-1l",        "category": "Detergent de vase",   "variant": "Detergent de vase", "size": "1L",   "price": 15, "order": 13},
    {"id": "universal-3l",   "category": "Universal pardoseli", "variant": "Universal",         "size": "3L",   "price": 40, "order": 14},
    {"id": "universal-5l",   "category": "Universal pardoseli", "variant": "Universal",         "size": "5L",   "price": 60, "order": 15},
    {"id": "sapun-05l",      "category": "Sapun lichid",        "variant": "Recipient dozator", "size": "0.5L", "price": 10, "order": 16},
    {"id": "sapun-rez-1l",   "category": "Sapun lichid",        "variant": "Rezerva",           "size": "1L",   "price": 15, "order": 17},
    {"id": "odorizant",      "category": "Odorizant",           "variant": "Odorizant",         "size": "Buc",  "price": 35, "order": 18},
]

INITIAL_MODSHOP_STOCK = {
    "ocean-det-3l": 33, "ocean-det-5l": 20, "ocean-bal-3l": 33, "ocean-bal-5l": 20,
    "floral-det-3l": 33, "floral-det-5l": 20, "floral-bal-3l": 33, "floral-bal-5l": 20,
    "lavanda-det-3l": 0, "lavanda-det-5l": 0, "lavanda-bal-3l": 0, "lavanda-bal-5l": 0,
    "vase-1l": 20, "universal-3l": 33, "universal-5l": 10,
    "sapun-05l": 15, "sapun-rez-1l": 15, "odorizant": 0,
}


def product_label(p: dict) -> str:
    cat = p["category"]
    variant = p["variant"]
    if variant and variant != cat:
        return f"{cat} {variant} {p['size']}"
    return f"{cat} {p['size']}"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: str
    password: str


class ParentRegister(BaseModel):
    email: str
    password: str
    organization_name: str
    company_name: Optional[str] = ""


class PartnerRegister(BaseModel):
    email: str
    password: str
    invite_code: str
    partner_name: Optional[str] = ""


class InviteCreate(BaseModel):
    collaborator_id: str
    expires_hours: int = 168


class CollaboratorCreate(BaseModel):
    name: str
    notes: Optional[str] = ""


class ClientCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    notes: Optional[str] = ""
    cui: Optional[str] = ""
    address: Optional[str] = ""


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    cui: Optional[str] = None
    address: Optional[str] = None


class StockAdjust(BaseModel):
    product_id: str
    quantity: int


class OrderLine(BaseModel):
    product_id: str
    qty: int


class OrderCreate(BaseModel):
    collaborator_id: str
    client_id: str
    lines: List[OrderLine]
    status: str = "In asteptare"
    date: Optional[str] = None
    address: Optional[str] = ""


class StatusUpdate(BaseModel):
    status: str


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------
async def next_document_no() -> str:
    doc = await db.counters.find_one_and_update(
        {"id": "document"}, {"$inc": {"value": 1}}, upsert=True, return_document=True
    )
    n = doc["value"] if doc and "value" in doc else 1
    return f"DZL{n:04d}"


@app.on_event("startup")
async def seed():
    try:
        await run_in_threadpool(init_storage)
    except Exception as e:
        logger.warning(f"Storage init failed: {e}")
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "id": new_id(), "email": ADMIN_EMAIL, "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin", "plan": "free", "avatar_path": None, "name": "Administrator",
            "created_at": now_iso(),
        })
    for p in CATALOG:
        await db.products.update_one({"id": p["id"]}, {"$setOnInsert": {**p, "label": product_label(p), "barcode": None}}, upsert=True)
    meta = await db.meta.find_one({"id": "seed"})
    if not meta:
        await db.collaborators.insert_one({
            "id": new_id(), "name": "MOD SHOP SRL", "notes": "", "stock": dict(INITIAL_MODSHOP_STOCK),
            "created_at": now_iso(), "deleted_at": None,
        })
        await db.meta.insert_one({"id": "seed", "done": True, "created_at": now_iso()})
    # one-time clean slate: reset all stock to 0, clear test orders/consignments, reset counter
    mig = await db.meta.find_one({"id": "reset_v2"})
    if not mig:
        zero = {p["id"]: 0 for p in CATALOG}
        await db.collaborators.update_many({}, {"$set": {"stock": dict(zero)}})
        await db.orders.update_many({"deleted_at": None}, {"$set": {"deleted_at": now_iso()}})
        await db.counters.update_one({"id": "document"}, {"$set": {"value": 0}}, upsert=True)
        await db.products.update_many({"barcode": {"$exists": False}}, {"$set": {"barcode": None}})
        await db.users.update_many({"plan": {"$exists": False}}, {"$set": {"plan": "free", "avatar_path": None, "name": "Administrator"}})
        await db.meta.insert_one({"id": "reset_v2", "done": True, "created_at": now_iso()})
    # backfill partial-payment fields on existing orders
    pay_mig = await db.meta.find_one({"id": "payments_v1"})
    if not pay_mig:
        async for o in db.orders.find({"paid": {"$exists": False}}):
            total = o.get("total", 0)
            paid = total if o.get("status") == "Finalizat" else 0
            await db.orders.update_one({"id": o["id"]}, {"$set": {"paid": paid, "payments": []}})
        await db.meta.insert_one({"id": "payments_v1", "done": True, "created_at": now_iso()})
    # multi-tenant migration: owner -> parent, create org, attach organization_id everywhere
    mt = await db.meta.find_one({"id": "multitenant_v1"})
    if not mt:
        owner = await db.users.find_one({"email": ADMIN_EMAIL})
        org_id = new_id()
        central = {p["id"]: 0 for p in CATALOG}
        await db.organizations.insert_one({
            "id": org_id, "name": "Firma mama", "owner_id": owner["id"] if owner else None,
            "central_stock": central,
            "company": {"name": "Firma mama", "cui": "", "reg_com": "", "address": "",
                        "iban": "", "bank": "", "phone": "", "email": ADMIN_EMAIL},
            "created_at": now_iso(),
        })
        if owner:
            await db.users.update_one({"id": owner["id"]}, {"$set": {
                "role": "parent", "organization_id": org_id, "partner_id": None}})
        # attach org to all existing domain docs
        for coll in ("collaborators", "clients", "orders", "consignments", "products"):
            await db[coll].update_many({"organization_id": {"$exists": False}}, {"$set": {"organization_id": org_id}})
        await db.meta.insert_one({"id": "multitenant_v1", "done": True, "org_id": org_id, "created_at": now_iso()})
    await db.users.create_index("email", unique=True)
    await db.invites.create_index("code_hash", unique=True)
    logger.info("Seed complete")


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/login")
async def login(body: LoginRequest):
    user = await db.users.find_one({"email": body.email.strip().lower()})
    dummy = "$2b$12$" + "x" * 53
    valid = verify_password(body.password, user["password_hash"] if user else dummy)
    if not user or not valid:
        raise HTTPException(status_code=401, detail="Email sau parola gresita")
    token = make_token(user["id"], user["email"])
    return {"access_token": token, "token_type": "bearer",
            "user": {"id": user["id"], "email": user["email"], "role": user.get("role", "parent")}}


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


@api_router.post("/auth/register/parent")
async def register_parent(body: ParentRegister):
    email = body.email.strip().lower()
    if not email or len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Email valid si parola de minim 6 caractere")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email deja inregistrat")
    org_id = new_id()
    uid = new_id()
    central = {p["id"]: 0 for p in CATALOG}
    await db.organizations.insert_one({
        "id": org_id, "name": body.organization_name.strip() or "Firma mea", "owner_id": uid,
        "central_stock": central,
        "company": {"name": (body.company_name or body.organization_name).strip(), "cui": "", "reg_com": "",
                    "address": "", "iban": "", "bank": "", "phone": "", "email": email},
        "created_at": now_iso(),
    })
    # clone the base catalog into the new org so it has products to work with
    for p in CATALOG:
        await db.products.insert_one({**p, "id": new_id(), "label": product_label(p),
                                      "barcode": None, "organization_id": org_id, "base_id": p["id"]})
    await db.users.insert_one({
        "id": uid, "email": email, "password_hash": hash_password(body.password),
        "role": "parent", "organization_id": org_id, "partner_id": None,
        "plan": "free", "avatar_path": None, "name": body.organization_name.strip() or "Administrator",
        "created_at": now_iso(),
    })
    token = make_token(uid, email)
    return {"access_token": token, "token_type": "bearer", "user": {"id": uid, "email": email, "role": "parent"}}


@api_router.post("/auth/invites", dependencies=[Depends(require_parent)])
async def create_invite(body: InviteCreate, user=Depends(require_parent)):
    collab = await db.collaborators.find_one(collab_query(user, {"id": body.collaborator_id}))
    if not collab:
        raise HTTPException(status_code=404, detail="Partener negasit")
    raw = secrets.token_urlsafe(9)[:12].upper().replace("_", "X").replace("-", "Y")
    expires = (datetime.now(timezone.utc) + timedelta(hours=max(1, body.expires_hours))).isoformat()
    await db.invites.insert_one({
        "id": new_id(), "code_hash": _hash_code(raw), "organization_id": org_id_of(user),
        "partner_id": body.collaborator_id, "partner_name": collab["name"],
        "created_by": user["id"], "expires_at": expires, "used_at": None, "used_by": None,
        "created_at": now_iso(),
    })
    return {"invite_code": raw, "partner_name": collab["name"], "expires_at": expires}


@api_router.get("/auth/invites", dependencies=[Depends(require_parent)])
async def list_invites(user=Depends(require_parent)):
    inv = await db.invites.find({"organization_id": org_id_of(user)}, {"_id": 0, "code_hash": 0}).sort("created_at", -1).to_list(500)
    return inv


@api_router.post("/auth/register/partner")
async def register_partner(body: PartnerRegister):
    email = body.email.strip().lower()
    if not email or len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Email valid si parola de minim 6 caractere")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email deja inregistrat")
    uid = new_id()
    invite = await db.invites.find_one_and_update(
        {"code_hash": _hash_code(body.invite_code.strip().upper()), "used_at": None,
         "expires_at": {"$gt": now_iso()}},
        {"$set": {"used_at": now_iso(), "used_by": uid}},
    )
    if not invite:
        raise HTTPException(status_code=400, detail="Cod de invitatie invalid, expirat sau deja folosit")
    await db.users.insert_one({
        "id": uid, "email": email, "password_hash": hash_password(body.password),
        "role": "partner", "organization_id": invite["organization_id"], "partner_id": invite["partner_id"],
        "plan": "pro", "avatar_path": None, "name": body.partner_name.strip() or invite.get("partner_name", "Partener"),
        "created_at": now_iso(),
    })
    token = make_token(uid, email)
    return {"access_token": token, "token_type": "bearer", "user": {"id": uid, "email": email, "role": "partner"}}


@api_router.get("/me")
async def me(user=Depends(current_user)):
    plan = user.get("plan", "free")
    org = await db.organizations.find_one({"id": org_id_of(user)}, {"_id": 0})
    partner = None
    if is_partner(user) and user.get("partner_id"):
        partner = await db.collaborators.find_one({"id": user["partner_id"]}, {"_id": 0})
    return {**user, "plan": plan, "plan_info": PLANS.get(plan, PLANS["free"]),
            "organization": org, "partner": partner}


# ---------------------------------------------------------------------------
# Subscription & account
# ---------------------------------------------------------------------------
def _month_key(dt: Optional[str] = None) -> str:
    return (dt or now_iso())[:7]


async def _usage(user: dict) -> dict:
    partners = await db.collaborators.count_documents({"deleted_at": None, "organization_id": org_id_of(user)})
    month = _month_key()
    orders_month = await db.orders.count_documents({"deleted_at": None, "organization_id": org_id_of(user), "created_at": {"$regex": f"^{month}"}})
    return {"partners": partners, "orders_month": orders_month, "month": month}


@api_router.get("/subscription")
async def subscription(user=Depends(current_user)):
    plan = user.get("plan", "free")
    return {"plan": plan, "plans": PLANS, "limits": PLANS.get(plan, PLANS["free"]), "usage": await _usage(user)}


class PlanActivate(BaseModel):
    plan: str


@api_router.post("/subscription/activate")
async def activate_plan(body: PlanActivate, user=Depends(current_user)):
    if body.plan not in PLANS:
        raise HTTPException(status_code=400, detail="Plan invalid")
    await db.users.update_one({"id": user["id"]}, {"$set": {"plan": body.plan}})
    return {"plan": body.plan, "plan_info": PLANS[body.plan]}


class ProfileUpdate(BaseModel):
    name: str


@api_router.put("/me")
async def update_me(body: ProfileUpdate, user=Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"name": body.name.strip()}})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return u


@api_router.post("/me/avatar")
async def upload_avatar(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    ext = (file.filename or "jpg").split(".")[-1].lower()[:5] or "jpg"
    path = f"{APP_NAME}/uploads/{user['id']}/{new_id()}.{ext}"
    await run_in_threadpool(put_object, path, data, file.content_type or "image/jpeg")
    await db.users.update_one({"id": user["id"]}, {"$set": {"avatar_path": path}})
    return {"avatar_path": path}


@api_router.get("/me/avatar")
async def get_avatar(token: Optional[str] = None, user_id: Optional[str] = None):
    # allow query token (web <img>) or Authorization header
    uid = user_id
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
            uid = payload["sub"]
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Token invalid")
    if not uid:
        raise HTTPException(status_code=400, detail="Lipseste user")
    u = await db.users.find_one({"id": uid})
    if not u or not u.get("avatar_path"):
        raise HTTPException(status_code=404, detail="Fara avatar")
    content, ctype = await run_in_threadpool(get_object, u["avatar_path"])
    return Response(content=content, media_type=ctype)


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
@api_router.get("/products")
async def list_products(user=Depends(current_user)):
    items = await db.products.find(
        {"organization_id": org_id_of(user), "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]}, {"_id": 0}
    ).sort("order", 1).to_list(1000)
    return items


async def _products_map(org_id: str) -> Dict[str, dict]:
    items = await db.products.find(
        {"organization_id": org_id, "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]}, {"_id": 0}
    ).to_list(1000)
    return {p["id"]: p for p in items}


class ProductCreate(BaseModel):
    category: str
    variant: str = ""
    size: str
    price: int
    barcode: Optional[str] = None


@api_router.post("/products")
async def create_product(body: ProductCreate, user=Depends(require_parent)):
    last = await db.products.find({"organization_id": org_id_of(user)}, {"_id": 0, "order": 1}).sort("order", -1).limit(1).to_list(1)
    next_order = (last[0]["order"] + 1) if last else 1
    p = {"id": new_id(), "category": body.category.strip(),
         "variant": (body.variant or body.category).strip(), "size": body.size.strip(),
         "price": int(body.price), "order": next_order, "custom": True,
         "organization_id": org_id_of(user),
         "barcode": (body.barcode or "").strip() or None}
    p["label"] = product_label(p)
    await db.products.insert_one(p)
    p.pop("_id", None)
    return p


class ProductUpdate(BaseModel):
    price: Optional[int] = None
    barcode: Optional[str] = None


@api_router.put("/products/{product_id}")
async def update_product(product_id: str, body: ProductUpdate, user=Depends(require_parent)):
    sets = {}
    if body.price is not None:
        sets["price"] = int(body.price)
    if body.barcode is not None:
        sets["barcode"] = body.barcode.strip() or None
    if sets:
        await db.products.update_one({"id": product_id, "organization_id": org_id_of(user)}, {"$set": sets})
    p = await db.products.find_one({"id": product_id, "organization_id": org_id_of(user)}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Produs negasit")
    return p


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user=Depends(require_parent)):
    res = await db.products.update_one({"id": product_id, "organization_id": org_id_of(user)}, {"$set": {"deleted_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produs negasit")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Settings (low stock threshold)
# ---------------------------------------------------------------------------
DEFAULT_THRESHOLD = 5


async def get_threshold() -> int:
    doc = await db.meta.find_one({"id": "settings"})
    if doc and "low_stock_threshold" in doc:
        return int(doc["low_stock_threshold"])
    return DEFAULT_THRESHOLD


class SettingsUpdate(BaseModel):
    low_stock_threshold: int


@api_router.get("/settings")
async def get_settings(user=Depends(current_user)):
    return {"low_stock_threshold": await get_threshold()}


@api_router.put("/settings")
async def update_settings(body: SettingsUpdate, user=Depends(current_user)):
    val = max(0, int(body.low_stock_threshold))
    await db.meta.update_one({"id": "settings"}, {"$set": {"low_stock_threshold": val}}, upsert=True)
    return {"low_stock_threshold": val}


# ---------------------------------------------------------------------------
# Collaborators
# ---------------------------------------------------------------------------
async def _collab_totals(collab: dict) -> dict:
    stock = collab.get("stock", {})
    total_stock = sum(stock.values())
    negatives = [pid for pid, q in stock.items() if q < 0]
    orders = await db.orders.find({"collaborator_id": collab["id"], "deleted_at": None}, {"_id": 0}).to_list(5000)
    collected = sum(o.get("paid", 0) for o in orders)
    pending = sum(o["total"] - o.get("paid", 0) for o in orders)
    return {"total_stock": total_stock, "negative_count": len(negatives),
            "orders_count": len(orders), "collected": collected, "pending": pending}


@api_router.get("/collaborators")
async def list_collaborators(user=Depends(current_user)):
    collabs = await db.collaborators.find(collab_query(user), {"_id": 0}).sort("created_at", 1).to_list(1000)
    out = []
    for c in collabs:
        out.append({**c, **(await _collab_totals(c))})
    return out


@api_router.post("/collaborators")
async def create_collaborator(body: CollaboratorCreate, user=Depends(require_parent)):
    limit = PLANS.get(user.get("plan", "free"), PLANS["free"])["max_partners"]
    if limit is not None:
        count = await db.collaborators.count_documents({"deleted_at": None, "organization_id": org_id_of(user)})
        if count >= limit:
            raise HTTPException(status_code=403, detail=f"Ai atins limita de {limit} parteneri a planului tau. Fa upgrade pentru mai multi.")
    pmap = await _products_map(org_id_of(user))
    stock = {pid: 0 for pid in pmap}
    doc = {"id": new_id(), "name": body.name.strip(), "notes": body.notes or "", "stock": stock,
           "organization_id": org_id_of(user), "created_at": now_iso(), "deleted_at": None}
    await db.collaborators.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, **(await _collab_totals(doc))}


def _stock_list(collab: dict, pmap: Dict[str, dict], intrat: Dict[str, int], iesit: Dict[str, int]) -> list:
    stock = collab.get("stock", {})
    return [{**p, "quantity": stock.get(p["id"], 0),
             "intrat": intrat.get(p["id"], 0), "iesit": iesit.get(p["id"], 0)}
            for p in sorted(pmap.values(), key=lambda x: x["order"])]


@api_router.get("/collaborators/{collab_id}")
async def get_collaborator(collab_id: str, user=Depends(current_user)):
    collab = await db.collaborators.find_one(collab_query(user, {"id": collab_id}), {"_id": 0})
    if not collab:
        raise HTTPException(status_code=404, detail="Colaborator negasit")
    pmap = await _products_map(org_id_of(user))
    totals = await _collab_totals(collab)
    clients = await db.clients.find({"collaborator_id": collab_id, "deleted_at": None}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    client_rows = []
    for cl in clients:
        c_orders = await db.orders.find({"client_id": cl["id"], "deleted_at": None}, {"_id": 0}).to_list(2000)
        client_rows.append({**cl, "orders_count": len(c_orders),
                            "collected": sum(o.get("paid", 0) for o in c_orders),
                            "pending": sum(o["total"] - o.get("paid", 0) for o in c_orders)})
    orders = await db.orders.find({"collaborator_id": collab_id, "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    consignments = await db.consignments.find({"collaborator_id": collab_id, "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    intrat: Dict[str, int] = {}
    for cn in consignments:
        for it in cn["items"]:
            intrat[it["product_id"]] = intrat.get(it["product_id"], 0) + it["qty"]
    iesit: Dict[str, int] = {}
    for o in orders:
        for ln in o["lines"]:
            iesit[ln["product_id"]] = iesit.get(ln["product_id"], 0) + ln["qty"]
    return {**collab, **totals, "stock_rows": _stock_list(collab, pmap, intrat, iesit),
            "clients": client_rows, "orders": orders, "consignments": consignments,
            "total_in": sum(intrat.values()), "total_out": sum(iesit.values())}


# ---------------------------------------------------------------------------
# Consignments (intrare in stoc pe baza de proces verbal)
# ---------------------------------------------------------------------------
class ConsignmentItem(BaseModel):
    product_id: str
    qty: int


class ConsignmentCreate(BaseModel):
    pv_number: str
    date: Optional[str] = None
    items: List[ConsignmentItem]


@api_router.post("/collaborators/{collab_id}/consignments")
async def create_consignment(collab_id: str, body: ConsignmentCreate, user=Depends(require_parent)):
    collab = await db.collaborators.find_one(collab_query(user, {"id": collab_id}))
    if not collab:
        raise HTTPException(status_code=404, detail="Colaborator negasit")
    org = await get_org(user)
    central = dict(org.get("central_stock", {}))
    pmap = await _products_map(org_id_of(user))
    stock = dict(collab.get("stock", {}))
    items = []
    total_items = 0
    for it in body.items:
        if it.qty <= 0:
            continue
        p = pmap.get(it.product_id)
        if not p:
            raise HTTPException(status_code=400, detail=f"Produs invalid: {it.product_id}")
        avail = central.get(p["id"], 0)
        if it.qty > avail:
            raise HTTPException(status_code=400, detail=f"Stoc central insuficient pentru {p['label']} (disponibil {avail}). Fa receptie in depozit mai intai.")
        items.append({"product_id": p["id"], "label": p["label"], "size": p["size"], "qty": it.qty})
        stock[p["id"]] = stock.get(p["id"], 0) + it.qty
        central[p["id"]] = avail - it.qty
        total_items += it.qty
    if not items:
        raise HTTPException(status_code=400, detail="Nu ai adaugat produse")
    doc = {"id": new_id(), "collaborator_id": collab_id, "organization_id": org_id_of(user),
           "pv_number": body.pv_number.strip(),
           "date": body.date or now_iso(), "items": items, "total_items": total_items,
           "created_at": now_iso(), "deleted_at": None}
    await db.consignments.insert_one(doc)
    await db.collaborators.update_one({"id": collab_id}, {"$set": {"stock": stock}})
    await db.organizations.update_one({"id": org_id_of(user)}, {"$set": {"central_stock": central}})
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------------------
# Central warehouse (depozit firma-mama)
# ---------------------------------------------------------------------------
class CentralReception(BaseModel):
    items: List[ConsignmentItem]
    note: Optional[str] = ""


@api_router.get("/central-stock")
async def central_stock(user=Depends(require_parent)):
    org = await get_org(user)
    pmap = await _products_map(org_id_of(user))
    central = org.get("central_stock", {})
    rows = [{**p, "quantity": central.get(p["id"], 0)} for p in sorted(pmap.values(), key=lambda x: x["order"])]
    # how much is out in partners (consigned)
    collabs = await db.collaborators.find({"deleted_at": None, "organization_id": org_id_of(user)}, {"_id": 0}).to_list(1000)
    consigned = sum(sum(c.get("stock", {}).values()) for c in collabs)
    return {"rows": rows, "total_central": sum(central.values()), "total_consigned": consigned}


@api_router.post("/central-stock/reception")
async def central_reception(body: CentralReception, user=Depends(require_parent)):
    org = await get_org(user)
    central = dict(org.get("central_stock", {}))
    pmap = await _products_map(org_id_of(user))
    items = []
    for it in body.items:
        if it.qty == 0:
            continue
        p = pmap.get(it.product_id)
        if not p:
            raise HTTPException(status_code=400, detail=f"Produs invalid: {it.product_id}")
        central[p["id"]] = central.get(p["id"], 0) + it.qty
        items.append({"product_id": p["id"], "label": p["label"], "qty": it.qty})
    if not items:
        raise HTTPException(status_code=400, detail="Nu ai adaugat produse")
    await db.organizations.update_one({"id": org_id_of(user)}, {"$set": {"central_stock": central}})
    await db.receptions.insert_one({"id": new_id(), "organization_id": org_id_of(user),
                                    "items": items, "note": body.note or "", "created_at": now_iso()})
    return {"ok": True, "central_stock": central}


@api_router.delete("/collaborators/{collab_id}")
async def delete_collaborator(collab_id: str, user=Depends(require_parent)):
    await db.collaborators.update_one(collab_query(user, {"id": collab_id}), {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


@api_router.put("/collaborators/{collab_id}/stock")
async def adjust_stock(collab_id: str, body: StockAdjust, user=Depends(require_parent)):
    collab = await db.collaborators.find_one(collab_query(user, {"id": collab_id}))
    if not collab:
        raise HTTPException(status_code=404, detail="Colaborator negasit")
    await db.collaborators.update_one({"id": collab_id}, {"$set": {f"stock.{body.product_id}": body.quantity}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------
@api_router.post("/collaborators/{collab_id}/clients")
async def create_client(collab_id: str, body: ClientCreate, user=Depends(current_user)):
    collab = await db.collaborators.find_one(collab_query(user, {"id": collab_id}))
    if not collab:
        raise HTTPException(status_code=404, detail="Colaborator negasit")
    existing = await db.clients.find_one({
        "collaborator_id": collab_id, "deleted_at": None,
        "name": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"},
    })
    if existing:
        raise HTTPException(status_code=409, detail=f"Clientul \"{existing['name']}\" exista deja")
    doc = {"id": new_id(), "collaborator_id": collab_id, "collaborator_name": collab["name"],
           "organization_id": org_id_of(user),
           "name": body.name.strip(), "phone": body.phone or "", "notes": body.notes or "",
           "cui": body.cui or "", "address": body.address or "",
           "created_at": now_iso(), "deleted_at": None}
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, "orders_count": 0, "collected": 0, "pending": 0}


@api_router.get("/clients/{client_id}")
async def get_client(client_id: str, user=Depends(current_user)):
    cl = await db.clients.find_one(data_query(user, {"id": client_id}), {"_id": 0})
    if not cl:
        raise HTTPException(status_code=404, detail="Client negasit")
    orders = await db.orders.find({"client_id": client_id, "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {**cl, "orders": orders, "orders_count": len(orders),
            "collected": sum(o.get("paid", 0) for o in orders),
            "pending": sum(o["total"] - o.get("paid", 0) for o in orders)}


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user=Depends(current_user)):
    await db.clients.update_one(data_query(user, {"id": client_id}), {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, body: ClientUpdate, user=Depends(current_user)):
    cl = await db.clients.find_one(data_query(user, {"id": client_id}))
    if not cl:
        raise HTTPException(status_code=404, detail="Client negasit")
    sets = {}
    if body.name is not None and body.name.strip():
        sets["name"] = body.name.strip()
    if body.phone is not None:
        sets["phone"] = body.phone.strip()
    if body.notes is not None:
        sets["notes"] = body.notes.strip()
    if body.cui is not None:
        sets["cui"] = body.cui.strip()
    if body.address is not None:
        sets["address"] = body.address.strip()
    if sets:
        await db.clients.update_one({"id": client_id}, {"$set": sets})
        # keep client_name on existing orders in sync
        if "name" in sets:
            await db.orders.update_many({"client_id": client_id}, {"$set": {"client_name": sets["name"]}})
    u = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return u


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------
@api_router.get("/orders")
async def list_orders(status: Optional[str] = None, collaborator_id: Optional[str] = None, user=Depends(current_user)):
    q = data_query(user)
    if status:
        q["status"] = status
    if collaborator_id and not is_partner(user):
        q["collaborator_id"] = collaborator_id
    return await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user=Depends(current_user)):
    o = await db.orders.find_one(data_query(user, {"id": order_id}), {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Comanda negasita")
    return o


def _order_status(paid: float, total: float) -> str:
    if paid <= 0:
        return "In asteptare"
    if paid >= total:
        return "Finalizat"
    return "Partial"


@api_router.post("/orders")
async def create_order(body: OrderCreate, user=Depends(current_user)):
    limit = PLANS.get(user.get("plan", "free"), PLANS["free"])["max_orders_month"]
    if limit is not None:
        month = _month_key()
        count = await db.orders.count_documents({"deleted_at": None, "organization_id": org_id_of(user), "created_at": {"$regex": f"^{month}"}})
        if count >= limit:
            raise HTTPException(status_code=403, detail=f"Ai atins limita de {limit} comenzi/luna a planului tau. Fa upgrade pentru mai multe.")
    if is_partner(user) and body.collaborator_id != user.get("partner_id"):
        raise HTTPException(status_code=403, detail="Nu poti crea comenzi pentru alt partener")
    collab = await db.collaborators.find_one(collab_query(user, {"id": body.collaborator_id}))
    if not collab:
        raise HTTPException(status_code=404, detail="Colaborator negasit")
    cl = await db.clients.find_one({"id": body.client_id, "deleted_at": None, "organization_id": org_id_of(user)})
    if not cl:
        raise HTTPException(status_code=404, detail="Client negasit")
    pmap = await _products_map(org_id_of(user))
    lines = []
    total = 0
    stock = dict(collab.get("stock", {}))
    for ln in body.lines:
        if ln.qty <= 0:
            continue
        p = pmap.get(ln.product_id)
        if not p:
            raise HTTPException(status_code=400, detail=f"Produs invalid: {ln.product_id}")
        subtotal = p["price"] * ln.qty
        total += subtotal
        lines.append({"product_id": p["id"], "label": p["label"], "size": p["size"],
                      "price": p["price"], "qty": ln.qty, "subtotal": subtotal})
        stock[p["id"]] = stock.get(p["id"], 0) - ln.qty
    if not lines:
        raise HTTPException(status_code=400, detail="Comanda nu are produse")
    document_no = await next_document_no()
    req_status = body.status if body.status in ("In asteptare", "Finalizat") else "In asteptare"
    paid = total if req_status == "Finalizat" else 0
    payments = [{"amount": total, "date": body.date or now_iso(), "note": "Incasat integral"}] if paid else []
    order = {"id": new_id(), "document_no": document_no,
             "organization_id": org_id_of(user),
             "collaborator_id": collab["id"], "collaborator_name": collab["name"],
             "client_id": cl["id"], "client_name": cl["name"], "address": body.address or "",
             "lines": lines, "total": total, "paid": paid, "payments": payments,
             "status": _order_status(paid, total),
             "date": body.date or now_iso(), "created_at": now_iso(), "deleted_at": None}
    await db.orders.insert_one(order)
    await db.collaborators.update_one({"id": collab["id"]}, {"$set": {"stock": stock}})
    order.pop("_id", None)
    return order


class OrderUpdate(BaseModel):
    client_id: str
    lines: List[OrderLine]
    status: str = "In asteptare"
    date: Optional[str] = None


@api_router.put("/orders/{order_id}")
async def update_order(order_id: str, body: OrderUpdate, user=Depends(current_user)):
    existing = await db.orders.find_one(data_query(user, {"id": order_id}))
    if not existing:
        raise HTTPException(status_code=404, detail="Comanda negasita")
    collab = await db.collaborators.find_one({"id": existing["collaborator_id"], "deleted_at": None})
    if not collab:
        raise HTTPException(status_code=404, detail="Colaborator negasit")
    cl = await db.clients.find_one({"id": body.client_id, "deleted_at": None, "organization_id": org_id_of(user)})
    if not cl:
        raise HTTPException(status_code=404, detail="Client negasit")
    pmap = await _products_map(org_id_of(user))
    stock = dict(collab.get("stock", {}))
    # restore old line quantities
    for ln in existing["lines"]:
        stock[ln["product_id"]] = stock.get(ln["product_id"], 0) + ln["qty"]
    # build new lines and apply decrements
    lines = []
    total = 0
    for ln in body.lines:
        if ln.qty <= 0:
            continue
        p = pmap.get(ln.product_id)
        if not p:
            raise HTTPException(status_code=400, detail=f"Produs invalid: {ln.product_id}")
        subtotal = p["price"] * ln.qty
        total += subtotal
        lines.append({"product_id": p["id"], "label": p["label"], "size": p["size"],
                      "price": p["price"], "qty": ln.qty, "subtotal": subtotal})
        stock[p["id"]] = stock.get(p["id"], 0) - ln.qty
    if not lines:
        raise HTTPException(status_code=400, detail="Comanda nu are produse")
    await db.collaborators.update_one({"id": collab["id"]}, {"$set": {"stock": stock}})
    req_status = body.status if body.status in ("In asteptare", "Finalizat") else existing.get("status", "In asteptare")
    if req_status == "Finalizat":
        paid = total
    elif req_status == "In asteptare":
        paid = 0
    else:
        paid = min(existing.get("paid", 0), total)
    await db.orders.update_one({"id": order_id}, {"$set": {
        "client_id": cl["id"], "client_name": cl["name"], "lines": lines, "total": total,
        "paid": paid, "status": _order_status(paid, total),
        "date": body.date or existing["date"],
    }})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return updated


@api_router.patch("/orders/{order_id}/status")
async def update_status(order_id: str, body: StatusUpdate, user=Depends(current_user)):
    if body.status not in ("In asteptare", "Finalizat"):
        raise HTTPException(status_code=400, detail="Status invalid")
    o = await db.orders.find_one(data_query(user, {"id": order_id}))
    if not o:
        raise HTTPException(status_code=404, detail="Comanda negasita")
    total = o.get("total", 0)
    if body.status == "Finalizat":
        paid = total
        payments = list(o.get("payments", []))
        remaining = total - o.get("paid", 0)
        if remaining > 0:
            payments.append({"amount": remaining, "date": now_iso(), "note": "Incasat integral"})
    else:
        paid = 0
        payments = []
    await db.orders.update_one({"id": order_id}, {"$set": {"status": _order_status(paid, total), "paid": paid, "payments": payments}})
    return {"ok": True}


class PaymentCreate(BaseModel):
    amount: float
    note: Optional[str] = ""


@api_router.post("/orders/{order_id}/payments")
async def add_payment(order_id: str, body: PaymentCreate, user=Depends(current_user)):
    o = await db.orders.find_one(data_query(user, {"id": order_id}))
    if not o:
        raise HTTPException(status_code=404, detail="Comanda negasita")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Suma trebuie sa fie pozitiva")
    total = o.get("total", 0)
    prev = o.get("paid", 0)
    remaining = total - prev
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="Comanda este deja incasata integral")
    amount = min(body.amount, remaining)
    paid = prev + amount
    payments = list(o.get("payments", []))
    payments.append({"amount": amount, "date": now_iso(), "note": body.note or ""})
    await db.orders.update_one({"id": order_id}, {"$set": {"paid": paid, "payments": payments, "status": _order_status(paid, total)}})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, user=Depends(current_user)):
    o = await db.orders.find_one(data_query(user, {"id": order_id}))
    if not o:
        raise HTTPException(status_code=404, detail="Comanda negasita")
    collab = await db.collaborators.find_one({"id": o["collaborator_id"]})
    if collab:
        stock = dict(collab.get("stock", {}))
        for ln in o["lines"]:
            stock[ln["product_id"]] = stock.get(ln["product_id"], 0) + ln["qty"]
        await db.collaborators.update_one({"id": collab["id"]}, {"$set": {"stock": stock}})
    await db.orders.update_one({"id": order_id}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Company fiscal profile + Invoicing (facturare stil Oblio)
# ---------------------------------------------------------------------------
class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    cui: Optional[str] = None
    reg_com: Optional[str] = None
    address: Optional[str] = None
    iban: Optional[str] = None
    bank: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    invoice_series: Optional[str] = None


@api_router.get("/company")
async def get_company(user=Depends(current_user)):
    org = await get_org(user)
    comp = dict(org.get("company", {}))
    comp["invoice_series"] = org.get("invoice_series", "NODE")
    return comp


@api_router.put("/company")
async def update_company(body: CompanyUpdate, user=Depends(require_parent)):
    org = await get_org(user)
    comp = dict(org.get("company", {}))
    sets = {}
    for k in ("name", "cui", "reg_com", "address", "iban", "bank", "phone", "email"):
        v = getattr(body, k)
        if v is not None:
            comp[k] = v.strip()
    sets["company"] = comp
    if body.invoice_series is not None:
        sets["invoice_series"] = body.invoice_series.strip() or "NODE"
    await db.organizations.update_one({"id": org_id_of(user)}, {"$set": sets})
    out = dict(comp)
    out["invoice_series"] = sets.get("invoice_series", org.get("invoice_series", "NODE"))
    return out


async def next_invoice_no(org_id: str, series: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"id": f"invoice:{org_id}:{series}"}, {"$inc": {"value": 1}}, upsert=True, return_document=True
    )
    return doc["value"] if doc and "value" in doc else 1


class InvoiceCreate(BaseModel):
    order_id: Optional[str] = None
    client_id: Optional[str] = None
    vat_rate: int = 19
    issue_date: Optional[str] = None
    due_days: int = 15


def _vat_split(gross: float, rate: int):
    net = round(gross / (1 + rate / 100.0), 2)
    vat = round(gross - net, 2)
    return net, vat


@api_router.get("/invoices")
async def list_invoices(user=Depends(current_user)):
    inv = await db.invoices.find(data_query(user), {"_id": 0}).sort("created_at", -1).to_list(5000)
    return inv


@api_router.get("/invoices/summary")
async def invoices_summary(user=Depends(current_user)):
    inv = await db.invoices.find(data_query(user), {"_id": 0}).to_list(5000)
    month = _month_key()
    m_inv = [i for i in inv if (i.get("issue_date") or "")[:7] == month]
    billed = sum(i["gross"] for i in inv)
    collected = sum(i.get("paid", 0) for i in inv)
    return {
        "count": len(inv), "billed_total": billed, "collected_total": collected,
        "outstanding_total": billed - collected,
        "billed_month": sum(i["gross"] for i in m_inv),
        "vat_month": sum(i["vat"] for i in m_inv),
        "unpaid_count": sum(1 for i in inv if i.get("status") != "Platita"),
    }


@api_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user=Depends(current_user)):
    inv = await db.invoices.find_one(data_query(user, {"id": invoice_id}), {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Factura negasita")
    return inv


@api_router.post("/invoices")
async def create_invoice(body: InvoiceCreate, user=Depends(current_user)):
    org = await get_org(user)
    if not body.order_id:
        raise HTTPException(status_code=400, detail="Lipseste comanda")
    order = await db.orders.find_one(data_query(user, {"id": body.order_id}))
    if not order:
        raise HTTPException(status_code=404, detail="Comanda negasita")
    existing = await db.invoices.find_one({"order_id": body.order_id, "organization_id": org_id_of(user), "deleted_at": None})
    if existing:
        raise HTTPException(status_code=409, detail=f"Comanda are deja factura {existing['number_full']}")
    client = await db.clients.find_one({"id": order["client_id"]}, {"_id": 0})
    rate = body.vat_rate if body.vat_rate in (0, 5, 9, 19) else 19
    gross = float(order["total"])
    net, vat = _vat_split(gross, rate)
    lines = []
    for ln in order["lines"]:
        l_net, l_vat = _vat_split(float(ln["subtotal"]), rate)
        lines.append({"label": ln["label"], "qty": ln["qty"], "unit_price": ln["price"],
                      "gross": ln["subtotal"], "net": l_net, "vat": l_vat})
    series = org.get("invoice_series", "NODE")
    number = await next_invoice_no(org_id_of(user), series)
    issue = (body.issue_date or now_iso())[:10]
    due = (datetime.fromisoformat(issue) + timedelta(days=max(0, body.due_days))).strftime("%Y-%m-%d")
    paid = float(order.get("paid", 0))
    status = "Platita" if paid >= gross else ("Partial" if paid > 0 else "Emisa")
    doc = {
        "id": new_id(), "organization_id": org_id_of(user),
        "collaborator_id": order["collaborator_id"], "collaborator_name": order.get("collaborator_name", ""),
        "order_id": order["id"], "order_no": order.get("document_no", ""),
        "series": series, "number": number, "number_full": f"{series}-{number:04d}",
        "issue_date": issue, "due_date": due, "vat_rate": rate,
        "client_id": order["client_id"], "client_name": order["client_name"],
        "client_cui": (client or {}).get("cui", ""), "client_address": (client or {}).get("address", ""),
        "company": org.get("company", {}),
        "lines": lines, "gross": gross, "net": net, "vat": vat,
        "paid": paid, "payments": list(order.get("payments", [])),
        "status": status, "created_at": now_iso(), "deleted_at": None,
    }
    await db.invoices.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.post("/invoices/{invoice_id}/payments")
async def invoice_payment(invoice_id: str, body: PaymentCreate, user=Depends(current_user)):
    inv = await db.invoices.find_one(data_query(user, {"id": invoice_id}))
    if not inv:
        raise HTTPException(status_code=404, detail="Factura negasita")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Suma trebuie sa fie pozitiva")
    remaining = inv["gross"] - inv.get("paid", 0)
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="Factura este deja incasata")
    amount = min(body.amount, remaining)
    paid = inv.get("paid", 0) + amount
    payments = list(inv.get("payments", []))
    payments.append({"amount": amount, "date": now_iso(), "note": body.note or ""})
    status = "Platita" if paid >= inv["gross"] else "Partial"
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"paid": paid, "payments": payments, "status": status}})
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


class InvoiceUpdate(BaseModel):
    vat_rate: Optional[int] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    client_name: Optional[str] = None
    client_cui: Optional[str] = None
    client_address: Optional[str] = None


@api_router.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, body: InvoiceUpdate, user=Depends(current_user)):
    inv = await db.invoices.find_one(data_query(user, {"id": invoice_id}))
    if not inv:
        raise HTTPException(status_code=404, detail="Factura negasita")
    sets = {}
    if body.vat_rate is not None:
        rate = body.vat_rate if body.vat_rate in (0, 5, 9, 19) else 19
        gross = float(inv["gross"])
        net, vat = _vat_split(gross, rate)
        lines = []
        for ln in inv.get("lines", []):
            l_net, l_vat = _vat_split(float(ln["gross"]), rate)
            lines.append({**ln, "net": l_net, "vat": l_vat})
        sets.update({"vat_rate": rate, "net": net, "vat": vat, "lines": lines})
    if body.issue_date is not None:
        sets["issue_date"] = body.issue_date[:10]
    if body.due_date is not None:
        sets["due_date"] = body.due_date[:10]
    if body.client_name is not None:
        sets["client_name"] = body.client_name.strip()
    if body.client_cui is not None:
        sets["client_cui"] = body.client_cui.strip()
    if body.client_address is not None:
        sets["client_address"] = body.client_address.strip()
    if sets:
        await db.invoices.update_one({"id": invoice_id}, {"$set": sets})
    return await db.invoices.find_one({"id": invoice_id}, {"_id": 0})


@api_router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, user=Depends(current_user)):
    res = await db.invoices.update_one(data_query(user, {"id": invoice_id}), {"$set": {"deleted_at": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Factura negasita")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api_router.get("/dashboard")
async def dashboard(period: str = "all", user=Depends(current_user)):
    all_orders = await db.orders.find(data_query(user), {"_id": 0}).to_list(10000)
    collabs = await db.collaborators.find(collab_query(user), {"_id": 0}).to_list(1000)
    pmap = await _products_map(org_id_of(user))

    today = now_iso()[:10]
    month = now_iso()[:7]
    if period == "today":
        orders = [o for o in all_orders if (o.get("date") or o.get("created_at") or "")[:10] == today]
    elif period == "month":
        orders = [o for o in all_orders if (o.get("date") or o.get("created_at") or "")[:7] == month]
    else:
        orders = all_orders

    total_sold = sum(ln["qty"] for o in orders for ln in o["lines"])
    collected = sum(o.get("paid", 0) for o in orders)
    pending = sum(o["total"] - o.get("paid", 0) for o in orders)

    by_category: Dict[str, dict] = {}
    by_product: Dict[str, dict] = {}
    for o in orders:
        for ln in o["lines"]:
            p = pmap.get(ln["product_id"], {})
            cat = p.get("category", "Alte produse")
            litri = liters_for(ln.get("size", "")) * ln["qty"]
            c = by_category.setdefault(cat, {"category": cat, "qty": 0, "value": 0})
            c["qty"] += ln["qty"]; c["value"] += ln["subtotal"]
            pr = by_product.setdefault(ln["product_id"], {"label": ln["label"], "buc": 0, "litri": 0.0, "value": 0})
            pr["buc"] += ln["qty"]; pr["litri"] += litri; pr["value"] += ln["subtotal"]

    total_stock = 0
    negatives = []
    low_stock = []
    threshold = await get_threshold()
    for c in collabs:
        for pid, q in c.get("stock", {}).items():
            total_stock += q
            p = pmap.get(pid, {})
            if q < 0:
                negatives.append({"collaborator": c["name"], "label": p.get("label", pid), "quantity": q})
            elif q <= threshold:
                low_stock.append({"collaborator": c["name"], "label": p.get("label", pid), "quantity": q})

    recent = sorted(orders, key=lambda o: o["created_at"], reverse=True)[:5]
    product_totals = sorted(by_product.values(), key=lambda x: x["value"], reverse=True)
    for pt in product_totals:
        pt["litri"] = round(pt["litri"], 1)
    return {"period": period, "total_sold": total_sold, "orders_count": len(orders), "total_stock": total_stock,
            "negative_count": len(negatives), "negatives": negatives,
            "low_stock_count": len(low_stock), "low_stock": low_stock, "low_stock_threshold": threshold,
            "collected": collected, "pending": pending,
            "collaborators_count": len(collabs), "recent_orders": recent,
            "by_category": sorted(by_category.values(), key=lambda x: x["value"], reverse=True),
            "product_totals": product_totals}


@api_router.get("/reports/monthly")
async def monthly_report(month: Optional[str] = None, user=Depends(current_user)):
    orders = await db.orders.find(data_query(user), {"_id": 0}).to_list(10000)
    months = sorted({(o.get("date") or "")[:7] for o in orders if o.get("date")}, reverse=True)
    if not month:
        month = months[0] if months else datetime.now(timezone.utc).strftime("%Y-%m")
    month_orders = [o for o in orders if (o.get("date") or "").startswith(month)]

    by_collab: Dict[str, dict] = {}
    by_product: Dict[str, dict] = {}
    for o in month_orders:
        key = o["collaborator_id"]
        c = by_collab.setdefault(key, {"name": o["collaborator_name"], "orders_count": 0,
                                       "total": 0, "collected": 0, "pending": 0})
        c["orders_count"] += 1
        c["total"] += o["total"]
        c["collected"] += o.get("paid", 0)
        c["pending"] += o["total"] - o.get("paid", 0)
        for ln in o["lines"]:
            p = by_product.setdefault(ln["product_id"], {"label": ln["label"], "qty": 0, "value": 0})
            p["qty"] += ln["qty"]
            p["value"] += ln["subtotal"]

    totals = {
        "orders_count": len(month_orders),
        "total": sum(o["total"] for o in month_orders),
        "collected": sum(o.get("paid", 0) for o in month_orders),
        "pending": sum(o["total"] - o.get("paid", 0) for o in month_orders),
        "items": sum(ln["qty"] for o in month_orders for ln in o["lines"]),
    }
    return {
        "month": month,
        "months": months,
        "per_collaborator": sorted(by_collab.values(), key=lambda x: x["total"], reverse=True),
        "products": sorted(by_product.values(), key=lambda x: x["value"], reverse=True),
        "totals": totals,
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
