import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Program, UserProfile
from apps.germplasm.models import Germplasm
from apps.genomics.models import DiagnosticMarker, GenotypeDataset

User = get_user_model()


def _client_for(role, program=None, staff=False):
    user = User.objects.create_user(
        username=f"{role}_{Program.objects.count()}_{User.objects.count()}",
        password="password12345",
        is_staff=staff,
    )
    UserProfile.objects.create(user=user, role=role, program=program)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.fixture
def two_programs(db):
    return (
        Program.objects.create(name="Program A", crop="wheat"),
        Program.objects.create(name="Program B", crop="wheat"),
    )


@pytest.mark.django_db
def test_genotype_dataset_scoped_to_own_program(two_programs):
    program_a, program_b = two_programs
    ds_a = GenotypeDataset.objects.create(
        name="Dataset A", program=program_a, marker_count=1, sample_count=1,
        marker_names=["M1"], sample_names=["S1"], matrix_data={"S1": [0.0]},
    )
    ds_b = GenotypeDataset.objects.create(
        name="Dataset B", program=program_b, marker_count=1, sample_count=1,
        marker_names=["M1"], sample_names=["S1"], matrix_data={"S1": [0.0]},
    )

    client_a, _ = _client_for("breeder", program_a)
    client_staff, _ = _client_for("breeder", program_a, staff=True)

    assert client_a.get(f"/api/genotype-datasets/{ds_a.id}/").status_code == status.HTTP_200_OK
    assert client_a.get(f"/api/genotype-datasets/{ds_b.id}/").status_code == status.HTTP_404_NOT_FOUND

    staff_list = client_staff.get("/api/genotype-datasets/")
    staff_ids = {row["id"] for row in staff_list.data["results"]}
    assert {ds_a.id, ds_b.id} <= staff_ids


@pytest.mark.django_db
def test_genotype_dataset_create_rejects_foreign_program(two_programs):
    program_a, program_b = two_programs
    client_a, _ = _client_for("breeder", program_a)

    resp = client_a.post(
        "/api/genotype-datasets/",
        {
            "name": "Sneaky Dataset",
            "program": program_b.id,
            "marker_count": 1,
            "sample_count": 1,
            "marker_names": ["M1"],
            "sample_names": ["S1"],
            "matrix_data": {"S1": [0.0]},
        },
        format="json",
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN
    assert not GenotypeDataset.objects.filter(name="Sneaky Dataset").exists()


@pytest.mark.django_db
def test_diagnostic_marker_global_row_visible_to_every_program(two_programs):
    program_a, program_b = two_programs
    global_marker = DiagnosticMarker.objects.create(
        name="Global Fhb1", target_trait="FHB", favorable_allele="R", program=None,
    )
    scoped_marker = DiagnosticMarker.objects.create(
        name="ProgramB Marker", target_trait="Rust", favorable_allele="R", program=program_b,
    )

    client_a, _ = _client_for("breeder", program_a)

    # Global (null-program) marker is visible from Program A.
    resp = client_a.get(f"/api/diagnostic-markers/{global_marker.id}/")
    assert resp.status_code == status.HTTP_200_OK

    # A marker scoped to Program B is not.
    resp = client_a.get(f"/api/diagnostic-markers/{scoped_marker.id}/")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_marker_score_scoped_via_germplasm_program(two_programs):
    program_a, program_b = two_programs
    marker = DiagnosticMarker.objects.create(
        name="Fhb1", target_trait="FHB", favorable_allele="R", program=None,
    )
    germ_a = Germplasm.objects.create(name="Line A", program=program_a)
    germ_b = Germplasm.objects.create(name="Line B", program=program_b)

    from apps.genomics.models import MarkerScore

    score_a = MarkerScore.objects.create(marker=marker, germplasm=germ_a, call_status="favorable")
    score_b = MarkerScore.objects.create(marker=marker, germplasm=germ_b, call_status="favorable")

    client_a, _ = _client_for("breeder", program_a)

    assert client_a.get(f"/api/marker-scores/{score_a.id}/").status_code == status.HTTP_200_OK
    assert client_a.get(f"/api/marker-scores/{score_b.id}/").status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_gebvs_search_action_scoped_to_own_program(two_programs):
    # Regression guard: the `gebvs` action must inherit program scoping via
    # self.get_queryset() (Phase 1 fix), not bypass it.
    program_a, program_b = two_programs
    from apps.genomics.models import GenomicPrediction
    from apps.trials.models import ObservationVariable

    trait = ObservationVariable.objects.create(
        name="Grain Yield", unit="t/ha", data_type="numeric"
    )
    dataset_b = GenotypeDataset.objects.create(
        name="Dataset B", program=program_b, marker_count=1, sample_count=1,
        marker_names=["M1"], sample_names=["S1"], matrix_data={"S1": [0.0]},
    )
    pred_b = GenomicPrediction.objects.create(
        name="Prediction B", program=program_b, trait=trait,
        genotype_dataset=dataset_b, model_type="gblup", status="completed",
    )

    client_a, _ = _client_for("breeder", program_a)
    resp = client_a.get(f"/api/genomic-predictions/{pred_b.id}/gebvs/")
    assert resp.status_code == status.HTTP_404_NOT_FOUND
