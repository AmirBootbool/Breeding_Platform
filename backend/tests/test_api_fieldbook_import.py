import io
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.trials.models import Observation, ObservationVariable, Plot, Trial


@pytest.fixture
def fieldbook_variables():
    height = ObservationVariable.objects.create(
        name="Plant height",
        variable_code="PH",
        data_type="numeric",
        unit="cm",
        min_value=10.0,
        max_value=200.0,
    )
    yield_var = ObservationVariable.objects.create(
        name="Grain yield",
        variable_code="GY",
        data_type="numeric",
        unit="t/ha",
    )
    heading = ObservationVariable.objects.create(
        name="Heading date",
        variable_code="HD",
        data_type="date",
    )
    notes = ObservationVariable.objects.create(
        name="Field notes",
        variable_code="FN",
        data_type="text",
    )
    return {
        "height": height,
        "yield": yield_var,
        "heading": heading,
        "notes": notes,
    }


@pytest.fixture
def trial_with_plots(program, location, season, germplasm, second_germplasm):
    trial = Trial.objects.create(
        name="Field Book Test Trial",
        trial_code="TR-FB-01",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=2,
    )
    p1 = Plot.objects.create(trial=trial, germplasm=germplasm, rep=1, plot_number=101)
    p2 = Plot.objects.create(trial=trial, germplasm=second_germplasm, rep=1, plot_number=102)
    p3 = Plot.objects.create(trial=trial, germplasm=germplasm, rep=2, plot_number=201)
    p4 = Plot.objects.create(trial=trial, germplasm=second_germplasm, rep=2, plot_number=202)
    return trial, [p1, p2, p3, p4]


@pytest.mark.django_db
def test_import_fieldbook_csv_success(client_for_role, trial_with_plots, fieldbook_variables):
    client = client_for_role("breeder")
    trial, plots = trial_with_plots

    csv_content = (
        "plot_id,Plant height,Grain yield,Heading date,Field notes\n"
        "101,85.5,4.2,2026-05-10,Good vigor\n"
        "102,90.0,3.8,2026-05-12,Slight lodging\n"
        "201,84.0,4.5,2026-05-11,\n"
        "202,89.5,4.1,2026-05-13,Uniform canopy\n"
    )
    file_obj = SimpleUploadedFile("fb_export.csv", csv_content.encode("utf-8-sig"), content_type="text/csv")

    response = client.post(
        f"/api/trials/{trial.id}/import_fieldbook/",
        {"file": file_obj},
        format="multipart",
    )

    assert response.status_code == 200
    assert response.data["imported_count"] == 15  # 4 rows * 4 traits (minus 1 empty note = 15)
    assert response.data["updated_count"] == 0
    assert len(response.data["errors"]) == 0

    obs = Observation.objects.filter(plot__trial=trial)
    assert obs.count() == 15

    obs_p1_ph = Observation.objects.get(plot__plot_number=101, variable=fieldbook_variables["height"])
    assert obs_p1_ph.value_numeric == 85.5

    obs_p2_hd = Observation.objects.get(plot__plot_number=102, variable=fieldbook_variables["heading"])
    assert str(obs_p2_hd.value_date) == "2026-05-12"


@pytest.mark.django_db
def test_import_fieldbook_csv_updates_existing(client_for_role, trial_with_plots, fieldbook_variables):
    client = client_for_role("technician")
    trial, plots = trial_with_plots

    # Pre-create an observation
    Observation.objects.create(
        plot=plots[0],
        variable=fieldbook_variables["height"],
        value_numeric=80.0,
    )

    csv_content = (
        "plot,Plant height\n"
        "101,87.5\n"
        "102,92.0\n"
    )
    file_obj = SimpleUploadedFile("fb_update.csv", csv_content.encode("utf-8"), content_type="text/csv")

    response = client.post(
        f"/api/trials/{trial.id}/import_fieldbook/",
        {"file": file_obj},
        format="multipart",
    )

    assert response.status_code == 200
    assert response.data["imported_count"] == 1  # plot 102
    assert response.data["updated_count"] == 1   # plot 101 updated

    obs_p1 = Observation.objects.get(plot__plot_number=101, variable=fieldbook_variables["height"])
    assert obs_p1.value_numeric == 87.5


@pytest.mark.django_db
def test_import_fieldbook_dry_run(client_for_role, trial_with_plots, fieldbook_variables):
    client = client_for_role("breeder")
    trial, plots = trial_with_plots

    csv_content = (
        "plot_number,Plant height\n"
        "101,85.0\n"
    )
    file_obj = SimpleUploadedFile("fb_dry.csv", csv_content.encode("utf-8"), content_type="text/csv")

    response = client.post(
        f"/api/trials/{trial.id}/import_fieldbook/",
        {"file": file_obj, "dry_run": "true"},
        format="multipart",
    )

    assert response.status_code == 200
    assert response.data["dry_run"] is True
    assert Observation.objects.filter(plot__trial=trial).count() == 0


@pytest.mark.django_db
def test_import_fieldbook_validation_error_rollback(client_for_role, trial_with_plots, fieldbook_variables):
    client = client_for_role("breeder")
    trial, plots = trial_with_plots

    # Value 999.0 exceeds max_value of 200.0 for Plant height
    csv_content = (
        "plot_id,Plant height\n"
        "101,85.0\n"
        "102,999.0\n"
    )
    file_obj = SimpleUploadedFile("fb_invalid.csv", csv_content.encode("utf-8"), content_type="text/csv")

    response = client.post(
        f"/api/trials/{trial.id}/import_fieldbook/",
        {"file": file_obj},
        format="multipart",
    )

    assert response.status_code == 400
    assert len(response.data["errors"]) > 0
    # Nothing should be committed due to rollback
    assert Observation.objects.filter(plot__trial=trial).count() == 0


@pytest.mark.django_db
def test_import_fieldbook_rbac_viewer_forbidden(client_for_role, trial_with_plots, fieldbook_variables):
    viewer_client = client_for_role("viewer")
    trial, _ = trial_with_plots

    csv_content = "plot_id,Plant height\n101,85.0\n"
    file_obj = SimpleUploadedFile("fb.csv", csv_content.encode("utf-8"), content_type="text/csv")

    response = viewer_client.post(
        f"/api/trials/{trial.id}/import_fieldbook/",
        {"file": file_obj},
        format="multipart",
    )
    assert response.status_code == 403
