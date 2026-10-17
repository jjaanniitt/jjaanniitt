"""Iteration 4: product DELETE/edit + partial payments feature + regression."""
import os
import pytest
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

state = {}


def _mod_shop_id(auth_client):
    r = auth_client.get(f"{BASE_URL}/api/collaborators").json()
    for c in r:
        if c["name"] == "MOD SHOP SRL":
            return c["id"]
    return r[0]["id"] if r else None


# ---------- Setup: ensure pro plan + stock + a client ----------
class TestSetup:
    def test_activate_pro(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/subscription/activate", json={"plan": "pro"})
        assert r.status_code == 200

    def test_collab_and_client(self, auth_client):
        cid = _mod_shop_id(auth_client)
        assert cid
        state["cid"] = cid
        # ensure some stock on ocean-det-3l for repeated orders
        auth_client.put(f"{BASE_URL}/api/collaborators/{cid}/stock",
                        json={"product_id": "ocean-det-3l", "quantity": 200})
        # dedicated test client
        r = auth_client.post(f"{BASE_URL}/api/collaborators/{cid}/clients",
                             json={"name": "TEST_PAY_CL", "phone": "0730000044"})
        assert r.status_code == 200
        state["client_id"] = r.json()["id"]


# ---------- Partial Payments ----------
class TestPartialPayments:
    def test_order_in_asteptare_paid_zero(self, auth_client):
        cid = state["cid"]
        r = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": state["client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 2}],
            "status": "In asteptare",
            "address": "Str. Pay 1", "date": "2026-01-15T10:00:00Z",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        state["order_waiting"] = d["id"]
        state["total_waiting"] = d["total"]
        assert d["paid"] == 0
        assert d["status"] == "In asteptare"
        assert d["payments"] == []
        assert d["total"] > 0

    def test_order_finalizat_full_paid(self, auth_client):
        cid = state["cid"]
        r = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": state["client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 1}],
            "status": "Finalizat",
            "address": "Str. Pay 2", "date": "2026-01-15T11:00:00Z",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        state["order_final"] = d["id"]
        assert d["paid"] == d["total"]
        assert d["status"] == "Finalizat"
        assert len(d["payments"]) == 1
        assert d["payments"][0]["amount"] == d["total"]

    def test_partial_payment_sets_status_partial(self, auth_client):
        oid = state["order_waiting"]
        total = state["total_waiting"]
        partial = round(total / 3, 2)
        r = auth_client.post(f"{BASE_URL}/api/orders/{oid}/payments",
                             json={"amount": partial, "note": "prima incasare"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert abs(d["paid"] - partial) < 0.01
        assert d["status"] == "Partial"
        assert len(d["payments"]) == 1
        assert d["payments"][0]["note"] == "prima incasare"

    def test_second_payment_exceeds_remaining_clamped_and_finalizat(self, auth_client):
        oid = state["order_waiting"]
        total = state["total_waiting"]
        # pay WAY more than remaining to test clamp
        r = auth_client.post(f"{BASE_URL}/api/orders/{oid}/payments",
                             json={"amount": total * 10})
        assert r.status_code == 200, r.text
        d = r.json()
        assert abs(d["paid"] - total) < 0.01, f"paid={d['paid']} should clamp to total={total}"
        assert d["status"] == "Finalizat"
        assert len(d["payments"]) == 2

    def test_pay_already_finalized_400(self, auth_client):
        oid = state["order_waiting"]
        r = auth_client.post(f"{BASE_URL}/api/orders/{oid}/payments", json={"amount": 10})
        assert r.status_code == 400

    def test_negative_amount_400(self, auth_client):
        oid = state["order_final"]
        r = auth_client.post(f"{BASE_URL}/api/orders/{oid}/payments", json={"amount": -5})
        assert r.status_code == 400

    def test_zero_amount_400(self, auth_client):
        oid = state["order_final"]
        r = auth_client.post(f"{BASE_URL}/api/orders/{oid}/payments", json={"amount": 0})
        assert r.status_code == 400


# ---------- PATCH /orders/{id}/status transitions ----------
class TestStatusTransitions:
    def test_create_fresh_waiting(self, auth_client):
        cid = state["cid"]
        r = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": state["client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 2}],
            "status": "In asteptare",
            "address": "Str. Status 1", "date": "2026-01-15T12:00:00Z",
        })
        assert r.status_code == 200
        state["order_status"] = r.json()["id"]
        state["total_status"] = r.json()["total"]

    def test_patch_to_finalizat_sets_paid_total(self, auth_client):
        oid = state["order_status"]
        total = state["total_status"]
        r = auth_client.patch(f"{BASE_URL}/api/orders/{oid}/status",
                              json={"status": "Finalizat"})
        assert r.status_code == 200
        g = auth_client.get(f"{BASE_URL}/api/orders/{oid}").json()
        assert abs(g["paid"] - total) < 0.01
        assert g["status"] == "Finalizat"
        # at least one payment recorded for remaining
        assert len(g["payments"]) >= 1

    def test_patch_back_to_waiting_resets(self, auth_client):
        oid = state["order_status"]
        r = auth_client.patch(f"{BASE_URL}/api/orders/{oid}/status",
                              json={"status": "In asteptare"})
        assert r.status_code == 200
        g = auth_client.get(f"{BASE_URL}/api/orders/{oid}").json()
        assert g["paid"] == 0
        assert g["payments"] == []
        assert g["status"] == "In asteptare"


# ---------- PUT /orders/{id} edit recomputes paid ----------
class TestOrderEdit:
    def test_edit_with_finalizat_sets_paid_total(self, auth_client):
        cid = state["cid"]
        r = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": state["client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 1}],
            "status": "In asteptare",
            "address": "Str. Edit 1",
        })
        assert r.status_code == 200
        oid = r.json()["id"]
        state["order_edit"] = oid
        # edit: change qty + status Finalizat
        r2 = auth_client.put(f"{BASE_URL}/api/orders/{oid}", json={
            "collaborator_id": cid, "client_id": state["client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 3}],
            "status": "Finalizat",
            "address": "Str. Edit 2",
        })
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["status"] == "Finalizat"
        assert abs(d["paid"] - d["total"]) < 0.01

    def test_edit_with_waiting_resets_paid(self, auth_client):
        oid = state["order_edit"]
        cid = state["cid"]
        r = auth_client.put(f"{BASE_URL}/api/orders/{oid}", json={
            "collaborator_id": cid, "client_id": state["client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 2}],
            "status": "In asteptare",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["paid"] == 0
        assert d["status"] == "In asteptare"

    def test_edit_clamps_paid_when_total_shrinks(self, auth_client):
        """Pay partial then shrink total via edit (keep status partial) -> paid clamped."""
        cid = state["cid"]
        r = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": state["client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 5}],
            "status": "In asteptare",
        })
        assert r.status_code == 200
        oid = r.json()["id"]
        total = r.json()["total"]
        # pay a large partial
        p = auth_client.post(f"{BASE_URL}/api/orders/{oid}/payments",
                             json={"amount": total * 0.8})
        assert p.status_code == 200
        paid_before = p.json()["paid"]
        # shrink order -> total drops below paid
        e = auth_client.put(f"{BASE_URL}/api/orders/{oid}", json={
            "collaborator_id": cid, "client_id": state["client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 1}],
            "status": "Partial",
        })
        assert e.status_code == 200
        d = e.json()
        assert d["paid"] <= d["total"] + 0.001, f"paid={d['paid']} total={d['total']}"
        # if clamped it becomes equal to total -> Finalizat
        assert d["status"] in ("Partial", "Finalizat")
        state["order_shrink"] = oid


# ---------- Aggregations ----------
class TestAggregations:
    def test_dashboard_collected_pending(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/dashboard?period=all")
        assert r.status_code == 200
        d = r.json()
        assert "collected" in d and "pending" in d
        assert d["collected"] >= 0 and d["pending"] >= 0

    def test_collaborators_list_has_collected_pending(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/collaborators")
        assert r.status_code == 200
        rows = r.json()
        for c in rows:
            assert "collected" in c and "pending" in c

    def test_collaborator_detail_collected_pending(self, auth_client):
        cid = state["cid"]
        r = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}")
        assert r.status_code == 200
        d = r.json()
        assert "collected" in d and "pending" in d

    def test_client_detail_collected_pending(self, auth_client):
        clid = state["client_id"]
        r = auth_client.get(f"{BASE_URL}/api/clients/{clid}")
        assert r.status_code == 200
        d = r.json()
        assert "collected" in d and "pending" in d

    def test_reports_monthly_uses_paid(self, auth_client):
        r = auth_client.get(f"{BASE_URL}/api/reports/monthly")
        assert r.status_code == 200
        d = r.json()
        assert "totals" in d
        t = d["totals"]
        assert "collected" in t and "pending" in t


# ---------- Product edit + delete (regression from iter5) ----------
class TestProductDeleteEdit:
    def test_create_product_with_barcode(self, auth_client):
        r = auth_client.post(f"{BASE_URL}/api/products",
                             json={"category": "TEST_IT4", "size": "2L", "price": 15,
                                   "barcode": "7777000044444"})
        assert r.status_code == 200
        d = r.json()
        state["pid"] = d["id"]
        assert d["barcode"] == "7777000044444"

    def test_put_price_barcode(self, auth_client):
        pid = state["pid"]
        r = auth_client.put(f"{BASE_URL}/api/products/{pid}",
                            json={"price": 25, "barcode": "7777000099999"})
        assert r.status_code == 200
        assert r.json()["price"] == 25
        assert r.json()["barcode"] == "7777000099999"

    def test_delete_product_soft(self, auth_client):
        pid = state["pid"]
        before = len(auth_client.get(f"{BASE_URL}/api/products").json())
        r = auth_client.delete(f"{BASE_URL}/api/products/{pid}")
        assert r.status_code == 200
        after = auth_client.get(f"{BASE_URL}/api/products").json()
        assert not any(p["id"] == pid for p in after)
        assert len(after) == before - 1

    def test_delete_unknown_404(self, auth_client):
        r = auth_client.delete(f"{BASE_URL}/api/products/does-not-exist-xyz")
        assert r.status_code == 404

    def test_deleted_not_in_collab_stock_rows(self, auth_client):
        cid = state["cid"]
        pid = state["pid"]
        detail = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        assert not any(row["id"] == pid for row in detail.get("stock_rows", []))


# ---------- Order delete regression (restores stock) ----------
class TestOrderDeleteRestoresStock:
    def test_delete_restores(self, auth_client):
        cid = state["cid"]
        before = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        q_before = next((r["quantity"] for r in before["stock_rows"] if r["id"] == "ocean-det-3l"), 0)
        r = auth_client.post(f"{BASE_URL}/api/orders", json={
            "collaborator_id": cid, "client_id": state["client_id"],
            "lines": [{"product_id": "ocean-det-3l", "qty": 4}],
            "status": "Finalizat",
        })
        assert r.status_code == 200
        oid = r.json()["id"]
        mid = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        q_mid = next((r["quantity"] for r in mid["stock_rows"] if r["id"] == "ocean-det-3l"), 0)
        assert q_mid == q_before - 4
        auth_client.delete(f"{BASE_URL}/api/orders/{oid}")
        after = auth_client.get(f"{BASE_URL}/api/collaborators/{cid}").json()
        q_after = next((r["quantity"] for r in after["stock_rows"] if r["id"] == "ocean-det-3l"), 0)
        assert q_after == q_before


# ---------- Cleanup ----------
class TestCleanup:
    def test_cleanup_orders_and_client(self, auth_client):
        for key in ("order_waiting", "order_final", "order_status", "order_edit", "order_shrink"):
            oid = state.get(key)
            if oid:
                auth_client.delete(f"{BASE_URL}/api/orders/{oid}")
        clid = state.get("client_id")
        if clid:
            auth_client.delete(f"{BASE_URL}/api/clients/{clid}")
        # keep pro plan for operator convenience
