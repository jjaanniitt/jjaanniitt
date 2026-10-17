"""Iteration 4 feature tests: client PUT/DELETE (edit/delete) + product barcode regression."""
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


class TestClientEditDelete:
    def test_setup_create_client(self, auth_client):
        # ensure pro for unrestricted ops
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        cid = _mod_shop_id(auth_client)
        assert cid, "MOD SHOP SRL must exist"
        state["collab_id"] = cid
        r = auth_client.post(f"{BASE_URL}/api/collaborators/{cid}/clients",
                             json={"name": "TEST_ClientA", "phone": "0711111111"})
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "TEST_ClientA"
        assert d["phone"] == "0711111111"
        state["client_id"] = d["id"]

    def test_put_updates_name_and_phone(self, auth_client):
        clid = state["client_id"]
        r = auth_client.put(f"{BASE_URL}/api/clients/{clid}",
                            json={"name": "TEST_ClientB", "phone": "0722222222"})
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "TEST_ClientB"
        assert d["phone"] == "0722222222"
        # Verify persistence via GET
        g = auth_client.get(f"{BASE_URL}/api/clients/{clid}").json()
        assert g["name"] == "TEST_ClientB"
        assert g["phone"] == "0722222222"

    def test_put_notes_update(self, auth_client):
        clid = state["client_id"]
        r = auth_client.put(f"{BASE_URL}/api/clients/{clid}",
                            json={"notes": "VIP client"})
        assert r.status_code == 200
        assert r.json()["notes"] == "VIP client"

    def test_name_change_propagates_to_orders(self, auth_client):
        """When client name changes, existing orders.client_name is updated."""
        cid = state["collab_id"]
        clid = state["client_id"]
        # Ensure sufficient stock
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "ocean-det-3l", "quantity": 100})
        # Create an order with the current name (TEST_ClientB)
        ro = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": clid,
            "lines": [{"product_id": "ocean-det-3l", "qty": 1}],
        })
        assert ro.status_code == 200, ro.text
        oid = ro.json()["id"]
        state["order_id"] = oid
        assert ro.json()["client_name"] == "TEST_ClientB"

        # Rename client
        auth_client.put(f"{BASE_URL}/api/clients/{clid}",
                        json={"name": "TEST_ClientRenamed"})
        # Fetch order
        o = auth_client.get(f"{BASE_URL}/api/orders/{oid}").json()
        assert o["client_name"] == "TEST_ClientRenamed", f"order client_name not synced: {o.get('client_name')}"

    def test_put_404_for_unknown_client(self, auth_client):
        r = auth_client.put(f"{BASE_URL}/api/clients/does-not-exist",
                            json={"name": "X"})
        assert r.status_code == 404

    def test_delete_soft_deletes_client_but_orders_remain(self, auth_client):
        cid = state["collab_id"]
        clid = state["client_id"]
        oid = state["order_id"]
        r = auth_client.delete(f"{BASE_URL}/api/clients/{clid}")
        assert r.status_code == 200

        # Client disappears from collaborator detail clients list
        detail = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        client_ids = [c["id"] for c in detail.get("clients", [])]
        assert clid not in client_ids, f"deleted client still present in list: {client_ids}"

        # GET /clients/{id} returns 404
        g = auth_client.get(f"{BASE_URL}/api/clients/{clid}")
        assert g.status_code == 404

        # But order remains in DB
        o = auth_client.get(f"{BASE_URL}/api/orders/{oid}")
        assert o.status_code == 200
        # Cleanup order
        auth_client.delete(f"{BASE_URL}/api/orders/{oid}")


class TestProductBarcodeRegression:
    def test_create_product_with_barcode(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/products",
                             json={"category": "TEST_BC4", "size": "2L", "price": 15,
                                   "barcode": "5555000011112"})
        assert r.status_code == 200
        d = r.json()
        assert d["barcode"] == "5555000011112"
        assert d["price"] == 15
        # Verify in list
        items = auth_client.get(f"{BASE_URL}/api/products").json()
        p = next(x for x in items if x["id"] == d["id"])
        assert p["barcode"] == "5555000011112"
        state["bc_product_id"] = d["id"]

    def test_create_product_without_barcode_ok(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/products",
                             json={"category": "TEST_NOBC4", "size": "1L", "price": 7})
        assert r.status_code == 200
        d = r.json()
        assert d["barcode"] in (None, "")
        state["nobc_product_id"] = d["id"]

    def test_put_product_sets_barcode_and_price(self, auth_client):
        pid = state["bc_product_id"]
        r = auth_client.put(f"{BASE_URL}/api/products/{pid}",
                            json={"barcode": "7777000011118", "price": 25})
        assert r.status_code == 200
        d = r.json()
        assert d["barcode"] == "7777000011118"
        assert d["price"] == 25


class TestRegressionCore:
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

    def test_collaborators_list(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/collaborators")
        assert r.status_code == 200
        names = [c["name"] for c in r.json()]
        assert "MOD SHOP SRL" in names

    def test_subscription_plans_shape(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/subscription")
        assert r.status_code == 200
        d = r.json()
        assert set(d["plans"].keys()) == {"free", "basic", "avansat", "pro"}
        assert d["plans"]["free"]["max_partners"] == 1
        assert d["plans"]["free"]["max_orders_month"] == 20

    def test_reports_monthly(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/reports/monthly")
        assert r.status_code == 200
        # endpoint should return a list or dict
        assert isinstance(r.json(), (list, dict))


class TestCleanupIter4:
    def test_cleanup(self, auth_client):
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        # Products (bc and nobc) - no delete endpoint for products, leave as-is
        # Confirm MOD SHOP remains
        collabs = auth_client.get(f"{BASE_URL}/api/collaborators").json()
        names = [c["name"] for c in collabs]
        assert "MOD SHOP SRL" in names
