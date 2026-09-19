import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model
from apps.core.models import Program, UserProfile, Season, Location
from apps.germplasm.models import Germplasm, Cross, CrossingBlock
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
def test_germplasm_history(program, season, location):
    client, _ = _client_for("breeder", program)

    parent_female = Germplasm.objects.create(name="Female Parent A", program=program)
    parent_male = Germplasm.objects.create(name="Male Parent B", program=program)

    cb = CrossingBlock.objects.create(name="CB-2026", program=program, season=season, location=location)
    Cross.objects.create(
        cross_code="CR-001",
        female_parent=parent_female,
        male_parent=parent_male,
        crossing_block=cb,
        cross_date="2026-03-01",
        status="pollinated",
    )

    trial = Trial.objects.create(
        name="Yield Trial 1",
        trial_code="YT-01",
        program=program,
        season=season,
        location=location,
        design_type="RCBD",
    )
    Plot.objects.create(trial=trial, plot_number=101, germplasm=parent_female, rep=1)

    resp = client.get(f"/api/germplasm/{parent_female.id}/history/")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.data

    assert data["germplasm_id"] == parent_female.id
    assert len(data["trial_history"]) == 1
    assert data["trial_history"][0]["trial_code"] == "YT-01"
    assert len(data["cross_history"]) == 1
    assert data["cross_history"][0]["role"] == "female"
    assert data["cross_history"][0]["other_parent"] == "Male Parent B"


@pytest.mark.django_db
def test_germplasm_observation_summary(program, season, location):
    client, _ = _client_for("breeder", program)

    g1 = Germplasm.objects.create(name="Variety X", program=program)
    g2 = Germplasm.objects.create(name="Variety Y", program=program)

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
    )

    plot1 = Plot.objects.create(trial=trial, plot_number=1, germplasm=g1, rep=1)
    plot2 = Plot.objects.create(trial=trial, plot_number=2, germplasm=g1, rep=2)

    Observation.objects.create(plot=plot1, variable=var, value_numeric=5.5)
    Observation.objects.create(plot=plot2, variable=var, value_numeric=6.5)

    resp = client.post(
        "/api/germplasm/observation_summary/",
        {
            "germplasm_ids": [g1.id, g2.id],
            "variable_id": var.id,
        },
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    data = {r["germplasm"]: r for r in resp.data}

    assert data[g1.id]["avg_value"] == 6.0
    assert data[g1.id]["observation_count"] == 2
    assert data[g1.id]["season_count"] == 1

    assert data[g2.id]["avg_value"] is None
    assert data[g2.id]["observation_count"] == 0
