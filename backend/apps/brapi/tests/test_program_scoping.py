import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Location, Program, Season, UserProfile
from apps.germplasm.models import Germplasm
from apps.trials.models import Observation, ObservationVariable, Plot, Trial

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
def two_program_trials(db):
    program_a = Program.objects.create(name="Program A", crop="wheat")
    program_b = Program.objects.create(name="Program B", crop="wheat")
    loc = Location.objects.create(name="Field Station")
    season_a = Season.objects.create(name="2026", year=2026, program=program_a)
    season_b = Season.objects.create(name="2026", year=2026, program=program_b)

    trial_a = Trial.objects.create(
        name="Trial A", trial_code="TR-A", program=program_a,
        location=loc, season=season_a, design_type="RCBD",
    )
    trial_b = Trial.objects.create(
        name="Trial B", trial_code="TR-B", program=program_b,
        location=loc, season=season_b, design_type="RCBD",
    )
    germ_a = Germplasm.objects.create(name="Line A", program=program_a)
    germ_b = Germplasm.objects.create(name="Line B", program=program_b)
    plot_a = Plot.objects.create(trial=trial_a, germplasm=germ_a, rep=1, plot_number=1)
    plot_b = Plot.objects.create(trial=trial_b, germplasm=germ_b, rep=1, plot_number=1)

    return program_a, program_b, trial_a, trial_b, germ_a, germ_b, plot_a, plot_b


@pytest.mark.django_db
def test_brapi_studies_scoped_to_own_program(two_program_trials):
    program_a, program_b, trial_a, trial_b, *_ = two_program_trials
    client_a, _ = _client_for("breeder", program_a)
    client_staff, _ = _client_for("breeder", program_a, staff=True)

    assert client_a.get(f"/brapi/v2/studies/{trial_a.id}").status_code == status.HTTP_200_OK
    assert client_a.get(f"/brapi/v2/studies/{trial_b.id}").status_code == status.HTTP_404_NOT_FOUND

    staff_resp = client_staff.get("/brapi/v2/studies")
    staff_ids = {row["studyDbId"] for row in staff_resp.data["result"]["data"]}
    assert {str(trial_a.id), str(trial_b.id)} <= staff_ids


@pytest.mark.django_db
def test_brapi_germplasm_scoped_to_own_program(two_program_trials):
    program_a, program_b, _, _, germ_a, germ_b, *_ = two_program_trials
    client_a, _ = _client_for("breeder", program_a)

    assert client_a.get(f"/brapi/v2/germplasm/{germ_a.id}").status_code == status.HTTP_200_OK
    assert client_a.get(f"/brapi/v2/germplasm/{germ_b.id}").status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_brapi_observation_units_scoped_via_trial_program(two_program_trials):
    program_a, program_b, _, _, _, _, plot_a, plot_b = two_program_trials
    client_a, _ = _client_for("breeder", program_a)

    resp_a = client_a.get(f"/brapi/v2/observationunits/{plot_a.id}")
    assert resp_a.status_code == status.HTTP_200_OK
    resp_b = client_a.get(f"/brapi/v2/observationunits/{plot_b.id}")
    assert resp_b.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_brapi_observations_scoped_via_plot_trial_program(two_program_trials):
    program_a, program_b, _, _, _, _, plot_a, plot_b = two_program_trials
    var = ObservationVariable.objects.create(name="Height", data_type="numeric")
    obs_a = Observation.objects.create(plot=plot_a, variable=var, value_numeric=10)
    obs_b = Observation.objects.create(plot=plot_b, variable=var, value_numeric=20)

    client_a, _ = _client_for("breeder", program_a)

    assert client_a.get(f"/brapi/v2/observations/{obs_a.id}").status_code == status.HTTP_200_OK
    assert client_a.get(f"/brapi/v2/observations/{obs_b.id}").status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_brapi_programs_scoped_to_own_program(two_program_trials):
    program_a, program_b, *_ = two_program_trials
    client_a, _ = _client_for("breeder", program_a)

    assert client_a.get(f"/brapi/v2/programs/{program_a.id}").status_code == status.HTTP_200_OK
    assert client_a.get(f"/brapi/v2/programs/{program_b.id}").status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_brapi_locations_and_variables_are_global_reference_data(two_program_trials):
    program_a, *_ = two_program_trials
    loc = Location.objects.first()
    var = ObservationVariable.objects.create(name="Height", data_type="numeric")

    client_a, _ = _client_for("breeder", program_a)

    assert client_a.get(f"/brapi/v2/locations/{loc.id}").status_code == status.HTTP_200_OK
    assert client_a.get(f"/brapi/v2/variables/{var.id}").status_code == status.HTTP_200_OK
