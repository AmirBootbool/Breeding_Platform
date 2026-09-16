import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Location, Program, Season, UserProfile

User = get_user_model()


def _client_for(role, program=None, staff=False):
    user = User.objects.create_user(
        username=f"{role}_{Program.objects.count()}_{User.objects.count()}",
        password="password12345",
        is_staff=staff,
    )
    profile = UserProfile.objects.create(user=user, role=role, program=program)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user, profile


@pytest.fixture
def two_programs(db):
    return (
        Program.objects.create(name="Program A", crop="wheat"),
        Program.objects.create(name="Program B", crop="wheat"),
    )


@pytest.mark.django_db
def test_program_scoped_to_own_membership(two_programs):
    program_a, program_b = two_programs
    client_a, _, _ = _client_for("breeder", program_a)
    client_staff, _, _ = _client_for("breeder", program_a, staff=True)

    assert client_a.get(f"/api/programs/{program_a.id}/").status_code == status.HTTP_200_OK
    assert client_a.get(f"/api/programs/{program_b.id}/").status_code == status.HTTP_404_NOT_FOUND

    staff_list = client_staff.get("/api/programs/")
    staff_ids = {row["id"] for row in staff_list.data["results"]}
    assert {program_a.id, program_b.id} <= staff_ids


@pytest.mark.django_db
def test_season_scoped_to_own_program(two_programs):
    program_a, program_b = two_programs
    season_a = Season.objects.create(name="2026", year=2026, program=program_a)
    season_b = Season.objects.create(name="2026", year=2026, program=program_b)

    client_a, _, _ = _client_for("breeder", program_a)

    assert client_a.get(f"/api/seasons/{season_a.id}/").status_code == status.HTTP_200_OK
    assert client_a.get(f"/api/seasons/{season_b.id}/").status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_location_is_global_reference_data(two_programs):
    program_a, _ = two_programs
    loc = Location.objects.create(name="Shared Field")
    client_a, _, _ = _client_for("breeder", program_a)

    assert client_a.get(f"/api/locations/{loc.id}/").status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_user_profile_visibility_by_role(two_programs):
    program_a, program_b = two_programs
    _, viewer_user, viewer_profile = _client_for("viewer", program_a)
    admin_a_client, _, _ = _client_for("admin", program_a)
    _, other_admin_user, other_admin_profile = _client_for("admin", program_b)

    # A regular user only sees their own profile.
    viewer_client = APIClient()
    viewer_client.force_authenticate(user=viewer_user)
    list_resp = viewer_client.get("/api/user-profiles/")
    ids = {row["id"] for row in list_resp.data["results"]}
    assert ids == {viewer_profile.id}

    # A program-level admin sees their own program's team, not other
    # programs' users.
    admin_list = admin_a_client.get("/api/user-profiles/")
    admin_ids = {row["id"] for row in admin_list.data["results"]}
    assert viewer_profile.id in admin_ids
    assert other_admin_profile.id not in admin_ids
