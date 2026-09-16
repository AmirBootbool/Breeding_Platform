from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Location, Program, Season, UserProfile
from apps.germplasm.models import Germplasm
from apps.trials.models import AnalysisSet, Observation, ObservationVariable, Plot, Trial
from apps.trials.services import compute_heritability

User = get_user_model()


@pytest.fixture
def program(db):
    return Program.objects.create(name="Trial Program", crop="wheat")


@pytest.fixture
def client(program):
    user = User.objects.create_user(username="breeder", password="password12345")
    UserProfile.objects.create(user=user, role="breeder", program=program)
    api_client = APIClient()
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.django_db
def test_compute_heritability_fits_environment_as_a_fixed_effect(program):
    # Regression guard for the "value ~ 1" -> "value ~ environment" fix:
    # assert the actual formula string statsmodels receives, rather than
    # trying to reverse-engineer it from output variance numbers.
    loc1 = Location.objects.create(name="Loc1")
    loc2 = Location.objects.create(name="Loc2")
    season1 = Season.objects.create(name="2024", year=2024, program=program)
    season2 = Season.objects.create(name="2025", year=2025, program=program)

    g1 = Germplasm.objects.create(name="G1", program=program)
    g2 = Germplasm.objects.create(name="G2", program=program)
    g3 = Germplasm.objects.create(name="G3", program=program)

    t1 = Trial.objects.create(
        name="Trial 1", trial_code="T1", program=program, location=loc1, season=season1
    )
    t2 = Trial.objects.create(
        name="Trial 2", trial_code="T2", program=program, location=loc2, season=season2
    )
    var = ObservationVariable.objects.create(name="Yield", unit="kg/ha", data_type="numeric")

    aset = AnalysisSet.objects.create(name="Set", program=program)
    aset.trials.add(t1, t2)

    plot_num = 1
    for trial in (t1, t2):
        for rep in (1, 2):
            for g, base_val in [(g1, 10.0), (g2, 7.0), (g3, 4.0)]:
                plot = Plot.objects.create(
                    trial=trial, germplasm=g, rep=rep, plot_number=plot_num
                )
                plot_num += 1
                Observation.objects.create(plot=plot, variable=var, value_numeric=base_val + rep * 0.1)

    import statsmodels.formula.api as smf

    with patch("statsmodels.formula.api.mixedlm", wraps=smf.mixedlm) as mock_mixedlm:
        result = compute_heritability(aset, var)

    assert result["h2"] is not None
    formulas_used = [call.args[0] for call in mock_mixedlm.call_args_list]
    assert formulas_used
    assert all(f == "value ~ environment" for f in formulas_used)


@pytest.mark.django_db
def test_spatial_heatmap_excludes_plots_missing_coordinates(client, program):
    loc = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026", year=2026, program=program)
    trial = Trial.objects.create(
        name="Trial", trial_code="TR-1", program=program, location=loc,
        season=season, design_type="RCBD",
    )
    var = ObservationVariable.objects.create(name="Height", data_type="numeric")
    g1 = Germplasm.objects.create(name="G1", program=program)
    g2 = Germplasm.objects.create(name="G2", program=program)

    # Plot with coordinates.
    plot_a = Plot.objects.create(
        trial=trial, germplasm=g1, rep=1, plot_number=1, row=1, column=1,
    )
    Observation.objects.create(plot=plot_a, variable=var, value_numeric=5.0)
    # Plot missing coordinates - rep/plot_number would collide with plot_a's
    # row/column if substituted in, as the old code did.
    plot_b = Plot.objects.create(
        trial=trial, germplasm=g2, rep=1, plot_number=2,
    )
    Observation.objects.create(plot=plot_b, variable=var, value_numeric=9.0)

    resp = client.get(f"/api/trials/{trial.id}/spatial_heatmap/?variable_id={var.id}")
    assert resp.status_code == 200
    data = resp.data

    assert data["dimensions"]["coordinate_type"] == "row_col"
    assert data["excluded_plot_count"] == 1
    cell_plot_ids = {c["plot_id"] for c in data["cells"]}
    assert plot_a.id in cell_plot_ids
    assert plot_b.id not in cell_plot_ids
