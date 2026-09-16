import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Location, Program, Season, UserProfile
from apps.germplasm.models import Germplasm
from apps.trials.models import AnalysisSet, Observation, ObservationVariable, Plot, Trial

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

    return program_a, program_b, trial_a, trial_b, plot_a, plot_b


@pytest.mark.django_db
def test_trial_scoped_to_own_program(two_program_trials):
    program_a, program_b, trial_a, trial_b, _, _ = two_program_trials
    client_a, _ = _client_for("breeder", program_a)
    client_staff, _ = _client_for("breeder", program_a, staff=True)

    assert client_a.get(f"/api/trials/{trial_a.id}/").status_code == status.HTTP_200_OK
    assert client_a.get(f"/api/trials/{trial_b.id}/").status_code == status.HTTP_404_NOT_FOUND

    staff_list = client_staff.get("/api/trials/")
    staff_ids = {row["id"] for row in staff_list.data["results"]}
    assert {trial_a.id, trial_b.id} <= staff_ids


@pytest.mark.django_db
def test_trial_create_rejects_foreign_program(two_program_trials):
    program_a, program_b, _, _, _, _ = two_program_trials
    loc = Location.objects.first()
    season_a = Season.objects.filter(program=program_a).first()
    client_a, _ = _client_for("breeder", program_a)

    resp = client_a.post(
        "/api/trials/",
        {
            "name": "Sneaky Trial",
            "trial_code": "TR-SNEAKY",
            "program": program_b.id,
            "location": loc.id,
            "season": season_a.id,
            "design_type": "RCBD",
        },
        format="json",
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN
    assert not Trial.objects.filter(trial_code="TR-SNEAKY").exists()


@pytest.mark.django_db
def test_plot_scoped_via_trial_program(two_program_trials):
    program_a, program_b, trial_a, trial_b, plot_a, plot_b = two_program_trials
    client_a, _ = _client_for("breeder", program_a)

    assert client_a.get(f"/api/plots/{plot_a.id}/").status_code == status.HTTP_200_OK
    assert client_a.get(f"/api/plots/{plot_b.id}/").status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_observation_scoped_via_plot_trial_program(two_program_trials):
    program_a, program_b, trial_a, trial_b, plot_a, plot_b = two_program_trials
    var = ObservationVariable.objects.create(name="Height", data_type="numeric")
    obs_a = Observation.objects.create(plot=plot_a, variable=var, value_numeric=10)
    obs_b = Observation.objects.create(plot=plot_b, variable=var, value_numeric=20)

    client_a, _ = _client_for("breeder", program_a)

    assert client_a.get(f"/api/observations/{obs_a.id}/").status_code == status.HTTP_200_OK
    assert client_a.get(f"/api/observations/{obs_b.id}/").status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_analysis_set_scoped_to_own_program(two_program_trials):
    program_a, program_b, trial_a, trial_b, _, _ = two_program_trials
    set_a = AnalysisSet.objects.create(name="Set A", program=program_a)
    set_b = AnalysisSet.objects.create(name="Set B", program=program_b)

    client_a, _ = _client_for("breeder", program_a)

    assert client_a.get(f"/api/analysis-sets/{set_a.id}/").status_code == status.HTTP_200_OK
    assert client_a.get(f"/api/analysis-sets/{set_b.id}/").status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_observation_variable_is_global_reference_data(two_program_trials):
    # ObservationVariable has no program field - it's a shared trait
    # dictionary and must stay visible to every program, unscoped.
    program_a, _, _, _, _, _ = two_program_trials
    var = ObservationVariable.objects.create(name="Height", data_type="numeric")

    client_a, _ = _client_for("breeder", program_a)
    assert client_a.get(f"/api/observation-variables/{var.id}/").status_code == status.HTTP_200_OK
