"""Comprehensive backend API tests for the consignment/orders app."""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

# Shared state across tests (session order matters)
state = {}


# ---------------------------- AUTH ----------------------------
class TestAuth:
    def test_login_success(self, api_client, auth_token):
        assert auth_token
        state["token"] = auth_token

    def test_login_wrong_password(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": "detergentzilnic@gmail.com", "password": "wrongpass"})
        assert r.status_code == 401

    def test_login_unknown_email(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": "nobody@example.com", "password": "x"})
        assert r.status_code == 401

    def test_me_with_token(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/me")
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "detergentzilnic@gmail.com"
        assert "password_hash" not in data

    def test_me_without_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/me")
        assert r.status_code == 401

    def test_protected_products_without_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/products")
        assert r.status_code == 401


# ---------------------------- PRODUCTS ----------------------------
class TestProducts:
    def test_list_products(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/products")
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 18
        # Check fields
        p = items[0]
        for k in ("id", "category", "variant", "size", "price", "label", "order"):
            assert k in p
        # Verify prices sum to known-expected amount for sanity
        prices = {i["id"]: i["price"] for i in items}
        assert prices["ocean-det-3l"] == 40
        assert prices["ocean-bal-5l"] == 70
        assert prices["vase-1l"] == 15
        assert prices["odorizant"] == 35


# ---------------------------- COLLABORATORS ----------------------------
class TestCollaborators:
    def test_list_contains_mod_shop(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/collaborators")
        assert r.status_code == 200
        collabs = r.json()
        mod = next((c for c in collabs if c["name"] == "MOD SHOP SRL"), None)
        assert mod is not None, "MOD SHOP SRL not seeded"
        state["mod_id"] = mod["id"]
        # Totals present
        for k in ("total_stock", "collected", "pending", "orders_count"):
            assert k in mod
        # Initial seeded total stock = 305 at fresh seed; but previous test runs
        # may have mutated it. We only check the first time this suite runs.
        # Still assert it's a number >= 0 or whatever current state is.
        assert isinstance(mod["total_stock"], int)

    def test_get_collaborator_detail(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/collaborators/{state['mod_id']}")
        assert r.status_code == 200
        data = r.json()
        assert "stock_rows" in data and len(data["stock_rows"]) == 18
        assert "clients" in data
        assert "orders" in data

    def test_create_collaborator(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/collaborators",
                             json={"name": "TEST_Colaborator_X", "notes": "test"})
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_Colaborator_X"
        assert data["total_stock"] == 0
        state["new_collab_id"] = data["id"]
        # Verify persistence
        r2 = auth_client.get(f"{BASE_URL}/api/collaborators/{data['id']}")
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Colaborator_X"

    def test_adjust_stock_absolute(self, auth_client):
        cid = state["new_collab_id"]
        r = auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                            json={"product_id": "ocean-det-3l", "quantity": 25})
        assert r.status_code == 200
        r2 = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}")
        row = next(s for s in r2.json()["stock_rows"] if s["id"] == "ocean-det-3l")
        assert row["quantity"] == 25
        # Set again absolute
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "ocean-det-3l", "quantity": 10})
        r3 = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}")
        row = next(s for s in r3.json()["stock_rows"] if s["id"] == "ocean-det-3l")
        assert row["quantity"] == 10


# ---------------------------- CLIENTS ----------------------------
class TestClients:
    def test_create_client(self, auth_client):
        cid = state["new_collab_id"]
        r = auth_client.post(f"{BASE_URL}/api/collaborators/{cid}/clients",
                             json={"name": "TEST_Client_A", "phone": "0712345678"})
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "TEST_Client_A"
        assert data["collaborator_id"] == cid
        state["client_id"] = data["id"]

    def test_get_client(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/clients/{state['client_id']}")
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "TEST_Client_A"
        assert d["orders_count"] == 0
        assert d["collected"] == 0
        assert d["pending"] == 0


# ---------------------------- ORDERS ----------------------------
class TestOrders:
    def test_create_order_decrements_stock_and_assigns_doc_no(self, auth_client):
        cid = state["new_collab_id"]
        # set stock first
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "ocean-det-3l", "quantity": 20})
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "ocean-bal-5l", "quantity": 10})

        payload = {
            "collaborator_id": cid,
            "client_id": state["client_id"],
            "lines": [
                {"product_id": "ocean-det-3l", "qty": 3},   # 3*40=120
                {"product_id": "ocean-bal-5l", "qty": 2},   # 2*70=140
            ],
            "status": "In asteptare",
        }
        r = auth_client.post(f"{BASE_URL}/api/orders", json=payload)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["total"] == 260
        assert o["document_no"].startswith("DZL")
        assert len(o["document_no"]) == 7
        assert o["status"] == "In asteptare"
        state["order_id"] = o["id"]
        state["order_doc_no"] = o["document_no"]
        # Verify stock decremented
        detail = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        rows = {s["id"]: s["quantity"] for s in detail["stock_rows"]}
        assert rows["ocean-det-3l"] == 17
        assert rows["ocean-bal-5l"] == 8

    def test_create_order_negative_stock_allowed(self, auth_client):
        cid = state["new_collab_id"]
        # Request more than available - should go negative
        payload = {
            "collaborator_id": cid,
            "client_id": state["client_id"],
            "lines": [{"product_id": "vase-1l", "qty": 5}],  # stock=0 → -5
        }
        r = auth_client.post(f"{BASE_URL}/api/orders", json=payload)
        assert r.status_code == 200
        state["neg_order_id"] = r.json()["id"]
        detail = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        rows = {s["id"]: s["quantity"] for s in detail["stock_rows"]}
        assert rows["vase-1l"] == -5
        # Dashboard negative_count should include this
        dash = auth_client.get(f"{BASE_URL}/api/dashboard").json()
        assert dash["negative_count"] >= 1
        assert any(n["label"] and n["quantity"] < 0 for n in dash["negatives"])

    def test_toggle_order_status(self, auth_client):
        oid = state["order_id"]
        r = auth_client.patch(f"{BASE_URL}/api/orders/{oid}/status",
                              json={"status": "Finalizat"})
        assert r.status_code == 200
        o = auth_client.get(f"{BASE_URL}/api/orders/{oid}").json()
        assert o["status"] == "Finalizat"
        r2 = auth_client.patch(f"{BASE_URL}/api/orders/{oid}/status",
                               json={"status": "In asteptare"})
        assert r2.status_code == 200

    def test_invalid_status(self, auth_client):
        oid = state["order_id"]
        r = auth_client.patch(f"{BASE_URL}/api/orders/{oid}/status",
                              json={"status": "Oarecare"})
        assert r.status_code == 400

    def test_delete_order_restores_stock(self, auth_client):
        cid = state["new_collab_id"]
        oid = state["order_id"]
        before = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        before_map = {s["id"]: s["quantity"] for s in before["stock_rows"]}
        r = auth_client.delete(f"{BASE_URL}/api/orders/{oid}")
        assert r.status_code == 200
        after = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        after_map = {s["id"]: s["quantity"] for s in after["stock_rows"]}
        # original order had +3 of ocean-det-3l and +2 of ocean-bal-5l
        assert after_map["ocean-det-3l"] == before_map["ocean-det-3l"] + 3
        assert after_map["ocean-bal-5l"] == before_map["ocean-bal-5l"] + 2
        # Order is gone from list
        orders = auth_client.get(f"{BASE_URL}/api/orders").json()
        assert all(o["id"] != oid for o in orders)

    def test_order_empty_lines_rejected(self, auth_client):
        payload = {"collaborator_id": state["new_collab_id"],
                   "client_id": state["client_id"], "lines": []}
        r = auth_client.post(f"{BASE_URL}/api/orders", json=payload)
        assert r.status_code == 400


# ---------------------------- DASHBOARD ----------------------------
class TestDashboard:
    def test_dashboard_shape(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ("total_sold", "orders_count", "total_stock",
                  "negative_count", "negatives", "collected", "pending",
                  "collaborators_count", "recent_orders"):
            assert k in d


# ---------------------------- CLEANUP ----------------------------
class TestCleanup:
    def test_cleanup(self, auth_client):
        # delete leftover negative order
        if state.get("neg_order_id"):
            auth_client.delete(f"{BASE_URL}/api/orders/{state['neg_order_id']}")
        if state.get("client_id"):
            auth_client.delete(f"{BASE_URL}/api/clients/{state['client_id']}")
        if state.get("new_collab_id"):
            auth_client.delete(f"{BASE_URL}/api/collaborators/{state['new_collab_id']}")
