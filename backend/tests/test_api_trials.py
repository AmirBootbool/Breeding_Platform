import pytest

from apps.trials.models import Plot, Trial


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
def test_trial_summary_with_observations(
    auth_client, trial, plot, observation_variable
):
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


@pytest.mark.django_db
def test_export_csv_returns_csv_download(auth_client, trial, plot, observation_variable):
    from apps.trials.models import Observation

    Observation.objects.create(
        plot=plot, variable=observation_variable, value_numeric=42.5
    )

    response = auth_client.get(f"/api/trials/{trial.id}/export_csv/")
    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    assert "attachment" in response["Content-Disposition"]
    assert f"{trial.trial_code}_observations.csv" in response["Content-Disposition"]

    content = b"".join(response.streaming_content).decode("utf-8")
    assert "plot_number" in content
    assert "germplasm_name" in content
    assert "42.5" in content


@pytest.mark.django_db
def test_export_fieldbook_returns_csv_download(
    auth_client, trial, plot, observation_variable
):
    response = auth_client.get(f"/api/trials/{trial.id}/export_fieldbook/")
    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    assert "attachment" in response["Content-Disposition"]
    assert f"{trial.trial_code}_fieldbook.csv" in response["Content-Disposition"]

    content = b"".join(response.streaming_content).decode("utf-8")
    assert "plot_id" in content
    assert "range" in content
    assert "entry" in content
    assert plot.germplasm.name in content


@pytest.mark.django_db
def test_trial_summary_multiple_variables(
    auth_client, trial, plot, observation_variable
):
    from apps.trials.models import Observation, ObservationVariable

    sec_var = ObservationVariable.objects.create(
        name="Grain yield", variable_code="GY", data_type="numeric"
    )

    Observation.objects.create(
        plot=plot, variable=observation_variable, value_numeric=15.0
    )
    Observation.objects.create(
        plot=plot, variable=sec_var, value_numeric=50.0
    )

    response = auth_client.get(f"/api/trials/{trial.id}/summary/")
    assert response.status_code == 200

    summary = response.data["summary"]
    assert len(summary) == 2

    names = [s["variable"] for s in summary]
    assert observation_variable.name in names
    assert sec_var.name in names


@pytest.mark.django_db
def test_trial_audit_fields(client_for_role, program, location, season):
    client = client_for_role("breeder")

    # Create Trial via API
    response = client.post(
        "/api/trials/",
        {
            "name": "Audit Trial",
            "trial_code": "TR-AUDIT",
            "program": program.id,
            "location": location.id,
            "season": season.id,
            "design_type": "RCBD",
            "num_reps": 1,
        },
        format="json"
    )
    assert response.status_code == 201

    from apps.trials.models import Trial
    trial_obj = Trial.objects.get(trial_code="TR-AUDIT")
    assert trial_obj.created_by is not None
    assert trial_obj.created_by.username == "breeder_user"
    assert trial_obj.updated_by == trial_obj.created_by
    assert response.data["created_by_username"] == "breeder_user"
    assert response.data["updated_by_username"] == "breeder_user"

    # Update Trial via API
    other_client = client_for_role("breeder", username="other_breeder")
    response_patch = other_client.patch(
        f"/api/trials/{trial_obj.id}/",
        {"name": "Audit Trial Updated"},
        format="json"
    )
    assert response_patch.status_code == 200
    trial_obj.refresh_from_db()
    assert trial_obj.created_by.username == "breeder_user"
    assert trial_obj.updated_by.username == "other_breeder"
    assert response_patch.data["created_by_username"] == "breeder_user"
    assert response_patch.data["updated_by_username"] == "other_breeder"


@pytest.mark.django_db
def test_create_plots_alpha_lattice(client_for_role, program, location, season):
    client = client_for_role("breeder")
    from apps.germplasm.models import Germplasm

    # Create 12 germplasms for program
    germplasms = [
        Germplasm.objects.create(
            name=f"Line{i}", germplasm_db_id=f"G{i:03d}", program=program
        )
        for i in range(1, 13)
    ]
    germplasm_ids = [g.id for g in germplasms]

    # Create Trial with alpha_lattice design
    trial = Trial.objects.create(
        name="Alpha Trial API",
        trial_code="TR-API-ALPHA",
        program=program,
        location=location,
        season=season,
        design_type="alpha_lattice",
        num_reps=2,
        block_size=4,
    )

    # 1. Success path
    response = client.post(
        f"/api/trials/{trial.id}/create_plots/",
        {"germplasm_ids": germplasm_ids, "seed": 42},
        format="json",
    )
    assert response.status_code == 201
    assert response.data["created_count"] == 24
    assert len(response.data["plots"]) == 24
    assert all(p["incomplete_block"] is not None for p in response.data["plots"])

    # 2. Non-divisible entry count
    trial2 = Trial.objects.create(
        name="Alpha Trial API Fail",
        trial_code="TR-API-ALPHA-FAIL",
        program=program,
        location=location,
        season=season,
        design_type="alpha_lattice",
        num_reps=2,
        block_size=5, # 12 % 5 != 0
    )
    response_fail = client.post(
        f"/api/trials/{trial2.id}/create_plots/",
        {"germplasm_ids": germplasm_ids, "seed": 42},
        format="json",
    )
    assert response_fail.status_code == 400


@pytest.mark.django_db
def test_create_plots_augmented(client_for_role, program, location, season):
    client = client_for_role("breeder")
    from apps.germplasm.models import Germplasm

    # Create 12 germplasms
    germplasms = [
        Germplasm.objects.create(
            name=f"Line{i}", germplasm_db_id=f"G{i:03d}", program=program
        )
        for i in range(1, 13)
    ]
    germplasm_ids = [g.id for g in germplasms]
    check_ids = germplasm_ids[:3] # first 3 are checks

    trial = Trial.objects.create(
        name="Aug Trial API",
        trial_code="TR-API-AUG",
        program=program,
        location=location,
        season=season,
        design_type="augmented",
        num_reps=3,
    )

    response = client.post(
        f"/api/trials/{trial.id}/create_plots/",
        {
            "germplasm_ids": germplasm_ids,
            "check_germplasm_ids": check_ids,
            "seed": 42,
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.data["created_count"] == 18 # 3 checks * 3 reps + 9 tests = 18 plots
    # Check checks count
    checks_marked = [p for p in response.data["plots"] if p["is_check"]]
    assert len(checks_marked) == 9
