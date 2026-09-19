import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model
from apps.core.models import Program, UserProfile
from apps.germplasm.models import Germplasm, SeedLot

User = get_user_model()


def _client_for(role, program=None):
    user = User.objects.create_user(
        username=f"{role}_{Program.objects.count()}_{User.objects.count()}",
        password="password12345",
    )
    UserProfile.objects.create(user=user, role=role, program=program)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.fixture
def program(db):
    return Program.objects.create(name="Bread Wheat", crop="wheat")


@pytest.mark.django_db
def test_seed_lot_check_availability(program):
    client, _ = _client_for("breeder", program)
    germ1 = Germplasm.objects.create(name="Line 1", program=program)
    germ2 = Germplasm.objects.create(name="Line 2", program=program)

    SeedLot.objects.create(
        germplasm=germ1,
        program=program,
        lot_code="LOT-1",
        quantity_grams=100.0,
        reserved_grams=0.0,
        status="available",
    )
    SeedLot.objects.create(
        germplasm=germ2,
        program=program,
        lot_code="LOT-2",
        quantity_grams=50.0,
        reserved_grams=10.0,
        status="available",
    )

    resp = client.post(
        "/api/seed-lots/check_availability/",
        {
            "requirements": [
                {"germplasm": germ1.id, "grams_needed": 150.0},
                {"germplasm": germ2.id, "grams_needed": 30.0},
            ]
        },
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    data = {r["germplasm"]: r for r in resp.data}

    assert data[germ1.id]["available_grams"] == 100.0
    assert data[germ1.id]["shortfall_grams"] == 50.0

    assert data[germ2.id]["available_grams"] == 40.0
    assert data[germ2.id]["shortfall_grams"] == 0.0
