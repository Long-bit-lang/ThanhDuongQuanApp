"""Comprehensive end-to-end business and security tests for POS operations."""

import uuid
from decimal import Decimal
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.modules.identity.models import User
from app.modules.catalog.models import Product
from app.modules.floor.models import DiningTable, ServiceSession
from app.modules.service.models import OrderItem
from app.modules.billing.models import Invoice
from app.modules.payments.models import Payment
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_catalog_crud_and_permissions(
    client: AsyncClient,
    test_owner: User,
    test_cashier: User,
    test_waiter: User,
):
    """Verifies catalog product management and strict RBAC enforcement."""
    product_name = f"Bò xào lăn_{uuid.uuid4().hex[:6]}"
    payload = {
        "name": product_name,
        "description": "Thịt bò tươi xào lăn kiểu miền Tây",
        "sale_price": "120000.00",
        "is_available": True,
    }

    # 1. WAITER cannot create products (403 Forbidden)
    res_waiter_create = await client.post("/api/v1/products", json=payload, headers=auth_headers(test_waiter))
    assert res_waiter_create.status_code == 403

    # 2. OWNER can create products (201 Created)
    res_create = await client.post("/api/v1/products", json=payload, headers=auth_headers(test_owner))
    assert res_create.status_code == 201
    prod_data = res_create.json()
    product_id = prod_data["id"]
    assert prod_data["name"] == product_name
    assert Decimal(str(prod_data["sale_price"])) == Decimal("120000.00")

    # 3. WAITER can read products (200 OK)
    res_list = await client.get("/api/v1/products", headers=auth_headers(test_waiter))
    assert res_list.status_code == 200
    assert any(p["id"] == product_id for p in res_list.json())

    # 4. CASHIER toggles availability (Hết món / Đang bán)
    res_toggle = await client.post(f"/api/v1/products/{product_id}/toggle-availability", headers=auth_headers(test_cashier))
    assert res_toggle.status_code == 200
    assert res_toggle.json()["is_available"] is False

    res_toggle2 = await client.post(f"/api/v1/products/{product_id}/toggle-availability", headers=auth_headers(test_cashier))
    assert res_toggle2.status_code == 200
    assert res_toggle2.json()["is_available"] is True

    # 5. CASHIER archives product (Soft delete)
    res_archive = await client.post(f"/api/v1/products/{product_id}/archive", headers=auth_headers(test_cashier))
    assert res_archive.status_code == 200
    assert res_archive.json()["is_archived"] is True
    assert res_archive.json()["is_available"] is False

    # 6. Cannot toggle availability on archived product (409 Conflict)
    res_toggle_archived = await client.post(f"/api/v1/products/{product_id}/toggle-availability", headers=auth_headers(test_cashier))
    assert res_toggle_archived.status_code == 409


@pytest.mark.asyncio
async def test_floor_tables_and_sessions(
    client: AsyncClient,
    test_waiter: User,
    db_session: AsyncSession,
):
    """Verifies 50 tables list, session opening, occupancy state, and closing."""
    # 1. Fetch tables list
    res_tables = await client.get("/api/v1/tables", headers=auth_headers(test_waiter))
    assert res_tables.status_code == 200
    tables = res_tables.json()
    assert len(tables) >= 50

    # Pick an available table
    target_table = next(t for t in tables if t["status"] == "AVAILABLE")
    table_id = target_table["id"]

    # 2. Open session on table
    res_open = await client.post(f"/api/v1/tables/{table_id}/open-session", headers=auth_headers(test_waiter))
    assert res_open.status_code == 201
    session_data = res_open.json()
    session_id = session_data["id"]
    assert session_data["status"] == "OPEN"

    # 3. Trying to open another session on same table fails (409 Conflict)
    res_open_conflict = await client.post(f"/api/v1/tables/{table_id}/open-session", headers=auth_headers(test_waiter))
    assert res_open_conflict.status_code == 409

    # 4. Check table status now shows OCCUPIED with active_session_id
    res_table_check = await client.get(f"/api/v1/tables/{table_id}", headers=auth_headers(test_waiter))
    assert res_table_check.status_code == 200
    assert res_table_check.json()["status"] == "OCCUPIED"

    # 5. Close session -> table returns to AVAILABLE
    res_close = await client.post(f"/api/v1/sessions/{session_id}/close", headers=auth_headers(test_waiter))
    assert res_close.status_code == 200
    assert res_close.json()["status"] == "CLOSED"

    res_table_freed = await client.get(f"/api/v1/tables/{table_id}", headers=auth_headers(test_waiter))
    assert res_table_freed.json()["status"] == "AVAILABLE"


@pytest.mark.asyncio
async def test_order_rounds_and_cancellation(
    client: AsyncClient,
    test_waiter: User,
    test_owner: User,
):
    """Verifies multiple order rounds, price snapshots, item cancellation, and subtotal calculation."""
    # 1. Create two test products
    p1_name = f"Bia Sài Gòn_{uuid.uuid4().hex[:6]}"
    p2_name = f"Đậu hũ chiên_{uuid.uuid4().hex[:6]}"
    
    p1 = (await client.post("/api/v1/products", json={"name": p1_name, "sale_price": "20000.00", "is_available": True}, headers=auth_headers(test_owner))).json()
    p2 = (await client.post("/api/v1/products", json={"name": p2_name, "sale_price": "50000.00", "is_available": True}, headers=auth_headers(test_owner))).json()

    # 2. Open table
    tables = (await client.get("/api/v1/tables", headers=auth_headers(test_waiter))).json()
    target_table = next(t for t in tables if t["status"] == "AVAILABLE")
    sess = (await client.post(f"/api/v1/tables/{target_table['id']}/open-session", headers=auth_headers(test_waiter))).json()
    session_id = sess["id"]

    # 3. Order round 1: 3x Bia (20k x 3 = 60k) and 1x Đậu hũ (50k x 1 = 50k) -> Subtotal 110k
    round1_payload = {
        "items": [
            {"product_id": p1["id"], "quantity": 3, "note": "Ướp lạnh"},
            {"product_id": p2["id"], "quantity": 1, "note": "Chiên giòn"},
        ]
    }
    res_round1 = await client.post(f"/api/v1/sessions/{session_id}/orders", json=round1_payload, headers=auth_headers(test_waiter))
    assert res_round1.status_code == 201

    # Check session subtotal
    sess_view1 = (await client.get(f"/api/v1/sessions/{session_id}", headers=auth_headers(test_waiter))).json()
    assert Decimal(str(sess_view1["running_subtotal"])) == Decimal("110000.00")
    assert len(sess_view1["active_items"]) == 2

    # 4. Order round 2: add 2x Bia (20k x 2 = 40k) -> Subtotal 150k
    round2_payload = {
        "items": [
            {"product_id": p1["id"], "quantity": 2, "note": "Thêm đá"},
        ]
    }
    res_round2 = await client.post(f"/api/v1/sessions/{session_id}/orders", json=round2_payload, headers=auth_headers(test_waiter))
    assert res_round2.status_code == 201

    sess_view2 = (await client.get(f"/api/v1/sessions/{session_id}", headers=auth_headers(test_waiter))).json()
    assert Decimal(str(sess_view2["running_subtotal"])) == Decimal("150000.00")

    # 5. Cancel the Đậu hũ item (50k)
    item_to_cancel = next(it for it in sess_view2["active_items"] if it["product_name"] == p2_name)
    res_cancel = await client.post(
        f"/api/v1/order-items/{item_to_cancel['id']}/cancel",
        json={"reason": "Khách đổi ý"},
        headers=auth_headers(test_waiter),
    )
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "CANCELLED"

    # 6. Verify cancelled item is excluded from subtotal (150k - 50k = 100k)
    sess_view3 = (await client.get(f"/api/v1/sessions/{session_id}", headers=auth_headers(test_waiter))).json()
    assert len(sess_view3["active_items"]) == 1  # Bia is accumulated into 1 item (3 + 2 = 5)
    assert sess_view3["active_items"][0]["quantity"] == 5
    assert Decimal(str(sess_view3["active_items"][0]["line_total"])) == Decimal("100000.00")
    assert sess_view3["cancelled_items"][0]["cancellation_reason"] == "Khách đổi ý"

    # 7. Check session timeline history
    res_history = await client.get(f"/api/v1/sessions/{session_id}/history", headers=auth_headers(test_waiter))
    assert res_history.status_code == 200
    history = res_history.json()
    actions = [h["action"] for h in history]
    assert "SESSION_OPENED" in actions
    assert "ORDER_CREATED" in actions
    assert "ORDER_ITEM_CANCELLED" in actions


@pytest.mark.asyncio
async def test_session_merge_split_and_transfer(
    client: AsyncClient,
    test_waiter: User,
    test_owner: User,
):
    """Verifies table merging, item transfer, and session splitting."""
    p_name = f"Món test_{uuid.uuid4().hex[:6]}"
    p = (await client.post("/api/v1/products", json={"name": p_name, "sale_price": "80000.00", "is_available": True}, headers=auth_headers(test_owner))).json()

    # Open 3 available tables: Table A, Table B, Table C
    tables = (await client.get("/api/v1/tables", headers=auth_headers(test_waiter))).json()
    avail = [t for t in tables if t["status"] == "AVAILABLE"]
    tA, tB, tC = avail[0], avail[1], avail[2]

    sessA = (await client.post(f"/api/v1/tables/{tA['id']}/open-session", headers=auth_headers(test_waiter))).json()
    sessB = (await client.post(f"/api/v1/tables/{tB['id']}/open-session", headers=auth_headers(test_waiter))).json()

    # Add items to SessA (2 items) and SessB (1 item)
    await client.post(f"/api/v1/sessions/{sessA['id']}/orders", json={"items": [{"product_id": p["id"], "quantity": 2}]}, headers=auth_headers(test_waiter))
    await client.post(f"/api/v1/sessions/{sessB['id']}/orders", json={"items": [{"product_id": p["id"], "quantity": 1}]}, headers=auth_headers(test_waiter))

    sessA_items = (await client.get(f"/api/v1/sessions/{sessA['id']}", headers=auth_headers(test_waiter))).json()["active_items"]

    # 1. Transfer 1 item from SessA to SessB
    res_transfer = await client.post(
        "/api/v1/sessions/transfer-items",
        json={
            "source_session_id": sessA["id"],
            "target_session_id": sessB["id"],
            "order_item_ids": [sessA_items[0]["id"]],
        },
        headers=auth_headers(test_waiter),
    )
    assert res_transfer.status_code == 200
    assert res_transfer.json()["transferred"] == 1

    # 2. Merge SessB into SessA
    res_merge = await client.post(
        "/api/v1/sessions/merge",
        json={"session_ids": [sessA["id"], sessB["id"]]},
        headers=auth_headers(test_waiter),
    )
    assert res_merge.status_code == 200

    # Verify SessB is closed, SessA remains open
    sessB_check = (await client.get(f"/api/v1/sessions/{sessB['id']}", headers=auth_headers(test_waiter))).json()
    assert sessB_check["status"] == "CLOSED"

    # 3. Split: Split item from SessA onto Table C
    sessA_items_after_merge = (await client.get(f"/api/v1/sessions/{sessA['id']}", headers=auth_headers(test_waiter))).json()["active_items"]
    res_split = await client.post(
        "/api/v1/sessions/split",
        json={
            "source_session_id": sessA["id"],
            "target_table_id": tC["id"],
            "order_item_ids": [sessA_items_after_merge[0]["id"]],
        },
        headers=auth_headers(test_waiter),
    )
    assert res_split.status_code == 200
    split_data = res_split.json()
    assert split_data["moved_item_count"] == 1

    # Verify Table C is now OCCUPIED
    tC_check = (await client.get(f"/api/v1/tables/{tC['id']}", headers=auth_headers(test_waiter))).json()
    assert tC_check["status"] == "OCCUPIED"


@pytest.mark.asyncio
async def test_billing_discounts_and_payments(
    client: AsyncClient,
    test_waiter: User,
    test_cashier: User,
    test_owner: User,
):
    """Verifies invoice generation, percentage & fixed discounts, payments, and idempotency."""
    # 1. Prepare product and session
    p = (await client.post("/api/v1/products", json={"name": f"Lẩu gà lá é_{uuid.uuid4().hex[:6]}", "sale_price": "200000.00", "is_available": True}, headers=auth_headers(test_owner))).json()

    tables = (await client.get("/api/v1/tables", headers=auth_headers(test_cashier))).json()
    t = next(tb for tb in tables if tb["status"] == "AVAILABLE")
    sess = (await client.post(f"/api/v1/tables/{t['id']}/open-session", headers=auth_headers(test_waiter))).json()
    session_id = sess["id"]

    await client.post(f"/api/v1/sessions/{session_id}/orders", json={"items": [{"product_id": p["id"], "quantity": 2}]}, headers=auth_headers(test_waiter))
    # Subtotal: 200k * 2 = 400.000đ

    # 2. WAITER cannot create invoice (403 Forbidden)
    res_waiter_inv = await client.post(f"/api/v1/sessions/{session_id}/invoice", headers=auth_headers(test_waiter))
    assert res_waiter_inv.status_code == 403

    # 3. CASHIER creates invoice (201 Created)
    res_inv = await client.post(f"/api/v1/sessions/{session_id}/invoice", headers=auth_headers(test_cashier))
    assert res_inv.status_code == 201
    invoice = res_inv.json()
    invoice_id = invoice["id"]
    assert "invoice_number" in invoice

    # Idempotent invoice check
    res_inv_repeat = await client.post(f"/api/v1/sessions/{session_id}/invoice", headers=auth_headers(test_cashier))
    assert res_inv_repeat.json()["id"] == invoice_id

    # 4. Apply 10% discount on whole invoice
    res_disc = await client.post(
        f"/api/v1/invoices/{invoice_id}/discounts",
        json={"discount_type": "PERCENT", "value": "10.00"},
        headers=auth_headers(test_cashier),
    )
    assert res_disc.status_code == 200
    disc_data = res_disc.json()
    assert Decimal(str(disc_data["discount_amount"])) == Decimal("40000.00")
    assert Decimal(str(disc_data["total_after_discount"])) == Decimal("360000.00")

    # 5. Discount > 100% or exceeding base fails
    res_disc_invalid = await client.post(
        f"/api/v1/invoices/{invoice_id}/discounts",
        json={"discount_type": "PERCENT", "value": "150.00"},
        headers=auth_headers(test_cashier),
    )
    assert res_disc_invalid.status_code == 422

    # 6. WAITER cannot process payment (403 Forbidden)
    res_waiter_pay = await client.post(
        f"/api/v1/invoices/{invoice_id}/payments",
        json={"method": "CASH", "idempotency_key": "IDEMP_KEY_001_A"},
        headers=auth_headers(test_waiter),
    )
    assert res_waiter_pay.status_code == 403

    # 7. CASHIER gets VietQR mock payload
    res_qr = await client.get(f"/api/v1/invoices/{invoice_id}/vietqr-mock", headers=auth_headers(test_cashier))
    assert res_qr.status_code == 200
    qr_data = res_qr.json()
    assert "mock_qr_url" in qr_data
    assert Decimal(str(qr_data["amount"])) == Decimal("360000.00")

    # 8. CASHIER confirms payment with idempotency key
    idemp_key = f"IDEMP_{uuid.uuid4().hex}"
    res_pay = await client.post(
        f"/api/v1/invoices/{invoice_id}/payments",
        json={"method": "VIETQR_MOCK", "idempotency_key": idemp_key},
        headers=auth_headers(test_cashier),
    )
    assert res_pay.status_code == 201
    pay_data = res_pay.json()
    assert pay_data["status"] == "CONFIRMED"
    assert Decimal(str(pay_data["amount"])) == Decimal("360000.00")
    assert pay_data["vietqr_mock"] is True

    # 9. Duplicate request with SAME idempotency key returns idempotent success without double charging
    res_pay_dup = await client.post(
        f"/api/v1/invoices/{invoice_id}/payments",
        json={"method": "VIETQR_MOCK", "idempotency_key": idemp_key},
        headers=auth_headers(test_cashier),
    )
    assert res_pay_dup.status_code == 200
    assert res_pay_dup.json()["idempotent"] is True

    # 10. Attempting to pay an already paid invoice with a NEW key fails (409 Conflict)
    res_pay_already_paid = await client.post(
        f"/api/v1/invoices/{invoice_id}/payments",
        json={"method": "CASH", "idempotency_key": f"NEW_KEY_{uuid.uuid4().hex}"},
        headers=auth_headers(test_cashier),
    )
    assert res_pay_already_paid.status_code == 409


@pytest.mark.asyncio
async def test_post_payment_cancellation_and_adjustment(
    client: AsyncClient,
    test_waiter: User,
    test_cashier: User,
    test_owner: User,
):
    """Verifies business rule: cancelling item after payment leaves payment amount immutable and records adjustment difference."""
    p1 = (await client.post("/api/v1/products", json={"name": f"Món A_{uuid.uuid4().hex[:6]}", "sale_price": "350000.00", "is_available": True}, headers=auth_headers(test_owner))).json()
    p2 = (await client.post("/api/v1/products", json={"name": f"Món B_{uuid.uuid4().hex[:6]}", "sale_price": "100000.00", "is_available": True}, headers=auth_headers(test_owner))).json()

    tables = (await client.get("/api/v1/tables", headers=auth_headers(test_cashier))).json()
    available = [tb for tb in tables if tb["status"] == "AVAILABLE"]
    if not available:
        occ = next((tb for tb in tables if tb.get("active_session_id")), None)
        if occ and occ.get("active_session_id"):
            await client.post(f"/api/v1/sessions/{occ['active_session_id']}/close", headers=auth_headers(test_waiter))
            tables = (await client.get("/api/v1/tables", headers=auth_headers(test_cashier))).json()
    t = next(tb for tb in tables if tb["status"] == "AVAILABLE")
    sess = (await client.post(f"/api/v1/tables/{t['id']}/open-session", headers=auth_headers(test_waiter))).json()
    session_id = sess["id"]

    # Order both items (350k + 100k = 450.000đ)
    await client.post(
        f"/api/v1/sessions/{session_id}/orders",
        json={"items": [{"product_id": p1["id"], "quantity": 1}, {"product_id": p2["id"], "quantity": 1}]},
        headers=auth_headers(test_waiter),
    )

    # Cashier creates invoice and pays 450.000đ
    invoice = (await client.post(f"/api/v1/sessions/{session_id}/invoice", headers=auth_headers(test_cashier))).json()
    inv_id = invoice["id"]

    idemp = f"PAY_{uuid.uuid4().hex}"
    await client.post(
        f"/api/v1/invoices/{inv_id}/payments",
        json={"method": "CASH", "idempotency_key": idemp},
        headers=auth_headers(test_cashier),
    )

    # Now cancel Món B (100.000đ) after payment
    session_items = (await client.get(f"/api/v1/sessions/{session_id}", headers=auth_headers(test_waiter))).json()["active_items"]
    item_b = next(it for it in session_items if it["product_name"] == p2["name"])

    res_cancel_post = await client.post(
        f"/api/v1/order-items/{item_b['id']}/cancel",
        json={"reason": "Món bị hỏng, trả lại tiền mặt bên ngoài"},
        headers=auth_headers(test_waiter),
    )
    assert res_cancel_post.status_code == 200
    cancel_data = res_cancel_post.json()
    assert cancel_data["post_payment_adjusted"] is True
    assert Decimal(str(cancel_data["adjustment_amount"])) == Decimal("-100000.00")

    # Verify receipt and financial immutability
    res_receipt = await client.get(f"/api/v1/invoices/{inv_id}/receipt", headers=auth_headers(test_cashier))
    assert res_receipt.status_code == 200
    receipt = res_receipt.json()

    # Original payment remains immutable: 450.000đ
    assert Decimal(str(receipt["total_paid"])) == Decimal("450000.00")
    # Adjustment is recorded: -100.000đ
    assert Decimal(str(receipt["adjustment_total"])) == Decimal("-100000.00")
    # Final adjusted total: 350.000đ
    assert Decimal(str(receipt["final_total"])) == Decimal("350000.00")
    # Difference to be returned to customer externally: 100.000đ
    assert Decimal(str(receipt["difference"])) == Decimal("100000.00")


@pytest.mark.asyncio
async def test_revenue_reporting_permissions(
    client: AsyncClient,
    test_waiter: User,
    test_cashier: User,
    test_owner: User,
):
    """Verifies that revenue reports are strictly accessible to OWNER/CASHIER and blocked for WAITER."""
    # WAITER is forbidden from viewing revenue
    res_waiter_sum = await client.get("/api/v1/reports/revenue/summary", headers=auth_headers(test_waiter))
    assert res_waiter_sum.status_code == 403

    res_waiter_daily = await client.get("/api/v1/reports/revenue/daily", headers=auth_headers(test_waiter))
    assert res_waiter_daily.status_code == 403

    # CASHIER can view revenue
    res_cashier_sum = await client.get("/api/v1/reports/revenue/summary", headers=auth_headers(test_cashier))
    assert res_cashier_sum.status_code == 200
    assert "paid_amount" in res_cashier_sum.json()

    # OWNER can view revenue
    res_owner_daily = await client.get("/api/v1/reports/revenue/daily", headers=auth_headers(test_owner))
    assert res_owner_daily.status_code == 200


@pytest.mark.asyncio
async def test_printing_and_receipt_formatting(
    client: AsyncClient,
    test_cashier: User,
    test_owner: User,
):
    """Verifies printer status, hardware device info, and mock print execution."""
    # 1. Printer status
    res_status = await client.get("/api/v1/printing/status", headers=auth_headers(test_cashier))
    assert res_status.status_code == 200
    status_data = res_status.json()
    assert status_data["paper_width_mm"] == 80
    assert status_data["is_ready"] is True

    # 2. Hardware device specifications
    res_dev = await client.get("/api/v1/printing/device-info", headers=auth_headers(test_cashier))
    assert res_dev.status_code == 200
    assert res_dev.json()["device_model"] == "SUNMI T1-G"
    assert res_dev.json()["printer_model"] == "ZYWELL ZY-Q822"

    # 3. Mock print job
    dummy_receipt = {
        "restaurant_name": "THANH DƯƠNG QUÁN",
        "tagline": "Quán nhậu bình dân — Ẩm thực đậm vị",
        "address": "Tháp Chăm, Phú Vinh, TP Huế",
        "phone": "0900.000.000",
        "invoice_number": "TDQ-TEST-001",
        "invoice_id": str(uuid.uuid4()),
        "date_time": "01/11/2026 20:30:00",
        "table_names": ["Bàn 5"],
        "cashier_name": test_cashier.full_name,
        "items": [
            {"name": "Bia Tiger Bạc", "quantity": 10, "unit_price": "22000.00", "line_total": "220000.00"}
        ],
        "subtotal": "220000.00",
        "discount_total": "0.00",
        "total_after_discount": "220000.00",
        "adjustment_total": "0.00",
        "final_total": "220000.00",
        "payments": [
            {"method": "CASH", "amount": "220000.00", "status": "CONFIRMED", "time": "01/11/2026 20:35:00"}
        ],
        "total_paid": "220000.00",
        "balance_due": "0.00",
        "difference": "0.00",
    }
    res_print = await client.post("/api/v1/printing/mock-print", json=dummy_receipt, headers=auth_headers(test_cashier))
    assert res_print.status_code == 200
    print_res = res_print.json()
    assert print_res["status"] == "SUCCESS"
    assert print_res["byte_count"] > 0


@pytest.mark.asyncio
async def test_duplicate_and_subsequent_order_items_sync_with_invoice_and_receipt(
    client: AsyncClient,
    test_waiter: User,
    test_cashier: User,
    test_owner: User,
):
    """Verifies that adding duplicate items (quantity accumulation) or new items
    to an active session immediately reflects in the draft invoice and printed receipt."""
    # 1. Create product: Bia Huda 15,000 VND
    huda_res = await client.post(
        "/api/v1/products",
        json={"name": f"Bia Huda {uuid.uuid4().hex[:4]}", "sale_price": "15000.00", "is_available": True},
        headers=auth_headers(test_owner),
    )
    assert huda_res.status_code == 201
    huda_id = huda_res.json()["id"]

    # 2. Open session on an available table
    tables = (await client.get("/api/v1/tables", headers=auth_headers(test_waiter))).json()
    table = next(t for t in tables if t["status"] == "AVAILABLE")
    sess_res = await client.post(f"/api/v1/tables/{table['id']}/open-session", headers=auth_headers(test_waiter))
    assert sess_res.status_code == 201
    session_id = sess_res.json()["id"]

    # 3. Order 24 cans of Huda
    order1_res = await client.post(
        f"/api/v1/sessions/{session_id}/orders",
        json={"items": [{"product_id": huda_id, "quantity": 24, "note": "Ướp lạnh"}]},
        headers=auth_headers(test_waiter),
    )
    assert order1_res.status_code == 201

    # 4. Generate draft invoice
    inv_create_res = await client.post(
        f"/api/v1/sessions/{session_id}/invoice",
        headers=auth_headers(test_cashier),
    )
    assert inv_create_res.status_code == 201
    invoice_id = inv_create_res.json()["id"]

    # Check invoice has 24 cans
    inv_data = (await client.get(f"/api/v1/invoices/{invoice_id}", headers=auth_headers(test_cashier))).json()
    assert len(inv_data["items"]) == 1
    assert inv_data["items"][0]["quantity"] == 24
    assert Decimal(str(inv_data["subtotal"])) == Decimal("360000.00")

    # Check receipt has 24 cans
    receipt_data = (await client.get(f"/api/v1/invoices/{invoice_id}/receipt", headers=auth_headers(test_cashier))).json()
    assert len(receipt_data["items"]) == 1
    assert receipt_data["items"][0]["quantity"] == 24
    assert Decimal(str(receipt_data["subtotal"])) == Decimal("360000.00")

    # 5. Order 24 MORE cans of Huda (Duplicate item accumulation: 24 -> 48)
    order2_res = await client.post(
        f"/api/v1/sessions/{session_id}/orders",
        json={"items": [{"product_id": huda_id, "quantity": 24, "note": "Thêm đá"}]},
        headers=auth_headers(test_waiter),
    )
    assert order2_res.status_code == 201

    # 6. Verify invoice immediately updated to 48 cans, total 720,000 VND
    inv_updated = (await client.get(f"/api/v1/invoices/{invoice_id}", headers=auth_headers(test_cashier))).json()
    assert len(inv_updated["items"]) == 1
    assert inv_updated["items"][0]["quantity"] == 48
    assert Decimal(str(inv_updated["subtotal"])) == Decimal("720000.00")
    assert Decimal(str(inv_updated["final_total"])) == Decimal("720000.00")

    # 7. Verify receipt immediately reflects 48 cans, total 720,000 VND
    receipt_updated = (await client.get(f"/api/v1/invoices/{invoice_id}/receipt", headers=auth_headers(test_cashier))).json()
    assert len(receipt_updated["items"]) == 1
    assert receipt_updated["items"][0]["quantity"] == 48
    assert Decimal(str(receipt_updated["subtotal"])) == Decimal("720000.00")
    assert Decimal(str(receipt_updated["final_total"])) == Decimal("720000.00")

    # Clean up: close session
    await client.post(f"/api/v1/sessions/{session_id}/close", headers=auth_headers(test_waiter))


@pytest.mark.asyncio
async def test_decimal_quantity_and_order_item_quantity_update(
    client: AsyncClient,
    test_waiter: User,
    test_cashier: User,
    test_owner: User,
):
    """Verifies that items can be ordered with decimal quantities (e.g. 0.5, 0.22 kg),
    and that their quantity can be updated dynamically via PATCH /order-items/{id}/quantity."""
    # 1. Create product: Mực lá tươi 500,000 VND/kg
    muc_res = await client.post(
        "/api/v1/products",
        json={"name": f"Mực lá tươi {uuid.uuid4().hex[:4]}", "sale_price": "500000.00", "is_available": True},
        headers=auth_headers(test_owner),
    )
    assert muc_res.status_code == 201
    muc_id = muc_res.json()["id"]

    # 2. Open session
    tables = (await client.get("/api/v1/tables", headers=auth_headers(test_waiter))).json()
    table = next(t for t in tables if t["status"] == "AVAILABLE")
    sess_res = await client.post(f"/api/v1/tables/{table['id']}/open-session", headers=auth_headers(test_waiter))
    assert sess_res.status_code == 201
    session_id = sess_res.json()["id"]

    # 3. Order 0.5 kg of Mực
    order_res = await client.post(
        f"/api/v1/sessions/{session_id}/orders",
        json={"items": [{"product_id": muc_id, "quantity": "0.5", "note": "Cân tại bể"}]},
        headers=auth_headers(test_waiter),
    )
    assert order_res.status_code == 201

    # Fetch session items
    sess_data = (await client.get(f"/api/v1/sessions/{session_id}", headers=auth_headers(test_waiter))).json()
    assert len(sess_data["active_items"]) == 1
    item = sess_data["active_items"][0]
    assert Decimal(str(item["quantity"])) == Decimal("0.5")
    assert Decimal(str(item["line_total"])) == Decimal("250000.00")
    assert Decimal(str(sess_data["running_subtotal"])) == Decimal("250000.00")

    # 4. Create draft invoice
    inv_res = await client.post(f"/api/v1/sessions/{session_id}/invoice", headers=auth_headers(test_cashier))
    assert inv_res.status_code == 201
    invoice_id = inv_res.json()["id"]

    receipt_initial = (await client.get(f"/api/v1/invoices/{invoice_id}/receipt", headers=auth_headers(test_cashier))).json()
    assert Decimal(str(receipt_initial["items"][0]["quantity"])) == Decimal("0.5")
    assert Decimal(str(receipt_initial["subtotal"])) == Decimal("250000.00")
    assert "0.5 x 500.000đ" in receipt_initial["formatted_text"]

    # 5. Update quantity to 0.22 kg via PATCH /api/v1/order-items/{item_id}/quantity
    patch_res = await client.patch(
        f"/api/v1/order-items/{item['id']}/quantity",
        json={"quantity": "0.22"},
        headers=auth_headers(test_waiter),
    )
    assert patch_res.status_code == 200
    patch_data = patch_res.json()
    assert Decimal(str(patch_data["quantity"])) == Decimal("0.22")
    assert Decimal(str(patch_data["line_total"])) == Decimal("110000.00")

    # 6. Verify session details updated
    sess_updated = (await client.get(f"/api/v1/sessions/{session_id}", headers=auth_headers(test_waiter))).json()
    assert Decimal(str(sess_updated["active_items"][0]["quantity"])) == Decimal("0.22")
    assert Decimal(str(sess_updated["running_subtotal"])) == Decimal("110000.00")

    # 7. Verify invoice and receipt dynamically synced to 0.22 kg
    inv_updated = (await client.get(f"/api/v1/invoices/{invoice_id}", headers=auth_headers(test_cashier))).json()
    assert Decimal(str(inv_updated["items"][0]["quantity"])) == Decimal("0.22")
    assert Decimal(str(inv_updated["subtotal"])) == Decimal("110000.00")
    assert Decimal(str(inv_updated["final_total"])) == Decimal("110000.00")

    receipt_updated = (await client.get(f"/api/v1/invoices/{invoice_id}/receipt", headers=auth_headers(test_cashier))).json()
    assert Decimal(str(receipt_updated["items"][0]["quantity"])) == Decimal("0.22")
    assert Decimal(str(receipt_updated["subtotal"])) == Decimal("110000.00")
    assert "0.22 x 500.000đ" in receipt_updated["formatted_text"]

    # 8. Attempting invalid quantity (<= 0) should be rejected (422)
    invalid_res = await client.patch(
        f"/api/v1/order-items/{item['id']}/quantity",
        json={"quantity": "0"},
        headers=auth_headers(test_waiter),
    )
    assert invalid_res.status_code == 422

    # Clean up: close session
    await client.post(f"/api/v1/sessions/{session_id}/close", headers=auth_headers(test_waiter))


