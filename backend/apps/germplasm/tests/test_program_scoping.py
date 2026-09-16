import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Program, UserProfile
from apps.germplasm.models import Cross, Germplasm, SeedLot

User = get_user_model()


def _client_for(role, program=None, staff=False):
    user = User.objects.create_user(
        username=f"{role}_{Program.objects.count()}_{User.objects.count()}",
        password="password12345",
        is_staff=staff,
    )
    UserProfile.objects.create(user=user, role=role, program=program)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.fixture
def two_programs(db):
    return (
        Program.objects.create(name="Program A", crop="wheat"),
        Program.objects.create(name="Program B", crop="wheat"),
    )


@pytest.mark.django_db
def test_germplasm_scoped_to_own_program(two_programs):
    program_a, program_b = two_programs
    g_a = Germplasm.objects.create(name="Line A", program=program_a)
    g_b = Germplasm.objects.create(name="Line B", program=program_b)

    client_a, _ = _client_for("breeder", program_a)
    client_staff, _ = _client_for("breeder", program_a, staff=True)

    # Same-program: visible
    resp = client_a.get(f"/api/germplasm/{g_a.id}/")
    assert resp.status_code == status.HTTP_200_OK

    # Other-program: not visible, not enumerable via list either
    resp = client_a.get(f"/api/germplasm/{g_b.id}/")
    assert resp.status_code == status.HTTP_404_NOT_FOUND

    list_resp = client_a.get("/api/germplasm/")
    assert list_resp.status_code == status.HTTP_200_OK
    returned_ids = {row["id"] for row in list_resp.data["results"]}
    assert g_a.id in returned_ids
    assert g_b.id not in returned_ids

    # Staff/superuser sees both
    staff_list = client_staff.get("/api/germplasm/")
    staff_ids = {row["id"] for row in staff_list.data["results"]}
    assert {g_a.id, g_b.id} <= staff_ids


@pytest.mark.django_db
def test_germplasm_create_rejects_foreign_program(two_programs):
    program_a, program_b = two_programs
    client_a, _ = _client_for("breeder", program_a)

    resp = client_a.post(
        "/api/germplasm/",
        {"name": "Sneaky Line", "program": program_b.id},
        format="json",
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN
    assert not Germplasm.objects.filter(name="Sneaky Line").exists()

    # Same-program create still works
    resp = client_a.post(
        "/api/germplasm/",
        {"name": "Honest Line", "program": program_a.id},
        format="json",
    )
    assert resp.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
def test_cross_scoped_via_female_parent_program(two_programs):
    program_a, program_b = two_programs
    fem_a = Germplasm.objects.create(name="Fem A", program=program_a)
    male_a = Germplasm.objects.create(name="Male A", program=program_a)
    fem_b = Germplasm.objects.create(name="Fem B", program=program_b)
    male_b = Germplasm.objects.create(name="Male B", program=program_b)

    cross_a = Cross.objects.create(
        cross_code="A-001", female_parent=fem_a, male_parent=male_a,
        cross_date="2026-01-01",
    )
    cross_b = Cross.objects.create(
        cross_code="B-001", female_parent=fem_b, male_parent=male_b,
        cross_date="2026-01-01",
    )

    client_a, _ = _client_for("breeder", program_a)

    resp = client_a.get(f"/api/crosses/{cross_a.id}/")
    assert resp.status_code == status.HTTP_200_OK

    resp = client_a.get(f"/api/crosses/{cross_b.id}/")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_seed_lot_scoped_to_own_program(two_programs):
    program_a, program_b = two_programs
    germ_a = Germplasm.objects.create(name="Line A", program=program_a)
    germ_b = Germplasm.objects.create(name="Line B", program=program_b)
    lot_a = SeedLot.objects.create(
        germplasm=germ_a, program=program_a, lot_code="LOT-A-1", quantity_grams=100,
    )
    lot_b = SeedLot.objects.create(
        germplasm=germ_b, program=program_b, lot_code="LOT-B-1", quantity_grams=100,
    )

    client_a, _ = _client_for("breeder", program_a)

    resp = client_a.get(f"/api/seed-lots/{lot_a.id}/")
    assert resp.status_code == status.HTTP_200_OK

    resp = client_a.get(f"/api/seed-lots/{lot_b.id}/")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_no_profile_or_program_gets_empty_queryset(two_programs):
    program_a, _ = two_programs
    Germplasm.objects.create(name="Line A", program=program_a)

    # A user with a profile but no assigned program.
    client, _ = _client_for("breeder", program=None)
    resp = client.get("/api/germplasm/")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["count"] == 0
