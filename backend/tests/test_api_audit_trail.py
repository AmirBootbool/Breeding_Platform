import pytest
from rest_framework import status
from django.contrib.auth import get_user_model
from apps.core.models import Program, UserProfile, Location
from apps.germplasm.models import Germplasm, SeedLot

User = get_user_model()


@pytest.fixture
def admin_client_and_data(db):
    from rest_framework.test import APIClient
    admin_user = User.objects.create_user(username="audit_admin", password="password123")
    UserProfile.objects.create(user=admin_user, role="admin")

    program = Program.objects.create(name="Audit Test Program", crop="wheat", created_by=admin_user)
    location = Location.objects.create(name="Audit Field", created_by=admin_user)
    germplasm = Germplasm.objects.create(name="Audit-Line-01", program=program, created_by=admin_user)
    seed_lot = SeedLot.objects.create(
        germplasm=germplasm,
        program=program,
        lot_code="LOT-AUDIT-01",
        quantity_grams=500.0,
        storage_location="Vault A",
        created_by=admin_user,
    )

    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client, admin_user, program, germplasm, seed_lot


@pytest.mark.django_db
def test_audit_recent_changes_filter_model(admin_client_and_data):
    client, _, program, germplasm, seed_lot = admin_client_and_data

    # Query only Germplasm
    url = "/api/audit/recent_changes/?model=germplasm"
    response = client.get(url)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert all(d["model"] == "Germplasm" for d in data)


@pytest.mark.django_db
def test_audit_recent_changes_filter_user(admin_client_and_data):
    client, admin_user, _, _, _ = admin_client_and_data

    url = f"/api/audit/recent_changes/?user={admin_user.username}"
    response = client.get(url)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert all(d["created_by"] == admin_user.username or d["updated_by"] == admin_user.username for d in data)


@pytest.mark.django_db
def test_audit_recent_changes_filter_search(admin_client_and_data):
    client, _, _, _, seed_lot = admin_client_and_data

    url = "/api/audit/recent_changes/?search=LOT-AUDIT-01"
    response = client.get(url)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1
    assert any("LOT-AUDIT-01" in d["label"] for d in data)


@pytest.mark.django_db
def test_audit_entity_history(admin_client_and_data):
    client, _, program, germplasm, _ = admin_client_and_data

    url = f"/api/audit/entity_history/?model=germplasm&id={germplasm.id}"
    response = client.get(url)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["model"] == "Germplasm"
    assert data[0]["id"] == germplasm.id
