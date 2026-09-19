import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model
from apps.core.models import Program, UserProfile, Season, Location
from apps.germplasm.models import Germplasm
from apps.trials.models import Trial, Plot, ObservationVariable, Observation

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


@pytest.fixture
def season(db, program):
    return Season.objects.create(name="2026 Spring", year=2026, program=program)


@pytest.fixture
def location(db):
    return Location.objects.create(name="Station Alpha", country="Mexico", region="Sonora")


@pytest.mark.django_db
def test_season_summary_and_public_share(program, season, location):
    client, _ = _client_for("breeder", program)

    g1 = Germplasm.objects.create(name="Line 101", program=program)
    g2 = Germplasm.objects.create(name="Line 102", program=program)

    var = ObservationVariable.objects.create(
        name="Grain Yield",
        data_type="numeric",
        category="agronomic",
    )

    trial = Trial.objects.create(
        name="Yield Trial 1",
        trial_code="YT-01",
        program=program,
        season=season,
        location=location,
        status="completed",
    )
    p1 = Plot.objects.create(trial=trial, plot_number=1, germplasm=g1, rep=1)
    p2 = Plot.objects.create(trial=trial, plot_number=2, germplasm=g2, rep=1)

    Observation.objects.create(plot=p1, variable=var, value_numeric=5.0)
    Observation.objects.create(plot=p2, variable=var, value_numeric=7.0)

    # 1. Season summary
    resp = client.get(f"/api/seasons/{season.id}/summary/")
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["season_id"] == season.id
    assert resp.data["trial_count"] == 1
    assert len(resp.data["trials"]) == 1
    assert resp.data["trials"][0]["plot_count"] == 2
    assert resp.data["trials"][0]["trial_code"] == "YT-01"

    # 2. Create public share link
    share_resp = client.post(f"/api/seasons/{season.id}/create_share_link/", {"days_valid": 7}, format="json")
    assert share_resp.status_code == status.HTTP_200_OK
    token = share_resp.data["token"]
    assert token is not None

    # 3. Access public shared endpoint anonymously
    anon_client = APIClient()
    pub_resp = anon_client.get(f"/api/public/shared/{token}/")
    assert pub_resp.status_code == status.HTTP_200_OK
    assert pub_resp.data["season_name"] == "2026 Spring"
    assert pub_resp.data["trial_count"] == 1
    assert len(pub_resp.data["trials"]) == 1
    assert pub_resp.data["trials"][0]["plot_count"] == 2
