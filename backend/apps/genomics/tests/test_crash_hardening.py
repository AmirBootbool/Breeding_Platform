import io

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.core.models import Program, UserProfile

User = get_user_model()


@pytest.fixture
def two_programs(db):
    return (
        Program.objects.create(name="Program A", crop="wheat"),
        Program.objects.create(name="Program B", crop="wheat"),
    )


@pytest.fixture
def client_a(two_programs):
    program_a, _ = two_programs
    user = User.objects.create_user(username="breeder_a", password="password12345")
    UserProfile.objects.create(user=user, role="breeder", program=program_a)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


MATRIX_CSV = "SampleID,SNP_1,SNP_2\nLine_1,0,1\nLine_2,2,0\n"


@pytest.mark.django_db
def test_upload_file_rejects_foreign_program(client_a, two_programs):
    _, program_b = two_programs
    file_obj = SimpleUploadedFile("matrix.csv", MATRIX_CSV.encode("utf-8"))

    resp = client_a.post(
        "/api/genotype-datasets/upload_file/",
        {"file": file_obj, "program": program_b.id, "file_format": "matrix"},
        format="multipart",
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_upload_file_accepts_own_program(client_a, two_programs):
    program_a, _ = two_programs
    file_obj = SimpleUploadedFile("matrix.csv", MATRIX_CSV.encode("utf-8"))

    resp = client_a.post(
        "/api/genotype-datasets/upload_file/",
        {"file": file_obj, "program": program_a.id, "file_format": "matrix"},
        format="multipart",
    )
    assert resp.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
def test_upload_file_rejects_oversized_file(client_a, two_programs):
    program_a, _ = two_programs
    oversized = io.BytesIO(b"0" * (51 * 1024 * 1024))
    file_obj = SimpleUploadedFile("matrix.csv", oversized.read())

    resp = client_a.post(
        "/api/genotype-datasets/upload_file/",
        {"file": file_obj, "program": program_a.id, "file_format": "matrix"},
        format="multipart",
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
