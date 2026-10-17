from fastapi import FastAPI, APIRouter, Depends, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt

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


class CollaboratorCreate(BaseModel):
    name: str
    notes: Optional[str] = ""


class ClientCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    notes: Optional[str] = ""


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
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "id": new_id(), "email": ADMIN_EMAIL, "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin", "created_at": now_iso(),
        })
    for p in CATALOG:
        await db.products.update_one({"id": p["id"]}, {"$set": {**p, "label": product_label(p)}}, upsert=True)
    meta = await db.meta.find_one({"id": "seed"})
    if not meta:
        await db.collaborators.insert_one({
            "id": new_id(), "name": "MOD SHOP SRL", "notes": "", "stock": dict(INITIAL_MODSHOP_STOCK),
            "created_at": now_iso(), "deleted_at": None,
        })
        await db.meta.insert_one({"id": "seed", "done": True, "created_at": now_iso()})
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
    return {"access_token": token, "token_type": "bearer", "user": {"id": user["id"], "email": user["email"]}}


@api_router.get("/me")
async def me(user=Depends(current_user)):
    return user


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
@api_router.get("/products")
async def list_products(user=Depends(current_user)):
    items = await db.products.find({}, {"_id": 0}).sort("order", 1).to_list(1000)
    return items


async def _products_map() -> Dict[str, dict]:
    items = await db.products.find({}, {"_id": 0}).to_list(1000)
    return {p["id"]: p for p in items}


# ---------------------------------------------------------------------------
# Collaborators
# ---------------------------------------------------------------------------
async def _collab_totals(collab: dict) -> dict:
    stock = collab.get("stock", {})
    total_stock = sum(stock.values())
    negatives = [pid for pid, q in stock.items() if q < 0]
    orders = await db.orders.find({"collaborator_id": collab["id"], "deleted_at": None}, {"_id": 0}).to_list(5000)
    collected = sum(o["total"] for o in orders if o["status"] == "Finalizat")
    pending = sum(o["total"] for o in orders if o["status"] != "Finalizat")
    return {"total_stock": total_stock, "negative_count": len(negatives),
            "orders_count": len(orders), "collected": collected, "pending": pending}


@api_router.get("/collaborators")
async def list_collaborators(user=Depends(current_user)):
    collabs = await db.collaborators.find({"deleted_at": None}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    out = []
    for c in collabs:
        out.append({**c, **(await _collab_totals(c))})
    return out


@api_router.post("/collaborators")
async def create_collaborator(body: CollaboratorCreate, user=Depends(current_user)):
    stock = {p["id"]: 0 for p in CATALOG}
    doc = {"id": new_id(), "name": body.name.strip(), "notes": body.notes or "", "stock": stock,
           "created_at": now_iso(), "deleted_at": None}
    await db.collaborators.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, **(await _collab_totals(doc))}


def _stock_list(collab: dict, pmap: Dict[str, dict]) -> list:
    stock = collab.get("stock", {})
    return [{**p, "quantity": stock.get(p["id"], 0)} for p in sorted(pmap.values(), key=lambda x: x["order"])]


@api_router.get("/collaborators/{collab_id}")
async def get_collaborator(collab_id: str, user=Depends(current_user)):
    collab = await db.collaborators.find_one({"id": collab_id, "deleted_at": None}, {"_id": 0})
    if not collab:
        raise HTTPException(status_code=404, detail="Colaborator negasit")
    pmap = await _products_map()
    totals = await _collab_totals(collab)
    clients = await db.clients.find({"collaborator_id": collab_id, "deleted_at": None}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    client_rows = []
    for cl in clients:
        c_orders = await db.orders.find({"client_id": cl["id"], "deleted_at": None}, {"_id": 0}).to_list(2000)
        client_rows.append({**cl, "orders_count": len(c_orders),
                            "collected": sum(o["total"] for o in c_orders if o["status"] == "Finalizat"),
                            "pending": sum(o["total"] for o in c_orders if o["status"] != "Finalizat")})
    orders = await db.orders.find({"collaborator_id": collab_id, "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {**collab, **totals, "stock_rows": _stock_list(collab, pmap), "clients": client_rows, "orders": orders}


@api_router.delete("/collaborators/{collab_id}")
async def delete_collaborator(collab_id: str, user=Depends(current_user)):
    await db.collaborators.update_one({"id": collab_id}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


@api_router.put("/collaborators/{collab_id}/stock")
async def adjust_stock(collab_id: str, body: StockAdjust, user=Depends(current_user)):
    collab = await db.collaborators.find_one({"id": collab_id, "deleted_at": None})
    if not collab:
        raise HTTPException(status_code=404, detail="Colaborator negasit")
    await db.collaborators.update_one({"id": collab_id}, {"$set": {f"stock.{body.product_id}": body.quantity}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------
@api_router.post("/collaborators/{collab_id}/clients")
async def create_client(collab_id: str, body: ClientCreate, user=Depends(current_user)):
    collab = await db.collaborators.find_one({"id": collab_id, "deleted_at": None})
    if not collab:
        raise HTTPException(status_code=404, detail="Colaborator negasit")
    doc = {"id": new_id(), "collaborator_id": collab_id, "collaborator_name": collab["name"],
           "name": body.name.strip(), "phone": body.phone or "", "notes": body.notes or "",
           "created_at": now_iso(), "deleted_at": None}
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, "orders_count": 0, "collected": 0, "pending": 0}


@api_router.get("/clients/{client_id}")
async def get_client(client_id: str, user=Depends(current_user)):
    cl = await db.clients.find_one({"id": client_id, "deleted_at": None}, {"_id": 0})
    if not cl:
        raise HTTPException(status_code=404, detail="Client negasit")
    orders = await db.orders.find({"client_id": client_id, "deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {**cl, "orders": orders, "orders_count": len(orders),
            "collected": sum(o["total"] for o in orders if o["status"] == "Finalizat"),
            "pending": sum(o["total"] for o in orders if o["status"] != "Finalizat")}


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user=Depends(current_user)):
    await db.clients.update_one({"id": client_id}, {"$set": {"deleted_at": now_iso()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------
@api_router.get("/orders")
async def list_orders(status: Optional[str] = None, collaborator_id: Optional[str] = None, user=Depends(current_user)):
    q = {"deleted_at": None}
    if status:
        q["status"] = status
    if collaborator_id:
        q["collaborator_id"] = collaborator_id
    return await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user=Depends(current_user)):
    o = await db.orders.find_one({"id": order_id, "deleted_at": None}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Comanda negasita")
    return o


@api_router.post("/orders")
async def create_order(body: OrderCreate, user=Depends(current_user)):
    collab = await db.collaborators.find_one({"id": body.collaborator_id, "deleted_at": None})
    if not collab:
        raise HTTPException(status_code=404, detail="Colaborator negasit")
    cl = await db.clients.find_one({"id": body.client_id, "deleted_at": None})
    if not cl:
        raise HTTPException(status_code=404, detail="Client negasit")
    pmap = await _products_map()
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
    order = {"id": new_id(), "document_no": document_no,
             "collaborator_id": collab["id"], "collaborator_name": collab["name"],
             "client_id": cl["id"], "client_name": cl["name"],
             "lines": lines, "total": total,
             "status": body.status if body.status in ("In asteptare", "Finalizat") else "In asteptare",
             "date": body.date or now_iso(), "created_at": now_iso(), "deleted_at": None}
    await db.orders.insert_one(order)
    await db.collaborators.update_one({"id": collab["id"]}, {"$set": {"stock": stock}})
    order.pop("_id", None)
    return order


@api_router.patch("/orders/{order_id}/status")
async def update_status(order_id: str, body: StatusUpdate, user=Depends(current_user)):
    if body.status not in ("In asteptare", "Finalizat"):
        raise HTTPException(status_code=400, detail="Status invalid")
    o = await db.orders.find_one({"id": order_id, "deleted_at": None})
    if not o:
        raise HTTPException(status_code=404, detail="Comanda negasita")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": body.status}})
    return {"ok": True}


@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, user=Depends(current_user)):
    o = await db.orders.find_one({"id": order_id, "deleted_at": None})
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
# Dashboard
# ---------------------------------------------------------------------------
@api_router.get("/dashboard")
async def dashboard(user=Depends(current_user)):
    orders = await db.orders.find({"deleted_at": None}, {"_id": 0}).to_list(10000)
    collabs = await db.collaborators.find({"deleted_at": None}, {"_id": 0}).to_list(1000)
    pmap = await _products_map()
    total_sold = sum(ln["qty"] for o in orders for ln in o["lines"])
    collected = sum(o["total"] for o in orders if o["status"] == "Finalizat")
    pending = sum(o["total"] for o in orders if o["status"] != "Finalizat")
    total_stock = 0
    negatives = []
    for c in collabs:
        for pid, q in c.get("stock", {}).items():
            total_stock += q
            if q < 0:
                p = pmap.get(pid, {})
                negatives.append({"collaborator": c["name"], "label": p.get("label", pid), "quantity": q})
    recent = sorted(orders, key=lambda o: o["created_at"], reverse=True)[:5]
    return {"total_sold": total_sold, "orders_count": len(orders), "total_stock": total_stock,
            "negative_count": len(negatives), "negatives": negatives, "collected": collected,
            "pending": pending, "collaborators_count": len(collabs), "recent_orders": recent}


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
