import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Program, UserProfile
from apps.germplasm.models import Germplasm
from apps.genomics.models import GenomicBreedingValue, GenomicPrediction, GenotypeDataset
from apps.genomics.services import compute_mas_stacking_matrix, run_k_fold_cross_validation
from apps.trials.models import ObservationVariable

User = get_user_model()


@pytest.fixture
def program(db):
    return Program.objects.create(name="Bread Wheat", crop="wheat")


@pytest.fixture
def client(program):
    user = User.objects.create_user(username="breeder", password="password12345")
    UserProfile.objects.create(user=user, role="breeder", program=program)
    api_client = APIClient()
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def trait(db):
    return ObservationVariable.objects.create(name="Grain Yield", unit="t/ha", data_type="numeric")


MATRIX = {
    "Line_1": [0.0, 1.0, 2.0, 0.0],
    "Line_2": [1.0, 1.0, 0.0, 2.0],
    "Line_3": [2.0, 0.0, 1.0, 1.0],
    "Line_4": [0.0, 2.0, 2.0, 0.0],
    "Line_5": [1.0, 0.0, 0.0, 2.0],
}


@pytest.mark.django_db
def test_run_prediction_persists_mu_and_predicted_performance_includes_it(client, program, trait):
    for name in MATRIX:
        Germplasm.objects.create(name=name, program=program)

    dataset = GenotypeDataset.objects.create(
        name="Panel", program=program, marker_count=4, sample_count=5,
        marker_names=["S1", "S2", "S3", "S4"], sample_names=list(MATRIX),
        matrix_data=MATRIX,
    )

    from apps.trials.models import Location, Observation, Plot, Season, Trial
    loc = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026", year=2026, program=program)
    trial = Trial.objects.create(
        name="Trial", trial_code="TR-1", program=program, location=loc,
        season=season, design_type="RCBD",
    )
    for i, name in enumerate(list(MATRIX)[:3]):
        plot = Plot.objects.create(
            trial=trial, germplasm=Germplasm.objects.get(name=name), rep=1, plot_number=i + 1,
        )
        Observation.objects.create(plot=plot, variable=trait, value_numeric=4.0 + i)

    resp = client.post(
        "/api/genomic-predictions/run_prediction/",
        {
            "name": "Yield GBLUP",
            "program": program.id,
            "trait": trait.id,
            "genotype_dataset": dataset.id,
            "training_trial": trial.id,
            "heritability_prior": 0.5,
            "k_folds": 2,
        },
        format="json",
    )
    assert resp.status_code == status.HTTP_201_CREATED
    pred_id = resp.data["prediction"]["id"]
    prediction = GenomicPrediction.objects.get(id=pred_id)
    assert prediction.mu is not None

    gebv_resp = client.get(f"/api/genomic-predictions/{pred_id}/gebvs/")
    assert gebv_resp.status_code == 200
    first = gebv_resp.data["results"][0]
    gebv_obj = GenomicBreedingValue.objects.get(id=first["id"])
    assert first["predicted_performance"] == round(prediction.mu + gebv_obj.gebv, 4)
    assert first["predicted_performance"] != round(gebv_obj.gebv, 4)


@pytest.mark.django_db
def test_predicted_performance_falls_back_to_gebv_when_mu_is_null(program, trait):
    dataset = GenotypeDataset.objects.create(
        name="Panel", program=program, marker_count=1, sample_count=1,
        marker_names=["S1"], sample_names=["Line_1"], matrix_data={"Line_1": [1.0]},
    )
    prediction = GenomicPrediction.objects.create(
        name="Legacy Prediction", program=program, trait=trait,
        genotype_dataset=dataset, model_type="gblup", status="completed", mu=None,
    )
    germ = Germplasm.objects.create(name="Line_1", program=program)
    gebv = GenomicBreedingValue.objects.create(
        prediction=prediction, germplasm=germ, sample_id="Line_1", gebv=1.2345,
    )

    from apps.genomics.serializers import GenomicBreedingValueSerializer
    data = GenomicBreedingValueSerializer(gebv).data
    assert data["predicted_performance"] == round(gebv.gebv, 4)


@pytest.mark.django_db
def test_mas_stacking_matrix_reports_truncation(program):
    for i in range(105):
        Germplasm.objects.create(name=f"Line_{i}", program=program)

    result = compute_mas_stacking_matrix(program_id=program.id)
    assert result["total_lines"] == 105
    assert len(result["lines"]) == 100
    assert result["truncated"] is True


@pytest.mark.django_db
def test_mas_stacking_matrix_not_truncated_under_the_cap(program):
    for i in range(5):
        Germplasm.objects.create(name=f"Line_{i}", program=program)

    result = compute_mas_stacking_matrix(program_id=program.id)
    assert result["total_lines"] == 5
    assert result["truncated"] is False


def test_k_fold_cv_does_not_mutate_global_numpy_random_state():
    import numpy as np

    np.random.seed(12345)
    before = np.random.get_state()[1].copy()

    phenotypes = {f"L{i}": float(i) for i in range(10)}
    sample_names = list(phenotypes)
    G = np.eye(10)
    run_k_fold_cross_validation(phenotypes, sample_names, G, k_folds=2)

    after = np.random.get_state()[1]
    assert (before == after).all()


@pytest.mark.django_db
def test_upload_file_leaves_ambiguous_name_matches_unlinked(client, program):
    # Two accessions sharing the same name within a program.
    Germplasm.objects.create(name="Dup_Line", program=program)
    Germplasm.objects.create(name="Dup_Line", program=program)
    Germplasm.objects.create(name="Unique_Line", program=program)

    csv_data = (
        "SampleID,SNP_1,SNP_2\n"
        "Dup_Line,0,1\n"
        "Unique_Line,2,0\n"
    )
    from django.core.files.uploadedfile import SimpleUploadedFile
    file_obj = SimpleUploadedFile("matrix.csv", csv_data.encode("utf-8"))

    resp = client.post(
        "/api/genotype-datasets/upload_file/",
        {"file": file_obj, "program": program.id, "file_format": "matrix"},
        format="multipart",
    )
    assert resp.status_code == status.HTTP_201_CREATED
    assert "Dup_Line" in resp.data.get("ambiguous_links", [])

    from apps.genomics.models import GenotypeSample
    dup_sample = GenotypeSample.objects.get(sample_id="Dup_Line")
    assert dup_sample.germplasm_id is None
    unique_sample = GenotypeSample.objects.get(sample_id="Unique_Line")
    assert unique_sample.germplasm_id is not None


@pytest.mark.django_db
def test_deleting_dataset_with_predictions_returns_409_not_500(client, program, trait):
    dataset = GenotypeDataset.objects.create(
        name="Panel", program=program, marker_count=1, sample_count=1,
        marker_names=["S1"], sample_names=["Line_1"], matrix_data={"Line_1": [1.0]},
    )
    GenomicPrediction.objects.create(
        name="Prediction", program=program, trait=trait, genotype_dataset=dataset,
        model_type="gblup", status="completed",
    )

    resp = client.delete(f"/api/genotype-datasets/{dataset.id}/")
    assert resp.status_code == status.HTTP_409_CONFLICT
    assert GenotypeDataset.objects.filter(id=dataset.id).exists()


@pytest.mark.django_db
def test_deleting_prediction_also_removes_its_gebvs(client, program, trait):
    dataset = GenotypeDataset.objects.create(
        name="Panel", program=program, marker_count=1, sample_count=1,
        marker_names=["S1"], sample_names=["Line_1"], matrix_data={"Line_1": [1.0]},
    )
    prediction = GenomicPrediction.objects.create(
        name="Prediction", program=program, trait=trait, genotype_dataset=dataset,
        model_type="gblup", status="completed",
    )
    germ = Germplasm.objects.create(name="Line_1", program=program)
    GenomicBreedingValue.objects.create(
        prediction=prediction, germplasm=germ, sample_id="Line_1", gebv=1.0,
    )

    resp = client.delete(f"/api/genomic-predictions/{prediction.id}/")
    assert resp.status_code == status.HTTP_204_NO_CONTENT
    assert not GenomicPrediction.objects.filter(id=prediction.id).exists()
    assert not GenomicBreedingValue.objects.filter(prediction_id=prediction.id).exists()
    # The dataset itself, no longer referenced by any prediction, is now deletable.
    del_resp = client.delete(f"/api/genotype-datasets/{dataset.id}/")
    assert del_resp.status_code == status.HTTP_204_NO_CONTENT
