import pytest
from apps.germplasm.models import SeedLot, SeedTransaction, Germplasm


@pytest.mark.django_db
def test_create_seed_lot(client_for_role, program, germplasm):
    client = client_for_role("breeder")

    payload = {
        "germplasm": germplasm.id,
        "program": program.id,
        "quantity_grams": 250.5,
        "seed_count": 5000,
        "storage_location": "Cold Room 1, Rack A, Box 05",
        "germination_rate": 96.5,
        "notes": "Clean harvest seed packet",
    }

    response = client.post("/api/seed-lots/", payload)
    assert response.status_code == 201
    data = response.json()
    assert data["lot_code"].startswith("LOT-")
    assert data["quantity_grams"] == 250.5
    assert data["germplasm_name"] == germplasm.name
    assert data["storage_location"] == "Cold Room 1, Rack A, Box 05"
    assert data["status"] == "available"

    # Verify initial transaction created
    lot_id = data["id"]
    txs = SeedTransaction.objects.filter(seed_lot_id=lot_id)
    assert txs.count() == 1
    assert txs.first().transaction_type == "initial_deposit"
    assert txs.first().quantity_grams == 250.5


@pytest.mark.django_db
def test_adjust_inventory_deposit_and_deduction(client_for_role, program, germplasm):
    client = client_for_role("technician")

    lot = SeedLot.objects.create(
        germplasm=germplasm,
        program=program,
        quantity_grams=100.0,
        storage_location="Vault 2, Box 10",
    )

    # 1. Deduct 40g for planting
    deduct_payload = {
        "transaction_type": "planting_deduction",
        "quantity_grams": -40.0,
        "notes": "Planted in trial block 1",
    }
    resp1 = client.post(f"/api/seed-lots/{lot.id}/adjust/", deduct_payload)
    assert resp1.status_code == 200
    assert resp1.json()["seed_lot"]["quantity_grams"] == 60.0
    assert resp1.json()["seed_lot"]["status"] == "available"

    # 2. Deduct remaining 60g -> should mark depleted
    resp2 = client.post(
        f"/api/seed-lots/{lot.id}/adjust/",
        {"transaction_type": "planting_deduction", "quantity_grams": -60.0},
    )
    assert resp2.status_code == 200
    assert resp2.json()["seed_lot"]["quantity_grams"] == 0.0
    assert resp2.json()["seed_lot"]["status"] == "depleted"


@pytest.mark.django_db
def test_adjust_inventory_insufficient_stock(client_for_role, program, germplasm):
    client = client_for_role("breeder")

    lot = SeedLot.objects.create(
        germplasm=germplasm,
        program=program,
        quantity_grams=25.0,
        storage_location="Room 3",
    )

    # Attempt to deduct 50g from 25g
    resp = client.post(
        f"/api/seed-lots/{lot.id}/adjust/",
        {"quantity_grams": -50.0, "notes": "Too much seed requested"},
    )
    assert resp.status_code == 400
    assert "Insufficient seed inventory" in resp.json()["detail"]


@pytest.mark.django_db
def test_seed_lot_label_data(client_for_role, program, germplasm):
    client = client_for_role("viewer")

    lot = SeedLot.objects.create(
        germplasm=germplasm,
        program=program,
        quantity_grams=500.0,
        storage_location="Main Cold Storage - Shelf 4",
    )

    resp = client.get(f"/api/seed-lots/{lot.id}/label/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["lot_code"] == lot.lot_code
    assert data["germplasm_name"] == germplasm.name
    assert "qr_payload" in data
    assert f"LOT:{lot.lot_code}" in data["qr_payload"]


@pytest.mark.django_db
def test_seed_inventory_rbac(client_for_role, program, germplasm):
    viewer_client = client_for_role("viewer")
    breeder_client = client_for_role("breeder")

    lot = SeedLot.objects.create(
        germplasm=germplasm,
        program=program,
        quantity_grams=100.0,
        storage_location="Shelf 1",
    )

    # Viewer cannot adjust
    resp_viewer = viewer_client.post(
        f"/api/seed-lots/{lot.id}/adjust/",
        {"quantity_grams": -10.0},
    )
    assert resp_viewer.status_code == 403

    # Breeder can adjust
    resp_breeder = breeder_client.post(
        f"/api/seed-lots/{lot.id}/adjust/",
        {"quantity_grams": -10.0},
    )
    assert resp_breeder.status_code == 200
