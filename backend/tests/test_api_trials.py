import pytest

from apps.trials.models import Plot


@pytest.mark.django_db
def test_trial_create_plots(auth_client, trial, germplasm, second_germplasm):
    response = auth_client.post(
        f"/api/trials/{trial.id}/create_plots/",
        {},
        format="json",
    )

    assert response.status_code == 201
    assert response.data["created_count"] == 4
    assert Plot.objects.filter(trial=trial).count() == 4

    list_response = auth_client.get("/api/trials/")
    assert list_response.status_code == 200
    assert list_response.data["count"] == 1
    assert list_response.data["results"][0]["plot_count"] == 4


@pytest.mark.django_db
def test_trial_create_plots_rejects_invalid_germplasm_ids(auth_client, trial):
    response = auth_client.post(
        f"/api/trials/{trial.id}/create_plots/",
        {"germplasm_ids": [999999]},
        format="json",
    )

    assert response.status_code == 400
    assert "germplasm_ids" in response.data["errors"]


@pytest.mark.django_db
def test_trial_create_plots_rejects_duplicate_generation(auth_client, trial, germplasm):
    first_response = auth_client.post(
        f"/api/trials/{trial.id}/create_plots/",
        {"germplasm_ids": [germplasm.id]},
        format="json",
    )
    second_response = auth_client.post(
        f"/api/trials/{trial.id}/create_plots/",
        {"germplasm_ids": [germplasm.id]},
        format="json",
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 400
    assert "trial" in second_response.data["errors"]


@pytest.mark.django_db
def test_technician_cannot_create_trial_plots(client_for_role, trial, germplasm):
    client = client_for_role("technician")

    response = client.post(
        f"/api/trials/{trial.id}/create_plots/",
        {"germplasm_ids": [germplasm.id]},
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_technician_can_record_observation(client_for_role, plot, observation_variable):
    client = client_for_role("technician")

    response = client.post(
        "/api/observations/",
        {
            "plot": plot.id,
            "variable": observation_variable.id,
            "value_numeric": 83.5,
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["value_numeric"] == 83.5


@pytest.mark.django_db
def test_technician_can_update_plot_status_but_not_create_trial(
    client_for_role, plot, program, location, season
):
    client = client_for_role("technician")

    plot_response = client.patch(
        f"/api/plots/{plot.id}/", {"status": "planted"}, format="json"
    )
    trial_response = client.post(
        "/api/trials/",
        {
            "name": "Blocked Trial",
            "trial_code": "TR-TECH",
            "program": program.id,
            "location": location.id,
            "season": season.id,
            "design_type": "RCBD",
            "num_reps": 1,
        },
        format="json",
    )

    assert plot_response.status_code == 200
    assert plot_response.data["status"] == "planted"
    assert trial_response.status_code == 403


@pytest.mark.django_db
def test_viewer_cannot_record_observation(client_for_role, plot, observation_variable):
    client = client_for_role("viewer")

    response = client.post(
        "/api/observations/",
        {
            "plot": plot.id,
            "variable": observation_variable.id,
            "value_numeric": 83.5,
        },
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_trial_summary_with_observations(auth_client, trial, plot, observation_variable):
    from apps.trials.models import Observation, Plot

    second_plot = Plot.objects.create(
        trial=trial, germplasm=plot.germplasm, rep=2, plot_number=2
    )

    Observation.objects.create(
        plot=plot, variable=observation_variable, value_numeric=10.0
    )
    Observation.objects.create(
        plot=second_plot, variable=observation_variable, value_numeric=20.0
    )

    response = auth_client.get(f"/api/trials/{trial.id}/summary/")
    assert response.status_code == 200
    assert response.data["trial"] == trial.trial_code

    summary = response.data["summary"]
    assert len(summary) == 1
    stats = summary[0]
    assert stats["variable"] == observation_variable.name
    assert stats["count"] == 2
    assert stats["mean"] == 15.0
    assert stats["min"] == 10.0
    assert stats["max"] == 20.0
    assert stats["std_dev"] is not None
    assert stats["cv_percent"] is not None


@pytest.mark.django_db
def test_trial_summary_without_observations(auth_client, trial):
    response = auth_client.get(f"/api/trials/{trial.id}/summary/")
    assert response.status_code == 200
    assert response.data["trial"] == trial.trial_code
    assert response.data["summary"] == []

