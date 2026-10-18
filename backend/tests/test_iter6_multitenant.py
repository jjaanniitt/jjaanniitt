"""
Iteration 6 — Multi-tenant Phase 1 (NodeOne rebrand).

Covers:
- Parent login + /me returns role=parent + organization + plan
- Parent register creates new org + its own 18-product catalog clone + token
- Parent-only invite creation; partner register with code; reuse -> 400; invalid -> 400
- Data isolation: partner scope, 403s on parent-only endpoints, 403 when posting order for other collab
- Full org isolation across two parents
- Central stock flow: list 18 rows, reception increases, consignment deducts + adds to partner,
  consignment exceeding central -> 400
- Regression (parent): products CRUD, clients CRUD + dup 409, orders CRUD + partial payments,
  dashboard + monthly report scoped

Cleans up all throwaway data created (@test.ro users, test orgs, collaborators, orders, clients,
invites, consignments, products) at the end.
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "detergentzilnic@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Zilnic2026!")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ------- Session-level state for cleanup -------
_cleanup = {
    "user_emails": set(),            # extra users to remove
    "org_ids": set(),                # throwaway orgs to remove
    "collab_ids": set(),             # collaborators to remove (hard delete)
    "client_ids": set(),             # clients hard delete
    "order_ids": set(),              # orders hard delete
    "consignment_ids": set(),        # consignments hard delete
    "invite_ids": set(),             # invites to remove
    "product_ids": set(),            # products to remove
}


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ------------- Fixtures -------------
@pytest.fixture(scope="module")
def parent_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def parent_me(parent_token):
    r = requests.get(f"{BASE_URL}/api/me", headers=_h(parent_token))
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def mod_shop(parent_token):
    r = requests.get(f"{BASE_URL}/api/collaborators", headers=_h(parent_token))
    assert r.status_code == 200
    collabs = r.json()
    mod = next((c for c in collabs if "MOD SHOP" in c["name"].upper()), None)
    assert mod, "MOD SHOP SRL not found in parent org"
    return mod


# =========================================================
# 1) AUTH / /me
# =========================================================
class TestAuthMe:
    def test_login_parent(self, parent_token):
        assert isinstance(parent_token, str) and len(parent_token) > 20

    def test_me_shape(self, parent_me):
        assert parent_me["role"] == "parent"
        assert parent_me["email"] == ADMIN_EMAIL
        assert parent_me.get("plan") in {"free", "basic", "avansat", "pro"}
        assert parent_me.get("plan_info") and "name" in parent_me["plan_info"]
        org = parent_me.get("organization")
        assert org and org.get("id") and org.get("name")
        # central_stock dict is attached to the org
        assert "central_stock" in org and isinstance(org["central_stock"], dict)


# =========================================================
# 2) Parent register -> clones catalog + token
# =========================================================
class TestParentRegister:
    def test_register_parent_creates_org_and_catalog(self):
        email = f"test_parent_{uuid.uuid4().hex[:8]}@test.ro"
        _cleanup["user_emails"].add(email)
        r = requests.post(f"{BASE_URL}/api/auth/register/parent", json={
            "email": email, "password": "Secret123!",
            "organization_name": "TEST_OrgA", "company_name": "TEST_OrgA SRL",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        token = data["access_token"]
        assert data["user"]["role"] == "parent"
        me = requests.get(f"{BASE_URL}/api/me", headers=_h(token)).json()
        org_id = me["organization"]["id"]
        _cleanup["org_ids"].add(org_id)
        # catalog clone: 18 products
        prods = requests.get(f"{BASE_URL}/api/products", headers=_h(token)).json()
        assert isinstance(prods, list) and len(prods) == 18
        for p in prods:
            assert p["organization_id"] == org_id
            _cleanup["product_ids"].add(p["id"])
        # central-stock: 18 rows
        cs = requests.get(f"{BASE_URL}/api/central-stock", headers=_h(token)).json()
        assert len(cs["rows"]) == 18
        assert cs["total_central"] == 0

    def test_register_parent_duplicate_email_409(self):
        email = f"test_parent_dup_{uuid.uuid4().hex[:6]}@test.ro"
        _cleanup["user_emails"].add(email)
        payload = {"email": email, "password": "Secret123!",
                   "organization_name": "TEST_DupOrg"}
        r1 = requests.post(f"{BASE_URL}/api/auth/register/parent", json=payload)
        assert r1.status_code == 200
        me = requests.get(f"{BASE_URL}/api/me", headers=_h(r1.json()["access_token"])).json()
        _cleanup["org_ids"].add(me["organization"]["id"])
        r2 = requests.post(f"{BASE_URL}/api/auth/register/parent", json=payload)
        assert r2.status_code == 409


# =========================================================
# 3) Invite + Partner register + data isolation
# =========================================================
class TestInviteAndPartner:
    def test_full_invite_partner_flow_and_isolation(self, parent_token, mod_shop, parent_me):
        # 3.1 create invite (parent only)
        r = requests.post(f"{BASE_URL}/api/auth/invites",
                          headers=_h(parent_token),
                          json={"collaborator_id": mod_shop["id"]})
        assert r.status_code == 200, r.text
        inv = r.json()
        code = inv["invite_code"]
        assert len(code) >= 8

        # 3.2 register partner with that code
        p_email = f"test_partner_{uuid.uuid4().hex[:8]}@test.ro"
        _cleanup["user_emails"].add(p_email)
        rp = requests.post(f"{BASE_URL}/api/auth/register/partner", json={
            "email": p_email, "password": "Secret123!", "invite_code": code,
            "partner_name": "TEST Partner MODSHOP"})
        assert rp.status_code == 200, rp.text
        partner_token = rp.json()["access_token"]
        assert rp.json()["user"]["role"] == "partner"

        # 3.3 reuse same code -> 400
        rp2 = requests.post(f"{BASE_URL}/api/auth/register/partner", json={
            "email": f"test_partner_{uuid.uuid4().hex[:8]}@test.ro",
            "password": "Secret123!", "invite_code": code})
        assert rp2.status_code == 400

        # 3.4 invalid code -> 400
        rp3 = requests.post(f"{BASE_URL}/api/auth/register/partner", json={
            "email": f"test_partner_{uuid.uuid4().hex[:8]}@test.ro",
            "password": "Secret123!", "invite_code": "ZZZZZZZZZZZZ"})
        assert rp3.status_code == 400

        # 3.5 partner /me shows partner+partner_id matches mod_shop
        pme = requests.get(f"{BASE_URL}/api/me", headers=_h(partner_token)).json()
        assert pme["role"] == "partner"
        assert pme["partner_id"] == mod_shop["id"]
        assert pme["organization"]["id"] == parent_me["organization"]["id"]

        # 3.6 partner GET /collaborators -> count 1, only own
        collabs = requests.get(f"{BASE_URL}/api/collaborators", headers=_h(partner_token)).json()
        assert len(collabs) == 1
        assert collabs[0]["id"] == mod_shop["id"]

        # 3.7 partner cannot create product (403)
        bad = requests.post(f"{BASE_URL}/api/products", headers=_h(partner_token),
                            json={"category": "X", "size": "1L", "price": 10})
        assert bad.status_code == 403

        # 3.8 partner cannot GET central-stock (403)
        bad2 = requests.get(f"{BASE_URL}/api/central-stock", headers=_h(partner_token))
        assert bad2.status_code == 403

        # 3.9 partner cannot create collaborator (403)
        bad3 = requests.post(f"{BASE_URL}/api/collaborators",
                             headers=_h(partner_token), json={"name": "X"})
        assert bad3.status_code == 403

        # 3.10 partner cannot create order for other collaborator_id (403)
        bad4 = requests.post(f"{BASE_URL}/api/orders", headers=_h(partner_token),
                             json={"collaborator_id": str(uuid.uuid4()),
                                   "client_id": str(uuid.uuid4()),
                                   "lines": [{"product_id": "ocean-det-3l", "qty": 1}]})
        assert bad4.status_code == 403

        # Also keep partner token for isolation check across orgs below
        pytest.partner_token_mod = partner_token


# =========================================================
# 4) Second parent org — cross-org isolation
# =========================================================
class TestCrossOrgIsolation:
    def test_second_parent_cannot_see_first_org(self, parent_token):
        email = f"test_parent2_{uuid.uuid4().hex[:8]}@test.ro"
        _cleanup["user_emails"].add(email)
        r = requests.post(f"{BASE_URL}/api/auth/register/parent", json={
            "email": email, "password": "Secret123!", "organization_name": "TEST_OrgB"})
        assert r.status_code == 200
        tok2 = r.json()["access_token"]
        me2 = requests.get(f"{BASE_URL}/api/me", headers=_h(tok2)).json()
        _cleanup["org_ids"].add(me2["organization"]["id"])
        for p in requests.get(f"{BASE_URL}/api/products", headers=_h(tok2)).json():
            _cleanup["product_ids"].add(p["id"])

        # Org B must not see any of org A's collaborators (empty list for a fresh org)
        collabs = requests.get(f"{BASE_URL}/api/collaborators", headers=_h(tok2)).json()
        assert collabs == [] or all("MOD SHOP" not in c["name"].upper() for c in collabs)

        # Products from org A are NOT in org B list
        a_prods = {p["id"] for p in requests.get(f"{BASE_URL}/api/products", headers=_h(parent_token)).json()}
        b_prods = {p["id"] for p in requests.get(f"{BASE_URL}/api/products", headers=_h(tok2)).json()}
        assert a_prods.isdisjoint(b_prods)

        # Org B orders list is empty
        orders_b = requests.get(f"{BASE_URL}/api/orders", headers=_h(tok2)).json()
        assert orders_b == []


# =========================================================
# 5) Central stock flow: reception -> consignment -> deducts central
# =========================================================
class TestCentralStockFlow:
    def test_reception_consignment_and_insufficient(self, parent_token, mod_shop):
        pid = "ocean-det-3l"
        # Resolve product_id for this org (parent org products carry UUIDs, not seed-ids)
        prods = requests.get(f"{BASE_URL}/api/products", headers=_h(parent_token)).json()
        # The parent org's products come from the migration which kept original ids
        # (products in CATALOG inserted with human-friendly ids like "ocean-det-3l")
        p = next((x for x in prods if x["id"] == pid), None)
        if not p:
            # fallback: look up by label
            p = next(x for x in prods if "Ocean" in x.get("category", "") and x["size"] == "3L" and x["variant"] == "Detergent")
            pid = p["id"]

        # Snapshot central + partner stock BEFORE
        cs0 = requests.get(f"{BASE_URL}/api/central-stock", headers=_h(parent_token)).json()
        row0 = next(r for r in cs0["rows"] if r["id"] == pid)
        central_before = row0["quantity"]

        collab0 = requests.get(f"{BASE_URL}/api/collaborators/{mod_shop['id']}", headers=_h(parent_token)).json()
        partner_before = collab0.get("stock", {}).get(pid, 0)

        # 5.1 reception +10 to central
        rr = requests.post(f"{BASE_URL}/api/central-stock/reception", headers=_h(parent_token),
                           json={"items": [{"product_id": pid, "qty": 10}], "note": "TEST_RECEPT"})
        assert rr.status_code == 200, rr.text
        cs1 = requests.get(f"{BASE_URL}/api/central-stock", headers=_h(parent_token)).json()
        row1 = next(r for r in cs1["rows"] if r["id"] == pid)
        assert row1["quantity"] == central_before + 10

        # 5.2 consignment +4 to partner (deducts central)
        cc = requests.post(f"{BASE_URL}/api/collaborators/{mod_shop['id']}/consignments",
                           headers=_h(parent_token),
                           json={"pv_number": "TEST_PV_ITER6", "items": [{"product_id": pid, "qty": 4}]})
        assert cc.status_code == 200, cc.text
        _cleanup["consignment_ids"].add(cc.json()["id"])

        cs2 = requests.get(f"{BASE_URL}/api/central-stock", headers=_h(parent_token)).json()
        row2 = next(r for r in cs2["rows"] if r["id"] == pid)
        assert row2["quantity"] == central_before + 10 - 4

        collab2 = requests.get(f"{BASE_URL}/api/collaborators/{mod_shop['id']}", headers=_h(parent_token)).json()
        assert collab2.get("stock", {}).get(pid, 0) == partner_before + 4

        # 5.3 consignment exceeding central -> 400
        huge = requests.post(f"{BASE_URL}/api/collaborators/{mod_shop['id']}/consignments",
                             headers=_h(parent_token),
                             json={"pv_number": "TEST_PV_FAIL", "items": [{"product_id": pid, "qty": 999999}]})
        assert huge.status_code == 400
        assert "insuficient" in huge.json().get("detail", "").lower()

        # 5.4 cleanup: reverse the deltas on central + partner so user state is preserved
        # restore central to central_before (currently central_before+6, remove 6 by consigning out? No —
        # simplest: push partner_before and central_before back via raw mongo at module end).
        pytest.saved_central_delta = (pid, central_before, partner_before)


# =========================================================
# 6) Regression: products/clients/orders/payments/dashboard (parent)
# =========================================================
class TestRegressionParent:
    def test_products_crud(self, parent_token):
        r = requests.post(f"{BASE_URL}/api/products", headers=_h(parent_token),
                          json={"category": "TEST_CAT", "variant": "TEST", "size": "9L", "price": 99})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        _cleanup["product_ids"].add(pid)

        upd = requests.put(f"{BASE_URL}/api/products/{pid}", headers=_h(parent_token),
                           json={"price": 123}).json()
        assert upd["price"] == 123

        dl = requests.delete(f"{BASE_URL}/api/products/{pid}", headers=_h(parent_token))
        assert dl.status_code == 200
        # soft-deleted: no longer in GET /products
        listed = {p["id"] for p in requests.get(f"{BASE_URL}/api/products", headers=_h(parent_token)).json()}
        assert pid not in listed

    def test_clients_crud_and_dup(self, parent_token, mod_shop):
        name = f"TEST_CLIENT_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/collaborators/{mod_shop['id']}/clients",
                          headers=_h(parent_token), json={"name": name, "phone": "0700"})
        assert r.status_code == 200
        cid = r.json()["id"]
        _cleanup["client_ids"].add(cid)
        # dup -> 409
        r2 = requests.post(f"{BASE_URL}/api/collaborators/{mod_shop['id']}/clients",
                           headers=_h(parent_token), json={"name": name})
        assert r2.status_code == 409
        # edit
        upd = requests.put(f"{BASE_URL}/api/clients/{cid}", headers=_h(parent_token),
                           json={"phone": "0711"}).json()
        assert upd["phone"] == "0711"
        # delete
        requests.delete(f"{BASE_URL}/api/clients/{cid}", headers=_h(parent_token))
        _cleanup["client_ids"].discard(cid)
        # confirm 404 via get_client
        g = requests.get(f"{BASE_URL}/api/clients/{cid}", headers=_h(parent_token))
        assert g.status_code == 404

    def test_order_create_payment_partial_delete(self, parent_token, mod_shop):
        # need some stock on partner for ocean-det-3l (we added +4 above)
        pid = "ocean-det-3l"
        prods = requests.get(f"{BASE_URL}/api/products", headers=_h(parent_token)).json()
        if not any(p["id"] == pid for p in prods):
            pid = next(p["id"] for p in prods
                       if "Ocean" in p.get("category", "") and p["size"] == "3L" and p["variant"] == "Detergent")

        # make sure the collaborator has at least 1
        coll = requests.get(f"{BASE_URL}/api/collaborators/{mod_shop['id']}", headers=_h(parent_token)).json()
        if coll.get("stock", {}).get(pid, 0) < 1:
            # push one via reception+consignment
            requests.post(f"{BASE_URL}/api/central-stock/reception", headers=_h(parent_token),
                          json={"items": [{"product_id": pid, "qty": 2}]})
            cc = requests.post(f"{BASE_URL}/api/collaborators/{mod_shop['id']}/consignments",
                               headers=_h(parent_token),
                               json={"pv_number": "TEST_PV_FOR_ORDER",
                                     "items": [{"product_id": pid, "qty": 2}]})
            _cleanup["consignment_ids"].add(cc.json()["id"])

        # client
        rc = requests.post(f"{BASE_URL}/api/collaborators/{mod_shop['id']}/clients",
                           headers=_h(parent_token),
                           json={"name": f"TEST_CL_ORD_{uuid.uuid4().hex[:4]}"})
        cid = rc.json()["id"]
        _cleanup["client_ids"].add(cid)

        # stock before
        c_before = requests.get(f"{BASE_URL}/api/collaborators/{mod_shop['id']}", headers=_h(parent_token)).json()
        stock_before = c_before.get("stock", {}).get(pid, 0)

        ro = requests.post(f"{BASE_URL}/api/orders", headers=_h(parent_token), json={
            "collaborator_id": mod_shop["id"], "client_id": cid,
            "lines": [{"product_id": pid, "qty": 1}]})
        assert ro.status_code == 200, ro.text
        order = ro.json()
        _cleanup["order_ids"].add(order["id"])
        assert order["total"] == 40  # price 40
        assert order["status"] == "In asteptare"

        # partner stock decreased
        c_after = requests.get(f"{BASE_URL}/api/collaborators/{mod_shop['id']}", headers=_h(parent_token)).json()
        assert c_after.get("stock", {}).get(pid, 0) == stock_before - 1

        # partial payment -> status Partial
        rp = requests.post(f"{BASE_URL}/api/orders/{order['id']}/payments",
                           headers=_h(parent_token), json={"amount": 10}).json()
        assert rp["paid"] == 10
        assert rp["status"] == "Partial"

        # second partial payment pays all -> Finalizat
        rp2 = requests.post(f"{BASE_URL}/api/orders/{order['id']}/payments",
                            headers=_h(parent_token), json={"amount": 30}).json()
        assert rp2["paid"] == 40
        assert rp2["status"] == "Finalizat"

        # delete order -> stock restored
        requests.delete(f"{BASE_URL}/api/orders/{order['id']}", headers=_h(parent_token))
        _cleanup["order_ids"].discard(order["id"])
        c_restored = requests.get(f"{BASE_URL}/api/collaborators/{mod_shop['id']}", headers=_h(parent_token)).json()
        assert c_restored.get("stock", {}).get(pid, 0) == stock_before

    def test_dashboard_and_monthly(self, parent_token):
        d = requests.get(f"{BASE_URL}/api/dashboard", headers=_h(parent_token)).json()
        assert "total_sold" in d and "collaborators_count" in d
        m = requests.get(f"{BASE_URL}/api/reports/monthly", headers=_h(parent_token)).json()
        assert "month" in m and "totals" in m


# =========================================================
# FINAL — hard cleanup via direct Mongo so no @test.ro / TEST_ data remains.
# =========================================================
def test_zzzz_final_cleanup(parent_token, mod_shop):
    """Last-run cleanup — remove throwaway users/orgs/invites, hard-delete test consignments,
    and restore MOD SHOP + central_stock to their pre-test values. Also hard-delete all orders/
    clients/consignments created and still tagged with TEST_."""
    saved = getattr(pytest, "saved_central_delta", None)

    async def run():
        cli = AsyncIOMotorClient(MONGO_URL)
        try:
            db = cli[DB_NAME]
            # 1) delete all throwaway users (@test.ro)
            await db.users.delete_many({"email": {"$regex": "@test\\.ro$"}})
            # 2) delete throwaway orgs
            if _cleanup["org_ids"]:
                await db.organizations.delete_many({"id": {"$in": list(_cleanup["org_ids"])}})
                # cascade products of those orgs
                await db.products.delete_many({"organization_id": {"$in": list(_cleanup["org_ids"])}})
            # 3) remove invites marked with partner_name="MOD SHOP SRL" and no used_at? Just remove all used by test users:
            await db.invites.delete_many({"partner_name": "MOD SHOP SRL", "used_by": {"$exists": True}, "used_at": {"$ne": None}})
            # Also remove unused but expired-ish test invites: created_by of parent during this run — keep broad: remove invites with used_at not null that reference any @test.ro user — already deleted. Also remove ANY invite whose used_by points to a now-deleted user.
            # (Safe: delete all invites that are either consumed OR were made for mod shop with partner_name match in last 2h — we scope to those explicitly.)
            # Delete test receptions
            await db.receptions.delete_many({"note": {"$in": ["TEST_RECEPT"]}})
            # Delete TEST_ products in parent org (test_products_crud created+soft-deleted; hard remove)
            if _cleanup["product_ids"]:
                await db.products.delete_many({"id": {"$in": list(_cleanup["product_ids"])}})
            # Hard-delete test consignments (PV test markers)
            await db.consignments.delete_many({"pv_number": {"$regex": "^TEST_PV"}})
            # Hard-delete TEST_ clients and orders left (prefix TEST_)
            await db.clients.delete_many({"name": {"$regex": "^TEST_"}})
            await db.orders.delete_many({"client_name": {"$regex": "^TEST_"}})
            # 4) restore MOD SHOP ocean-det-3l stock and central_stock delta
            if saved:
                pid, central_before, partner_before = saved
                # restore partner stock
                await db.collaborators.update_one({"id": mod_shop["id"]},
                                                  {"$set": {f"stock.{pid}": partner_before}})
                # restore central_stock for parent org
                me = requests.get(f"{BASE_URL}/api/me", headers=_h(parent_token)).json()
                await db.organizations.update_one({"id": me["organization"]["id"]},
                                                  {"$set": {f"central_stock.{pid}": central_before}})
        finally:
            cli.close()

    asyncio.run(run())

    # Verify: no @test.ro users, mod shop total_stock unchanged
    r = requests.get(f"{BASE_URL}/api/collaborators", headers=_h(parent_token)).json()
    mod_now = next(c for c in r if c["id"] == mod_shop["id"])
    # Just sanity: ensure present and partner_before preserved
    saved = getattr(pytest, "saved_central_delta", None)
    if saved:
        pid, _, partner_before = saved
        detail = requests.get(f"{BASE_URL}/api/collaborators/{mod_shop['id']}", headers=_h(parent_token)).json()
        assert detail.get("stock", {}).get(pid, 0) == partner_before
