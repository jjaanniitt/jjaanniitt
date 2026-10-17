"""Iteration 5 small additions:
   - POST /api/collaborators/{id}/consignments accepts optional 'date' and persists it.
   - DELETE /api/products/{id} coverage (soft delete + 404 unknown) regression.
"""
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


class TestConsignmentWithDate:
    def test_setup_pro(self, auth_client):
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        cid = _mod_shop_id(auth_client)
        assert cid, "MOD SHOP SRL must exist"
        state["cid"] = cid

    def test_consignment_with_explicit_date_persists_and_increments_stock(self, auth_client):
        cid = state["cid"]
        before = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        rows_before = {r["id"]: r["quantity"] for r in before["stock_rows"]}
        qb = rows_before.get("ocean-det-3l", 0)

        pv = "PV-DATE-ITER5"
        iso_date = "2026-02-05T09:30:00Z"
        r = auth_client.post(
            f"{BASE_URL}/api/collaborators/{cid}/consignments",
            json={"pv_number": pv, "date": iso_date,
                  "items": [{"product_id": "ocean-det-3l", "qty": 4}]},
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        # The response must echo back the exact provided date and pv
        assert doc["pv_number"] == pv
        assert doc["date"] == iso_date
        assert doc["total_items"] == 4
        state["cons_id"] = doc["id"]

        # Stock must increment
        after = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        rows_after = {r["id"]: r["quantity"] for r in after["stock_rows"]}
        qa = rows_after.get("ocean-det-3l", 0)
        assert qa == qb + 4, f"stock should go from {qb} to {qb+4}, got {qa}"

        # Consignment appears in GET /collaborators/{id} consignments list with the exact date
        cons_list = after.get("consignments", [])
        found = [c for c in cons_list if c["id"] == doc["id"]]
        assert found, "new consignment not visible in GET /collaborators detail"
        assert found[0]["date"] == iso_date
        assert found[0]["pv_number"] == pv

    def test_consignment_without_date_defaults_to_now(self, auth_client):
        """Backward compat: when 'date' omitted, backend fills now_iso()."""
        cid = state["cid"]
        r = auth_client.post(
            f"{BASE_URL}/api/collaborators/{cid}/consignments",
            json={"pv_number": "PV-NO-DATE-ITER5",
                  "items": [{"product_id": "ocean-det-3l", "qty": 1}]},
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("date"), "backend should default date when not supplied"
        # ISO-ish shape
        assert "T" in d["date"] or "-" in d["date"]


class TestProductDeleteSmall:
    def test_delete_unknown_product_404(self, auth_client):
        r = auth_client.delete(f"{BASE_URL}/api/products/does-not-exist-xyz")
        assert r.status_code == 404

    def test_create_and_soft_delete_product(self, auth_client):
        r = auth_client.post(
            f"{BASE_URL}/api/products",
            json={"category": "TEST_IT5_SMALL", "size": "1L", "price": 5, "barcode": "7777000011111"},
        )
        assert r.status_code == 200
        pid = r.json()["id"]

        # visible
        items = auth_client.get(f"{BASE_URL}/api/products").json()
        assert any(p["id"] == pid for p in items)

        # delete
        r = auth_client.delete(f"{BASE_URL}/api/products/{pid}")
        assert r.status_code == 200

        # absent from GET /products
        items2 = auth_client.get(f"{BASE_URL}/api/products").json()
        assert not any(p["id"] == pid for p in items2)

        # absent from collaborator stock_rows
        cid = _mod_shop_id(auth_client)
        detail = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        assert not any(row["id"] == pid for row in detail.get("stock_rows", []))


class TestCleanup:
    def test_keep_pro(self, auth_client):
        auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
