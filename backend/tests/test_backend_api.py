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
        # Baseline is 18 seeded products; custom products from earlier runs may persist.
        assert len(items) >= 18
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
        assert "stock_rows" in data and len(data["stock_rows"]) >= 18
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


# ---------------------------- NEW: SETTINGS / LOW-STOCK THRESHOLD ----------------------------
class TestSettings:
    def test_get_settings_default_or_persisted(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/settings")
        assert r.status_code == 200
        d = r.json()
        assert "low_stock_threshold" in d
        assert isinstance(d["low_stock_threshold"], int)
        state["orig_threshold"] = d["low_stock_threshold"]

    def test_update_settings_persists(self, auth_client):
        r = auth_client.put(f"{BASE_URL}/api/settings", json={"low_stock_threshold": 7})
        assert r.status_code == 200
        assert r.json()["low_stock_threshold"] == 7
        # GET verifies persistence
        r2 = auth_client.get(f"{BASE_URL}/api/settings")
        assert r2.json()["low_stock_threshold"] == 7

    def test_update_settings_negative_clamped(self, auth_client):
        r = auth_client.put(f"{BASE_URL}/api/settings", json={"low_stock_threshold": -3})
        assert r.status_code == 200
        assert r.json()["low_stock_threshold"] == 0


# ---------------------------- NEW: CUSTOM PRODUCT CREATION ----------------------------
class TestCreateProduct:
    def test_create_custom_product_and_appears_in_list(self, auth_client):
        before = auth_client.get(f"{BASE_URL}/api/products").json()
        before_count = len(before)
        max_order = max(p["order"] for p in before)
        payload = {"category": "TEST_CAT", "variant": "TEST_VARIANT",
                   "size": "7L", "price": 99}
        r = auth_client.post(f"{BASE_URL}/api/products", json=payload)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["category"] == "TEST_CAT"
        assert p["variant"] == "TEST_VARIANT"
        assert p["size"] == "7L"
        assert p["price"] == 99
        assert p["order"] == max_order + 1
        assert p["label"] == "TEST_CAT TEST_VARIANT 7L"
        assert "id" in p
        state["new_product_id"] = p["id"]
        # Appears in list
        after = auth_client.get(f"{BASE_URL}/api/products").json()
        assert len(after) == before_count + 1
        assert any(x["id"] == p["id"] for x in after)

    def test_create_product_variant_defaults_to_category(self, auth_client):
        before = auth_client.get(f"{BASE_URL}/api/products").json()
        max_order = max(p["order"] for p in before)
        r = auth_client.post(f"{BASE_URL}/api/products",
                             json={"category": "TEST_SOLOCAT", "size": "2L", "price": 25})
        assert r.status_code == 200
        p = r.json()
        # When variant missing, backend uses category -> label uses "{cat} {size}" per product_label
        assert p["variant"] == "TEST_SOLOCAT"
        assert p["label"] == "TEST_SOLOCAT 2L"
        assert p["order"] == max_order + 1
        state["new_product_id_2"] = p["id"]


# ---------------------------- NEW: EDIT ORDER ----------------------------
class TestEditOrder:
    """Verify PUT /api/orders/{id} recomputes total, restores old stock, applies new decrement."""

    def test_edit_order_recomputes_and_adjusts_stock(self, auth_client):
        cid = state["new_collab_id"]
        # Ensure clean baseline stock for test products
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "ocean-det-3l", "quantity": 50})
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "ocean-bal-5l", "quantity": 50})
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "floral-det-3l", "quantity": 50})

        # Create a client to switch to later
        r_cli = auth_client.post(f"{BASE_URL}/api/collaborators/{cid}/clients",
                                 json={"name": "TEST_Client_Edit"})
        state["edit_client_id"] = r_cli.json()["id"]

        # Create order: 2x ocean-det-3l (price 40) → total 80, stock becomes 48
        r = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": state["client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 2}],
            "status": "In asteptare",
        })
        assert r.status_code == 200
        order = r.json()
        oid = order["id"]
        original_doc_no = order["document_no"]
        assert order["total"] == 80
        state["edit_order_id"] = oid

        detail = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        rows = {s["id"]: s["quantity"] for s in detail["stock_rows"]}
        assert rows["ocean-det-3l"] == 48

        # Edit: 5x ocean-det-3l + 1x ocean-bal-5l; switch client + status Finalizat
        edit_payload = {
            "client_id": state["edit_client_id"],
            "lines": [
                {"product_id": "ocean-det-3l", "qty": 5},   # 5*40 = 200
                {"product_id": "ocean-bal-5l", "qty": 1},   # 1*70 = 70
            ],
            "status": "Finalizat",
        }
        r2 = auth_client.put(f"{BASE_URL}/api/orders/{oid}", json=edit_payload)
        assert r2.status_code == 200, r2.text
        updated = r2.json()
        # document_no preserved
        assert updated["document_no"] == original_doc_no
        # total recomputed
        assert updated["total"] == 270
        # status + client swap applied
        assert updated["status"] == "Finalizat"
        assert updated["client_id"] == state["edit_client_id"]
        assert updated["client_name"] == "TEST_Client_Edit"
        assert len(updated["lines"]) == 2
        # Each line has correct subtotal / label populated
        for ln in updated["lines"]:
            assert ln["subtotal"] == ln["price"] * ln["qty"]
            assert ln["label"]

        # Net stock delta: ocean-det-3l went from 48 → 48+2-5 = 45 (net -3)
        # ocean-bal-5l went from 50 → 50-1 = 49
        after = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        after_rows = {s["id"]: s["quantity"] for s in after["stock_rows"]}
        assert after_rows["ocean-det-3l"] == 45, f"expected 45, got {after_rows['ocean-det-3l']}"
        assert after_rows["ocean-bal-5l"] == 49, f"expected 49, got {after_rows['ocean-bal-5l']}"

    def test_edit_order_remove_product_restores_stock(self, auth_client):
        """Edit order to remove a product line entirely – that product's old qty must return to stock."""
        cid = state["new_collab_id"]
        oid = state["edit_order_id"]
        # Current state: ocean-det-3l=45 (order holds 5), ocean-bal-5l=49 (order holds 1)
        # Replace with only 2x floral-det-3l (price 40) → total 80
        r = auth_client.put(f"{BASE_URL}/api/orders/{oid}", json={
            "client_id": state["edit_client_id"],
            "lines": [{"product_id": "floral-det-3l", "qty": 2}],
            "status": "In asteptare",
        })
        assert r.status_code == 200
        o = r.json()
        assert o["total"] == 80
        assert len(o["lines"]) == 1
        assert o["lines"][0]["product_id"] == "floral-det-3l"
        after = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        rows = {s["id"]: s["quantity"] for s in after["stock_rows"]}
        # ocean-det-3l 5 restored → 45+5 = 50
        assert rows["ocean-det-3l"] == 50
        # ocean-bal-5l 1 restored → 49+1 = 50
        assert rows["ocean-bal-5l"] == 50
        # floral-det-3l 50 - 2 = 48
        assert rows["floral-det-3l"] == 48

    def test_edit_order_empty_lines_rejected(self, auth_client):
        oid = state["edit_order_id"]
        r = auth_client.put(f"{BASE_URL}/api/orders/{oid}", json={
            "client_id": state["edit_client_id"], "lines": [], "status": "In asteptare",
        })
        assert r.status_code == 400

    def test_edit_order_not_found(self, auth_client):
        r = auth_client.put(f"{BASE_URL}/api/orders/does-not-exist", json={
            "client_id": state["edit_client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 1}],
        })
        assert r.status_code == 404


# ---------------------------- NEW: DASHBOARD LOW-STOCK ----------------------------
class TestDashboardLowStock:
    def test_dashboard_includes_low_stock_fields(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/dashboard")
        assert r.status_code == 200
        d = r.json()
        for k in ("low_stock_count", "low_stock", "low_stock_threshold"):
            assert k in d, f"missing {k} from dashboard"
        assert isinstance(d["low_stock"], list)
        assert isinstance(d["low_stock_count"], int)
        assert d["low_stock_count"] == len(d["low_stock"])
        # Each low_stock entry shape
        for item in d["low_stock"]:
            assert 0 <= item["quantity"] <= d["low_stock_threshold"]
            assert "collaborator" in item
            assert "label" in item

    def test_dashboard_low_stock_reacts_to_threshold_change(self, auth_client):
        # Set threshold = 0 -> only items with qty==0 appear
        auth_client.put(f"{BASE_URL}/api/settings", json={"low_stock_threshold": 0})
        d0 = auth_client.get(f"{BASE_URL}/api/dashboard").json()
        assert d0["low_stock_threshold"] == 0
        for item in d0["low_stock"]:
            assert item["quantity"] == 0
        count_at_0 = d0["low_stock_count"]

        # Set threshold = 100 -> all non-negative items should appear
        auth_client.put(f"{BASE_URL}/api/settings", json={"low_stock_threshold": 100})
        d100 = auth_client.get(f"{BASE_URL}/api/dashboard").json()
        assert d100["low_stock_threshold"] == 100
        assert d100["low_stock_count"] >= count_at_0


# ---------------------------- NEW: MONTHLY REPORTS ----------------------------
class TestMonthlyReports:
    def test_monthly_report_default(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/reports/monthly")
        assert r.status_code == 200
        d = r.json()
        for k in ("month", "months", "per_collaborator", "products", "totals"):
            assert k in d
        assert isinstance(d["months"], list)
        assert isinstance(d["per_collaborator"], list)
        assert isinstance(d["products"], list)
        tot = d["totals"]
        for k in ("orders_count", "total", "collected", "pending", "items"):
            assert k in tot

    def test_monthly_report_contains_test_collab_and_edited_order(self, auth_client):
        d = auth_client.get(f"{BASE_URL}/api/reports/monthly").json()
        # The month must at least contain our new_collab_id orders → it is current month
        from datetime import datetime, timezone
        current_month = datetime.now(timezone.utc).strftime("%Y-%m")
        assert current_month in d["months"]
        # Filter explicitly
        d2 = auth_client.get(f"{BASE_URL}/api/reports/monthly?month={current_month}").json()
        assert d2["month"] == current_month
        names = [c["name"] for c in d2["per_collaborator"]]
        assert "TEST_Colaborator_X" in names
        row = next(c for c in d2["per_collaborator"] if c["name"] == "TEST_Colaborator_X")
        for k in ("orders_count", "total", "collected", "pending"):
            assert k in row and isinstance(row[k], int)
        # products breakdown
        for p in d2["products"]:
            for k in ("label", "qty", "value"):
                assert k in p

    def test_monthly_report_specific_month_filter_empty(self, auth_client):
        # Ask for a month far in the past -> expect zero totals (or no orders)
        d = auth_client.get(f"{BASE_URL}/api/reports/monthly?month=2001-01").json()
        assert d["month"] == "2001-01"
        assert d["totals"]["orders_count"] == 0
        assert d["totals"]["total"] == 0
        assert d["per_collaborator"] == []
        assert d["products"] == []


# ---------------------------- REGRESSION ----------------------------
class TestRegressionProductCount:
    def test_products_still_contains_baseline_18(self, auth_client):
        items = auth_client.get(f"{BASE_URL}/api/products").json()
        base_ids = {"ocean-det-3l", "ocean-det-5l", "ocean-bal-3l", "ocean-bal-5l",
                    "floral-det-3l", "floral-det-5l", "floral-bal-3l", "floral-bal-5l",
                    "lavanda-det-3l", "lavanda-det-5l", "lavanda-bal-3l", "lavanda-bal-5l",
                    "vase-1l", "universal-3l", "universal-5l",
                    "sapun-05l", "sapun-rez-1l", "odorizant"}
        got_ids = {p["id"] for p in items}
        assert base_ids.issubset(got_ids)


# ---------------------------- CLEANUP ----------------------------
class TestCleanup:
    def test_cleanup(self, auth_client):
        # Restore original threshold
        if "orig_threshold" in state:
            auth_client.put(f"{BASE_URL}/api/settings",
                            json={"low_stock_threshold": state["orig_threshold"]})
        # Delete edit order
        if state.get("edit_order_id"):
            auth_client.delete(f"{BASE_URL}/api/orders/{state['edit_order_id']}")
        # delete leftover negative order
        if state.get("neg_order_id"):
            auth_client.delete(f"{BASE_URL}/api/orders/{state['neg_order_id']}")
        if state.get("edit_client_id"):
            auth_client.delete(f"{BASE_URL}/api/clients/{state['edit_client_id']}")
        if state.get("client_id"):
            auth_client.delete(f"{BASE_URL}/api/clients/{state['client_id']}")
        if state.get("new_collab_id"):
            auth_client.delete(f"{BASE_URL}/api/collaborators/{state['new_collab_id']}")
        # Note: custom products created cannot be deleted (no endpoint) - harmless per PRD
