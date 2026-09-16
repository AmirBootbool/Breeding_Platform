import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Location, Program, Season, UserProfile
from apps.germplasm.models import Germplasm
from apps.trials.models import Plot, Trial

User = get_user_model()


@pytest.fixture
def trial_setup(db):
    program_a = Program.objects.create(name="Program A", crop="wheat")
    program_b = Program.objects.create(name="Program B", crop="wheat")
    loc = Location.objects.create(name="Field Station")
    season = Season.objects.create(name="2026", year=2026, program=program_a)

    trial = Trial.objects.create(
        name="Trial A", trial_code="TR-A", program=program_a,
        location=loc, season=season, design_type="RCBD",
    )
    germ_a = Germplasm.objects.create(name="Line A", program=program_a)
    germ_b = Germplasm.objects.create(name="Line B (other program)", program=program_b)
    plot = Plot.objects.create(trial=trial, germplasm=germ_a, rep=1, plot_number=1)

    user = User.objects.create_user(username="breeder_a", password="password12345")
    UserProfile.objects.create(user=user, role="breeder", program=program_a)
    client = APIClient()
    client.force_authenticate(user=user)

    return client, trial, plot, germ_a, germ_b


@pytest.mark.django_db
def test_batch_update_plots_rejects_foreign_program_germplasm(trial_setup):
    client, trial, plot, germ_a, germ_b = trial_setup

    resp = client.patch(
        f"/api/trials/{trial.id}/batch_update_plots/",
        {"plots": [{"id": plot.id, "germplasm": germ_b.id}]},
        format="json",
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    plot.refresh_from_db()
    assert plot.germplasm_id == germ_a.id


@pytest.mark.django_db
def test_batch_update_plots_rejects_nonexistent_germplasm(trial_setup):
    client, trial, plot, germ_a, _ = trial_setup

    resp = client.patch(
        f"/api/trials/{trial.id}/batch_update_plots/",
        {"plots": [{"id": plot.id, "germplasm": 999999}]},
        format="json",
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_batch_update_plots_accepts_same_program_germplasm(trial_setup):
    client, trial, plot, germ_a, _ = trial_setup
    other_germ = Germplasm.objects.create(name="Line C", program=trial.program)

    resp = client.patch(
        f"/api/trials/{trial.id}/batch_update_plots/",
        {"plots": [{"id": plot.id, "germplasm": other_germ.id}]},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    plot.refresh_from_db()
    assert plot.germplasm_id == other_germ.id


@pytest.mark.django_db
def test_add_grid_cells_rejects_foreign_program_fill_germplasm(trial_setup):
    client, trial, plot, germ_a, germ_b = trial_setup

    resp = client.post(
        f"/api/trials/{trial.id}/add_grid_cells/",
        {"type": "row", "location": "bottom", "count": 1, "fill_germplasm_id": germ_b.id},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_add_grid_cells_rejects_non_numeric_count(trial_setup):
    client, trial, plot, germ_a, _ = trial_setup

    resp = client.post(
        f"/api/trials/{trial.id}/add_grid_cells/",
        {"type": "row", "location": "bottom", "count": "lots"},
        format="json",
    )
    assert resp.status_code == 400
