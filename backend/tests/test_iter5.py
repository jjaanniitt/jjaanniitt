"""Iteration 5: product DELETE + client PUT/DELETE + regression."""
import os
import pytest
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

state = {}


def _mod_shop_id(auth_client):
    collabs = auth_client.get(f"{BASE_URL}/api/collaborators").json()
    for c in collabs:
        if c["name"] == "MOD SHOP SRL":
            return c["id"]
    return collabs[0]["id"] if collabs else None


# ---------- Client PUT/DELETE ----------
class TestClientEditDelete:
    def test_setup(self, auth_client):
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        cid = _mod_shop_id(auth_client)
        assert cid
        state["collab_id"] = cid
        r = auth_client.post(f"{BASE_URL}/api/collaborators/{cid}/clients",
                             json={"name": "TEST_CL5", "phone": "0730000005", "notes": "init"})
        assert r.status_code == 200
        state["client_id"] = r.json()["id"]

    def test_put_updates_name_phone_notes(self, auth_client):
        clid = state["client_id"]
        r = auth_client.put(f"{BASE_URL}/api/clients/{clid}",
                            json={"name": "TEST_CL5_renamed", "phone": "0731111115", "notes": "VIP"})
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "TEST_CL5_renamed"
        assert d["phone"] == "0731111115"
        assert d["notes"] == "VIP"
        # Verify via GET
        g = auth_client.get(f"{BASE_URL}/api/clients/{clid}").json()
        assert g["name"] == "TEST_CL5_renamed"
        assert g["phone"] == "0731111115"
        assert g["notes"] == "VIP"

    def test_name_change_syncs_orders(self, auth_client):
        cid = state["collab_id"]
        clid = state["client_id"]
        # ensure stock
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "ocean-det-3l", "quantity": 50})
        ro = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": clid,
            "lines": [{"product_id": "ocean-det-3l", "qty": 1}],
            "address": "Str. Test 1", "date": "2026-01-15T10:00:00Z",
        })
        assert ro.status_code == 200, ro.text
        oid = ro.json()["id"]
        state["order_id"] = oid
        assert ro.json()["client_name"] == "TEST_CL5_renamed"
        assert ro.json()["address"] == "Str. Test 1"
        # Rename client -> orders.client_name must sync
        auth_client.put(f"{BASE_URL}/api/clients/{clid}", json={"name": "TEST_CL5_final"})
        o = auth_client.get(f"{BASE_URL}/api/orders/{oid}").json()
        assert o["client_name"] == "TEST_CL5_final"

    def test_delete_soft_deletes_client_orders_remain(self, auth_client):
        cid = state["collab_id"]
        clid = state["client_id"]
        oid = state["order_id"]
        r = auth_client.delete(f"{BASE_URL}/api/clients/{clid}")
        assert r.status_code == 200
        # Not in collaborator's clients list
        detail = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        assert clid not in [c["id"] for c in detail.get("clients", [])]
        # GET /clients/{id} -> 404
        assert auth_client.get(f"{BASE_URL}/api/clients/{clid}").status_code == 404
        # Order still accessible
        assert auth_client.get(f"{BASE_URL}/api/orders/{oid}").status_code == 200
        # Cleanup order
        auth_client.delete(f"{BASE_URL}/api/orders/{oid}")


# ---------- Product DELETE (new) ----------
class TestProductDelete:
    def test_create_custom_product(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/products",
                             json={"category": "TEST_DEL5", "size": "1L", "price": 10,
                                   "barcode": "9999000055555"})
        assert r.status_code == 200
        d = r.json()
        state["prod_id"] = d["id"]
        assert d["barcode"] == "9999000055555"
        assert d["price"] == 10
        # Visible in list
        items = auth_client.get(f"{BASE_URL}/api/products").json()
        assert any(p["id"] == d["id"] for p in items)
        state["count_before_delete"] = len(items)

    def test_put_price_barcode(self, auth_client):
        pid = state["prod_id"]
        r = auth_client.put(f"{BASE_URL}/api/products/{pid}",
                            json={"price": 22, "barcode": "8888000066666"})
        assert r.status_code == 200
        d = r.json()
        assert d["price"] == 22
        assert d["barcode"] == "8888000066666"

    def test_delete_product_removes_from_list(self, auth_client):
        pid = state["prod_id"]
        r = auth_client.delete(f"{BASE_URL}/api/products/{pid}")
        assert r.status_code == 200
        assert r.json().get("ok") is True
        items = auth_client.get(f"{BASE_URL}/api/products").json()
        assert not any(p["id"] == pid for p in items), "Deleted product still returned"
        assert len(items) == state["count_before_delete"] - 1

    def test_delete_product_excluded_from_collab_stock_rows(self, auth_client):
        """After delete, collaborator stock_rows must not include deleted product."""
        cid = _mod_shop_id(auth_client)
        detail = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        pid = state["prod_id"]
        assert not any(row["id"] == pid for row in detail.get("stock_rows", [])), \
            "deleted product still appears in collaborator stock_rows"

    def test_delete_unknown_returns_404(self, auth_client):
        r = auth_client.delete(f"{BASE_URL}/api/products/nope-does-not-exist")
        assert r.status_code == 404

    def test_delete_idempotent_safe(self, auth_client):
        """Re-deleting an already soft-deleted product: Mongo matched_count=1 still, so returns ok (not 404)."""
        pid = state["prod_id"]
        r = auth_client.delete(f"{BASE_URL}/api/products/{pid}")
        # product doc still exists (soft-deleted), so matched_count=1 -> ok
        assert r.status_code == 200


# ---------- Regression ----------
class TestRegression:
    def test_login(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": os.environ.get("ADMIN_EMAIL", "detergentzilnic@gmail.com"),
                                  "password": os.environ.get("ADMIN_PASSWORD", "Zilnic2026!")})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_dashboard_periods(self, auth_client):
        for p in ("today", "month", "all"):
            r = auth_client.get(f"{BASE_URL}/api/dashboard?period={p}")
            assert r.status_code == 200
            assert r.json()["period"] == p

    def test_subscription_plans(self, auth_client):
        d = auth_client.get(f"{BASE_URL}/api/subscription").json()
        assert set(d["plans"].keys()) == {"free", "basic", "avansat", "pro"}
        assert d["plans"]["free"]["max_partners"] == 1
        assert d["plans"]["free"]["max_orders_month"] == 20
        assert d["plans"]["pro"]["max_partners"] is None

    def test_reports_monthly(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/reports/monthly")
        assert r.status_code == 200
        d = r.json()
        assert "month" in d and "totals" in d

    def test_consignment_increments_stock(self, auth_client):
        cid = _mod_shop_id(auth_client)
        before = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        qb = next((r["quantity"] for r in before["stock_rows"] if r["id"] == "vase-1l"), 0)
        r = auth_client.post(f"{BASE_URL}/api/collaborators/{cid}/consignments",
                             json={"pv_number": "PV-TEST-5", "items": [{"product_id": "vase-1l", "qty": 3}]})
        assert r.status_code == 200
        after = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        qa = next((r["quantity"] for r in after["stock_rows"] if r["id"] == "vase-1l"), 0)
        assert qa == qb + 3


class TestCleanup:
    def test_cleanup(self, auth_client):
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
