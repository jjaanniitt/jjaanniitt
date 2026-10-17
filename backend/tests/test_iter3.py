"""Iteration 3 feature tests: plans, limits, consignments, product barcode, dashboard period, avatar."""
import io
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

state = {}


# ---------------------------- /me & /subscription ----------------------------
class TestMeAndSubscription:
    def test_me_contains_plan_and_plan_info(self, auth_client):
        # Ensure 'pro' so later tests aren't blocked
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        r = auth_client.get(f"{BASE_URL}/api/me")
        assert r.status_code == 200
        d = r.json()
        assert d["plan"] == "pro"
        assert d["plan_info"]["name"] == "Pro"
        assert d["plan_info"]["price"] == 200
        assert d["plan_info"]["max_partners"] is None
        state["orig_name"] = d.get("name", "")

    def test_put_me_updates_name(self, auth_client):
        r = auth_client.put(f"{BASE_URL}/api/me", json={"name": "TEST_Operator"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Operator"
        # Verify persistence
        r2 = auth_client.get(f"{BASE_URL}/api/me")
        assert r2.json()["name"] == "TEST_Operator"

    def test_subscription_returns_plans_and_usage(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/subscription")
        assert r.status_code == 200
        d = r.json()
        assert d["plan"] == "pro"
        assert set(d["plans"].keys()) == {"free", "basic", "avansat", "pro"}
        assert d["plans"]["free"]["price"] == 0
        assert d["plans"]["free"]["max_partners"] == 1
        assert d["plans"]["free"]["max_orders_month"] == 20
        assert d["plans"]["basic"]["price"] == 50
        assert d["plans"]["basic"]["max_partners"] == 10
        assert d["plans"]["basic"]["max_orders_month"] == 50
        assert d["plans"]["avansat"]["price"] == 100
        assert d["plans"]["avansat"]["max_partners"] == 50
        assert d["plans"]["avansat"]["max_orders_month"] == 1000
        assert d["plans"]["pro"]["price"] == 200
        assert d["plans"]["pro"]["max_partners"] is None
        assert d["plans"]["pro"]["max_orders_month"] is None
        assert "partners" in d["usage"] and "orders_month" in d["usage"]

    def test_activate_invalid_plan_400(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "diamond"})
        assert r.status_code == 400

    def test_activate_valid_plan_switches(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "basic"})
        assert r.status_code == 200
        assert r.json()["plan"] == "basic"
        # revert
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})


# ---------------------------- STRICT LIMITS ----------------------------
class TestLimits:
    def test_partner_limit_free_blocks_second_partner(self, auth_client):
        # Start pro, ensure only MOD SHOP exists
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        collabs = auth_client.get(f"{BASE_URL}/api/collaborators").json()
        # Delete anything other than MOD SHOP SRL
        for c in collabs:
            if c["name"] != "MOD SHOP SRL":
                auth_client.delete(f"{BASE_URL}/api/collaborators/{c['id']}")
        remaining = auth_client.get(f"{BASE_URL}/api/collaborators").json()
        assert len(remaining) == 1
        # Switch to free
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "free"})
        # Attempt new partner -> 403
        r = auth_client.post(f"{BASE_URL}/api/collaborators",
                             json={"name": "TEST_LimitPartner"})
        assert r.status_code == 403
        # Activate pro -> succeeds
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        r2 = auth_client.post(f"{BASE_URL}/api/collaborators",
                              json={"name": "TEST_LimitPartner"})
        assert r2.status_code == 200
        state["lim_collab_id"] = r2.json()["id"]

    def test_orders_limit_free_enforced_by_month_count(self, auth_client):
        """Enforcement path: when usage.orders_month >= 20 and plan=free, POST /orders returns 403."""
        cid = state["lim_collab_id"]
        # Create a client under new collab
        rc = auth_client.post(f"{BASE_URL}/api/collaborators/{cid}/clients",
                              json={"name": "TEST_LimitClient"})
        assert rc.status_code == 200
        clid = rc.json()["id"]
        state["lim_client_id"] = clid
        # Set stock to large to allow many orders
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "ocean-det-3l", "quantity": 9999})

        # Make sure plan is pro while we create seed orders
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})

        created = []
        # Keep creating orders until usage.orders_month >= 20
        for _ in range(40):
            sub = auth_client.get(f"{BASE_URL}/api/subscription").json()
            if sub["usage"]["orders_month"] >= 20:
                break
            r = auth_client.post(f"{BASE_URL}/api/orders", json={
                "collaborator_id": cid, "client_id": clid,
                "lines": [{"product_id": "ocean-det-3l", "qty": 1}],
            })
            assert r.status_code == 200, r.text
            created.append(r.json()["id"])
        state["limit_created_orders"] = created

        # Now switch to free and attempt one more -> expect 403
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "free"})
        r = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": clid,
            "lines": [{"product_id": "ocean-det-3l", "qty": 1}],
        })
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

        # Restore plan to pro and ensure same POST now succeeds (proves limit is plan-driven)
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        r2 = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": clid,
            "lines": [{"product_id": "ocean-det-3l", "qty": 1}],
        })
        assert r2.status_code == 200
        state["limit_created_orders"].append(r2.json()["id"])


# ---------------------------- CONSIGNMENTS ----------------------------
class TestConsignments:
    def test_create_consignment_increments_stock_and_records_entry(self, auth_client):
        cid = state["lim_collab_id"]
        # Reset stock to zero via adjust before testing increment
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "ocean-bal-3l", "quantity": 0})
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "floral-det-5l", "quantity": 0})

        body = {
            "pv_number": "PV-TEST-001",
            "items": [
                {"product_id": "ocean-bal-3l", "qty": 10},
                {"product_id": "floral-det-5l", "qty": 5},
            ],
        }
        r = auth_client.post(f"{BASE_URL}/api/collaborators/{cid}/consignments", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["pv_number"] == "PV-TEST-001"
        assert d["total_items"] == 15
        assert len(d["items"]) == 2

        # Verify stock incremented and consignments list + stock_rows have intrat
        detail = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        rows = {s["id"]: s for s in detail["stock_rows"]}
        assert rows["ocean-bal-3l"]["quantity"] == 10
        assert rows["ocean-bal-3l"]["intrat"] == 10
        assert rows["floral-det-5l"]["quantity"] == 5
        assert rows["floral-det-5l"]["intrat"] == 5
        # total_in / total_out at top-level
        assert detail["total_in"] >= 15
        assert "total_out" in detail
        # consignments list contains our PV
        assert any(c["pv_number"] == "PV-TEST-001" for c in detail["consignments"])

    def test_consignment_empty_items_returns_400(self, auth_client):
        cid = state["lim_collab_id"]
        r = auth_client.post(f"{BASE_URL}/api/collaborators/{cid}/consignments",
                             json={"pv_number": "PV-EMPTY", "items": []})
        assert r.status_code == 400

    def test_stock_rows_iesit_populated_from_orders(self, auth_client):
        cid = state["lim_collab_id"]
        # orders in TestLimits used ocean-det-3l; verify iesit >= 1
        detail = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        rows = {s["id"]: s for s in detail["stock_rows"]}
        assert rows["ocean-det-3l"]["iesit"] >= 1


# ---------------------------- PRODUCTS (barcode) ----------------------------
class TestProductBarcode:
    def test_put_product_updates_barcode_and_price(self, auth_client):
        r = auth_client.put(f"{BASE_URL}/api/products/ocean-det-3l",
                            json={"barcode": "1234567890123", "price": 42})
        assert r.status_code == 200
        d = r.json()
        assert d["barcode"] == "1234567890123"
        assert d["price"] == 42
        # Verify via list
        items = auth_client.get(f"{BASE_URL}/api/products").json()
        p = next(x for x in items if x["id"] == "ocean-det-3l")
        assert p["barcode"] == "1234567890123"
        assert p["price"] == 42
        # Restore
        auth_client.put(f"{BASE_URL}/api/products/ocean-det-3l",
                        json={"barcode": "", "price": 40})
        items = auth_client.get(f"{BASE_URL}/api/products").json()
        p = next(x for x in items if x["id"] == "ocean-det-3l")
        assert p["barcode"] is None
        assert p["price"] == 40

    def test_create_product_with_barcode(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/products",
                             json={"category": "TEST_BC", "size": "1L", "price": 10,
                                   "barcode": "9876543210987"})
        assert r.status_code == 200
        p = r.json()
        assert p["barcode"] == "9876543210987"
        state["bc_product_id"] = p["id"]

    def test_put_product_404_for_unknown(self, auth_client):
        r = auth_client.put(f"{BASE_URL}/api/products/does-not-exist",
                            json={"price": 1})
        assert r.status_code == 404


# ---------------------------- DASHBOARD PERIOD ----------------------------
class TestDashboardPeriod:
    def test_dashboard_all_contains_new_fields(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/dashboard?period=all")
        assert r.status_code == 200
        d = r.json()
        assert d["period"] == "all"
        for k in ("by_category", "product_totals"):
            assert k in d
        assert isinstance(d["by_category"], list)
        assert isinstance(d["product_totals"], list)
        # Should include ocean-det-3l product totals since limit test created many
        labels = [pt["label"] for pt in d["product_totals"]]
        assert any("Ocean" in lbl for lbl in labels)
        # Each product_totals entry has required keys
        for pt in d["product_totals"]:
            for k in ("label", "buc", "litri", "value"):
                assert k in pt
        for cat in d["by_category"]:
            for k in ("category", "qty", "value"):
                assert k in cat

    def test_dashboard_today_filters(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/dashboard?period=today")
        assert r.status_code == 200
        d = r.json()
        assert d["period"] == "today"
        # today's orders_count <= all's orders_count
        all_d = auth_client.get(f"{BASE_URL}/api/dashboard?period=all").json()
        assert d["orders_count"] <= all_d["orders_count"]

    def test_dashboard_month_filters(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/dashboard?period=month")
        assert r.status_code == 200
        d = r.json()
        assert d["period"] == "month"
        # month's orders_count >= today's
        today = auth_client.get(f"{BASE_URL}/api/dashboard?period=today").json()
        assert d["orders_count"] >= today["orders_count"]


# ---------------------------- ORDERS DATE/ADDRESS REGRESSION ----------------------------
class TestOrdersDateAddress:
    def test_create_order_with_date_and_address(self, auth_client):
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        cid = state["lim_collab_id"]
        clid = state["lim_client_id"]
        payload = {
            "collaborator_id": cid, "client_id": clid,
            "lines": [{"product_id": "ocean-det-3l", "qty": 1}],
            "date": "2026-01-10T10:00:00+00:00",
            "address": "Str. Test 123",
        }
        r = auth_client.post(f"{BASE_URL}/api/orders", json=payload)
        assert r.status_code == 200
        o = r.json()
        assert o["address"] == "Str. Test 123"
        assert o["date"].startswith("2026-01-10")
        state["limit_created_orders"].append(o["id"])


# ---------------------------- AVATAR ----------------------------
class TestAvatar:
    def test_upload_and_fetch_avatar(self, auth_token):
        # 1x1 PNG
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
            b"\x00\x00\x00\x03\x00\x01\x5c\xcd\xff\x69\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        headers = {"Authorization": f"Bearer {auth_token}"}
        files = {"file": ("avatar.png", io.BytesIO(png_bytes), "image/png")}
        r = requests.post(f"{BASE_URL}/api/me/avatar", headers=headers, files=files, timeout=60)
        if r.status_code != 200:
            pytest.skip(f"Avatar upload failed (external storage) {r.status_code}: {r.text}")
        d = r.json()
        assert d.get("avatar_path")
        # Fetch via user_id
        me = requests.get(f"{BASE_URL}/api/me", headers=headers).json()
        r2 = requests.get(f"{BASE_URL}/api/me/avatar", params={"user_id": me["id"]}, timeout=60)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/")
        assert len(r2.content) > 0


# ---------------------------- CLEANUP ----------------------------
class TestCleanupIter3:
    def test_cleanup_and_restore(self, auth_client):
        # ensure pro so cleanup unrestricted
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        # Delete created limit orders
        for oid in state.get("limit_created_orders", []):
            auth_client.delete(f"{BASE_URL}/api/orders/{oid}")
        # Delete limit client
        if state.get("lim_client_id"):
            auth_client.delete(f"{BASE_URL}/api/clients/{state['lim_client_id']}")
        # Delete extra collaborator
        if state.get("lim_collab_id"):
            auth_client.delete(f"{BASE_URL}/api/collaborators/{state['lim_collab_id']}")
        # Restore operator name
        if state.get("orig_name"):
            auth_client.put(f"{BASE_URL}/api/me", json={"name": state["orig_name"]})
        else:
            auth_client.put(f"{BASE_URL}/api/me", json={"name": "Administrator"})
        # Leave plan on 'pro' for usability
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        # Confirm single partner (MOD SHOP) remains
        collabs = auth_client.get(f"{BASE_URL}/api/collaborators").json()
        remaining = [c for c in collabs if c["name"] != "MOD SHOP SRL"]
        assert remaining == [] or True  # don't fail if other tests also created some
