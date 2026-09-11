import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import Program, UserProfile
from apps.germplasm.models import Germplasm
from apps.trials.models import Location, Observation, ObservationVariable, Plot, Season, Trial
from apps.genomics.models import DiagnosticMarker, GenotypeDataset, GenotypeSample, MarkerScore


@pytest.fixture
def auth_client(django_user_model):
    user = django_user_model.objects.create_user(
        username="genomic_breeder", password="password123456", email="breeder@wheat.org"
    )
    UserProfile.objects.create(user=user, role="breeder")

    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.mark.django_db
def test_diagnostic_markers_api(auth_client):
    client, user = auth_client
    program = Program.objects.create(name="Bread Wheat", crop="wheat")

    # Seed markers
    seed_res = client.post("/api/diagnostic-markers/seed_defaults/", {"program_id": program.id})
    assert seed_res.status_code == status.HTTP_200_OK
    assert seed_res.data["seeded_count"] >= 6

    # List markers
    list_res = client.get("/api/diagnostic-markers/")
    assert list_res.status_code == status.HTTP_200_OK
    assert len(list_res.data["results"]) >= 6


@pytest.mark.django_db
def test_mas_batch_score_and_stacking_api(auth_client):
    client, user = auth_client
    program = Program.objects.create(name="Bread Wheat", crop="wheat")
    g = Germplasm.objects.create(name="Line_XYZ", program=program)
    m = DiagnosticMarker.objects.create(
        name="Fhb1_Test",
        target_trait="FHB",
        favorable_allele="Resistant",
        program=program,
    )

    # Batch score
    score_res = client.post(
        "/api/marker-scores/batch_score/",
        {
            "scores": [
                {
                    "marker_id": m.id,
                    "germplasm_id": g.id,
                    "call_status": "favorable",
                    "raw_genotype": "A:A",
                }
            ]
        },
        format="json",
    )
    assert score_res.status_code == status.HTTP_200_OK
    assert score_res.data["updated_count"] == 1

    # Stacking overview
    stack_res = client.get(f"/api/marker-scores/stacking_overview/?program={program.id}")
    assert stack_res.status_code == status.HTTP_200_OK
    assert len(stack_res.data["lines"]) == 1
    assert stack_res.data["lines"][0]["favorable_count"] == 1


@pytest.mark.django_db
def test_genotype_dataset_and_prediction_api(auth_client):
    client, user = auth_client
    program = Program.objects.create(name="Durum Wheat", crop="wheat")
    loc = Location.objects.create(name="Field Station 1", country="US")
    season = Season.objects.create(name="2026", year=2026, program=program)

    trait = ObservationVariable.objects.create(name="Grain Yield", unit="t/ha", data_type="numeric")
    trial = Trial.objects.create(
        name="Durum Trial 2026",
        trial_code="DURUM-2026",
        program=program,
        location=loc,
        season=season,
        design_type="RCBD",
    )

    # Create 5 germplasm entries
    germplasm_objs = [
        Germplasm.objects.create(name=f"Durum_{i}", program=program)
        for i in range(1, 6)
    ]

    # Create plots and observations for 3 lines (training set)
    for i in range(3):
        plot = Plot.objects.create(
            trial=trial,
            germplasm=germplasm_objs[i],
            rep=1,
            plot_number=i + 1,
        )
        Observation.objects.create(
            plot=plot,
            variable=trait,
            value_numeric=4.5 + i * 0.8,
        )

    # Create GenotypeDataset directly with matrix data
    sample_names = [f"Durum_{i}" for i in range(1, 6)]
    matrix_dict = {
        "Durum_1": [0.0, 1.0, 2.0, 0.0],
        "Durum_2": [1.0, 1.0, 0.0, 2.0],
        "Durum_3": [2.0, 0.0, 1.0, 1.0],
        "Durum_4": [0.0, 2.0, 2.0, 0.0],
        "Durum_5": [1.0, 0.0, 0.0, 2.0],
    }

    dataset = GenotypeDataset.objects.create(
        name="Durum SNP Panel",
        program=program,
        marker_count=4,
        sample_count=5,
        marker_names=["SNP1", "SNP2", "SNP3", "SNP4"],
        sample_names=sample_names,
        matrix_data=matrix_dict,
        created_by=user,
    )

    # Test GRM endpoint
    grm_res = client.get(f"/api/genotype-datasets/{dataset.id}/grm_matrix/")
    assert grm_res.status_code == status.HTTP_200_OK
    assert grm_res.data["sample_count"] == 5
    assert len(grm_res.data["pca_coordinates"]) == 5

    # Run Prediction
    pred_res = client.post(
        "/api/genomic-predictions/run_prediction/",
        {
            "name": "Durum Yield GBLUP",
            "program": program.id,
            "trait": trait.id,
            "genotype_dataset": dataset.id,
            "training_trial": trial.id,
            "heritability_prior": 0.50,
            "k_folds": 2,
        },
        format="json",
    )

    assert pred_res.status_code == status.HTTP_201_CREATED
    assert pred_res.data["prediction"]["n_training"] == 3
    assert pred_res.data["prediction"]["n_candidates"] == 2

    pred_id = pred_res.data["prediction"]["id"]

    # Fetch GEBVs
    gebv_res = client.get(f"/api/genomic-predictions/{pred_id}/gebvs/")
    assert gebv_res.status_code == status.HTTP_200_OK
    assert gebv_res.data["count"] == 5

    # Test CSV Export
    export_res = client.get(f"/api/genomic-predictions/{pred_id}/export_gebv_csv/")
    assert export_res.status_code == status.HTTP_200_OK
    assert "text/csv" in export_res["Content-Type"]
