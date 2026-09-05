import pytest
from apps.core.models import Location, Program, Season
from apps.germplasm.models import Germplasm
from apps.trials.models import Observation, ObservationVariable, Plot, Trial


@pytest.fixture
def spatial_trial_setup(db, user):
    program = Program.objects.create(name="Wheat Bread Program", crop="wheat", created_by=user)
    location = Location.objects.create(name="Bet Dagan Field")
    season = Season.objects.create(name="2026 Winter", year=2026, program=program)

    trial = Trial.objects.create(
        program=program,
        location=location,
        season=season,
        name="Advanced Yield Trial",
        trial_code="AYT-2026",
        design_type="RCBD",
        num_reps=2,
    )

    var_yield = ObservationVariable.objects.create(
        name="Grain Yield",
        variable_code="GY",
        data_type="numeric",
        unit="t/ha",
        min_value=0.0,
        max_value=15.0,
        crop="wheat",
    )

    g1 = Germplasm.objects.create(name="Omer", program=program)
    g2 = Germplasm.objects.create(name="Rotem", program=program)
    g3 = Germplasm.objects.create(name="BarNir", program=program)

    # 2 reps x 3 plots = 6 plots
    plots = [
        Plot.objects.create(trial=trial, germplasm=g1, rep=1, plot_number=101, row=1, column=1, is_check=False),
        Plot.objects.create(trial=trial, germplasm=g2, rep=1, plot_number=102, row=1, column=2, is_check=False),
        Plot.objects.create(trial=trial, germplasm=g3, rep=1, plot_number=103, row=1, column=3, is_check=True),
        Plot.objects.create(trial=trial, germplasm=g3, rep=2, plot_number=201, row=2, column=1, is_check=True),
        Plot.objects.create(trial=trial, germplasm=g1, rep=2, plot_number=202, row=2, column=2, is_check=False),
        Plot.objects.create(trial=trial, germplasm=g2, rep=2, plot_number=203, row=2, column=3, is_check=False),
    ]

    yield_vals = [6.0, 7.5, 9.0, 8.5, 6.5, 7.0]
    for plot, val in zip(plots, yield_vals):
        Observation.objects.create(plot=plot, variable=var_yield, value_numeric=val)

    return trial, var_yield, plots


def test_spatial_heatmap_endpoint(client_for_role, spatial_trial_setup):
    trial, var_yield, plots = spatial_trial_setup
    client = client_for_role("breeder")

    url = f"/api/trials/{trial.id}/spatial_heatmap/?variable_id={var_yield.id}"
    response = client.get(url)
    assert response.status_code == 200
    data = response.json()

    assert data["trial_id"] == trial.id
    assert data["variable"]["name"] == "Grain Yield"
    assert data["stats"]["min"] == 6.0
    assert data["stats"]["max"] == 9.0
    assert data["stats"]["count"] == 6
    assert len(data["cells"]) == 6

    # Verify normalization range
    min_cell = next(c for c in data["cells"] if c["plot_number"] == 101)
    max_cell = next(c for c in data["cells"] if c["plot_number"] == 103)
    assert min_cell["normalized_value"] == 0.0
    assert max_cell["normalized_value"] == 1.0

    # Verify margin averages
    assert len(data["row_margins"]) == 2
    assert len(data["col_margins"]) == 3
    # Row 1 mean: (6.0 + 7.5 + 9.0) / 3 = 7.5
    assert data["row_margins"][0]["mean"] == 7.5


def test_spatial_heatmap_missing_variable_param(client_for_role, spatial_trial_setup):
    trial, _, _ = spatial_trial_setup
    client = client_for_role("breeder")

    url = f"/api/trials/{trial.id}/spatial_heatmap/"
    response = client.get(url)
    assert response.status_code == 400
    assert "variable_id" in response.json()["detail"]


def test_spatial_heatmap_nonexistent_variable(client_for_role, spatial_trial_setup):
    trial, _, _ = spatial_trial_setup
    client = client_for_role("breeder")

    url = f"/api/trials/{trial.id}/spatial_heatmap/?variable_id=99999"
    response = client.get(url)
    assert response.status_code == 404
