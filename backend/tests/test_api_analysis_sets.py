import pytest

from apps.germplasm.models import Germplasm
from apps.trials.models import (
    AnalysisSet,
    Observation,
    ObservationVariable,
    Plot,
    Trial,
)


@pytest.mark.django_db
def test_analysis_sets_api_rbac(
    auth_client, client_for_role, program, location, season, trial
):
    # Breeder (auth_client) can create
    trial2 = Trial.objects.create(
        name="Trial Two",
        trial_code="TR-002",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=2,
    )

    response = auth_client.post(
        "/api/analysis-sets/",
        {
            "name": "Yield Set 2026",
            "program": program.id,
            "trials": [trial.id, trial2.id],
            "description": "Joint analysis of 2026 trials",
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.data["name"] == "Yield Set 2026"
    assert len(response.data["trials"]) == 2

    # Viewer cannot create
    viewer_client = client_for_role("viewer")
    viewer_response = viewer_client.post(
        "/api/analysis-sets/",
        {
            "name": "Viewer Yield Set",
            "program": program.id,
            "trials": [trial.id],
        },
        format="json",
    )
    assert viewer_response.status_code == 403

    # Viewer can list/retrieve
    list_response = viewer_client.get("/api/analysis-sets/")
    assert list_response.status_code == 200
    assert list_response.data["count"] == 1


@pytest.mark.django_db
def test_analysis_sets_heritability_and_ranking_api(
    auth_client, program, location, season, trial, observation_variable
):
    from apps.core.models import Location

    second_loc = Location.objects.create(name="Test Field 2")
    trial2 = Trial.objects.create(
        name="Trial Two",
        trial_code="TR-002",
        program=program,
        location=second_loc,
        season=season,
        design_type="RCBD",
        num_reps=2,
    )

    aset = AnalysisSet.objects.create(
        name="Multi-Env Analysis",
        program=program,
    )
    aset.trials.add(trial)
    aset.trials.add(trial2)

    # Without variable param -> 400
    res_no_var = auth_client.get(f"/api/analysis-sets/{aset.id}/heritability/")
    assert res_no_var.status_code == 400
    assert "variable query param is required" in res_no_var.data["detail"]

    # Generate synthetic observations to compute heritability
    gp1 = Germplasm.objects.create(name="G1", program=program)
    gp2 = Germplasm.objects.create(name="G2", program=program)
    gp3 = Germplasm.objects.create(name="G3", program=program)

    plot_num = 1
    for t in [trial, trial2]:
        for rep in [1, 2]:
            for g, base in [(gp1, 8.0), (gp2, 5.0), (gp3, 3.0)]:
                plot = Plot.objects.create(
                    trial=t, germplasm=g, rep=rep, plot_number=plot_num
                )
                Observation.objects.create(
                    plot=plot,
                    variable=observation_variable,
                    value_numeric=base + 0.1 * rep,
                )
                plot_num += 1

    # With valid variable and enough data -> 200, return results
    res_h2 = auth_client.get(
        f"/api/analysis-sets/{aset.id}/heritability/?variable={observation_variable.id}"
    )
    assert res_h2.status_code == 200
    assert "h2" in res_h2.data
    assert res_h2.data["h2"] is not None
    assert 0 <= res_h2.data["h2"] <= 1.0

    # Ranking endpoint -> 200, list sorted by adjusted_mean descending
    res_rank = auth_client.get(
        f"/api/analysis-sets/{aset.id}/ranking/?variable={observation_variable.id}"
    )
    assert res_rank.status_code == 200
    assert len(res_rank.data) == 3
    assert res_rank.data[0]["germplasm"] == "G1"
    assert res_rank.data[0]["adjusted_mean"] > res_rank.data[1]["adjusted_mean"]
