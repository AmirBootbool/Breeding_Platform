import io
import pytest
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from apps.core.models import Program, UserProfile, Season, Location, WeatherObservation
from apps.germplasm.models import Germplasm
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
def test_trial_qc_flags(program, season, location):
    client, _ = _client_for("breeder", program)

    var = ObservationVariable.objects.create(
        name="Grain Yield",
        data_type="numeric",
        category="agronomic",
        min_value=0.0,
        max_value=15.0,
    )

    trial = Trial.objects.create(
        name="Yield Trial 1",
        trial_code="YT-01",
        program=program,
        season=season,
        location=location,
    )

    # 15 plots around 5.0
    for i in range(1, 16):
        g = Germplasm.objects.create(name=f"Line {i}", program=program)
        p = Plot.objects.create(trial=trial, plot_number=i, germplasm=g, rep=1)
        Observation.objects.create(plot=p, variable=var, value_numeric=5.0)

    # 1 outlier plot with 14.0 (passes min/max 15 validation, but z-score > 3)
    g_outlier = Germplasm.objects.create(name="Outlier Line", program=program)
    p_outlier = Plot.objects.create(trial=trial, plot_number=16, germplasm=g_outlier, rep=1)
    obs_outlier = Observation.objects.create(plot=p_outlier, variable=var, value_numeric=14.0)

    resp = client.get(f"/api/trials/{trial.id}/qc_flags/")
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.data) >= 1
    flagged_ids = [f["observation_id"] for f in resp.data]
    assert obs_outlier.id in flagged_ids


@pytest.mark.django_db
def test_weather_csv_import(program, location):
    client, _ = _client_for("breeder", program)

    csv_content = (
        "date,temp_min_c,temp_max_c,rainfall_mm,humidity_pct\n"
        "2026-03-01,10.5,25.2,0.0,45.0\n"
        "2026-03-02,12.0,27.5,5.2,60.0\n"
    ).encode("utf-8")

    csv_file = SimpleUploadedFile("weather.csv", csv_content, content_type="text/csv")

    resp = client.post(
        "/api/weather/import_csv/",
        {
            "location_id": location.id,
            "file": csv_file,
        },
        format="multipart",
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data["created_count"] == 2
    assert WeatherObservation.objects.filter(location=location).count() == 2


@pytest.mark.django_db
def test_observation_photo_upload(program, season, location):
    client, _ = _client_for("breeder", program)

    g1 = Germplasm.objects.create(name="Line 1", program=program)
    var = ObservationVariable.objects.create(name="Rust Severity", data_type="integer", category="disease")
    trial = Trial.objects.create(name="Disease Trial", trial_code="DT-01", program=program, season=season, location=location)
    plot = Plot.objects.create(trial=trial, plot_number=1, germplasm=g1, rep=1)
    obs = Observation.objects.create(plot=plot, variable=var, value_numeric=3.0)

    # Generate small valid in-memory image
    img = Image.new("RGB", (30, 30), color="green")
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="JPEG")
    img_file = SimpleUploadedFile("leaf.jpg", img_bytes.getvalue(), content_type="image/jpeg")

    resp = client.post(
        f"/api/observations/{obs.id}/upload_photo/",
        {"file": img_file},
        format="multipart",
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert "image" in resp.data
    assert obs.photos.count() == 1
