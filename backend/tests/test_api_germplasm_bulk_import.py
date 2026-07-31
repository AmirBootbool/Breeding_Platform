import io
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from apps.core.models import Program, UserProfile
from apps.germplasm.models import Germplasm

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def test_program():
    return Program.objects.create(name="Bread Wheat", crop="wheat")

@pytest.fixture
def breeder_user(test_program):
    user = User.objects.create_user(username="breeder_test", password="password")
    UserProfile.objects.create(user=user, role="breeder", program=test_program)
    return user

@pytest.fixture
def viewer_user(test_program):
    user = User.objects.create_user(username="viewer_test", password="password")
    UserProfile.objects.create(user=user, role="viewer", program=test_program)
    return user

@pytest.mark.django_db
def test_bulk_import_valid_csv(api_client, breeder_user, test_program):
    api_client.force_authenticate(user=breeder_user)
    csv_data = (
        "name,species,pedigree_string,cross_type,year_developed,notes\n"
        "BulkLine1,Triticum aestivum,F1/F2,biparental,2024,Good line\n"
        "BulkLine2,Triticum aestivum,,unknown,,\n"
        "BulkLine3,Triticum aestivum,NL2/NL3,backcross,2023,Notes here\n"
    )
    file_obj = io.BytesIO(csv_data.encode("utf-8"))
    file_obj.name = "germplasm.csv"

    response = api_client.post(
        "/api/germplasm/bulk_import/",
        {"file": file_obj, "program": test_program.name, "dry_run": "false"},
        format="multipart"
    )
    assert response.status_code == 201
    assert response.data["created"] == 3
    assert len(response.data["errors"]) == 0

    assert Germplasm.objects.filter(name="BulkLine1", program=test_program).exists()
    assert Germplasm.objects.filter(name="BulkLine2", program=test_program).exists()
    assert Germplasm.objects.filter(name="BulkLine3", program=test_program).exists()

@pytest.mark.django_db
def test_bulk_import_invalid_csv_rollback(api_client, breeder_user, test_program):
    api_client.force_authenticate(user=breeder_user)
    # Row 3 is missing name
    csv_data = (
        "name,species,pedigree_string,cross_type,year_developed,notes\n"
        "BulkLine1,Triticum aestivum,F1/F2,biparental,2024,Good line\n"
        ",Triticum aestivum,,unknown,,\n"
    )
    file_obj = io.BytesIO(csv_data.encode("utf-8"))
    file_obj.name = "germplasm.csv"

    response = api_client.post(
        "/api/germplasm/bulk_import/",
        {"file": file_obj, "program": test_program.name, "dry_run": "false"},
        format="multipart"
    )
    assert response.status_code == 400
    assert response.data["created"] == 0
    assert len(response.data["errors"]) == 1
    assert response.data["errors"][0]["row"] == 3

    # Transaction rollback check: no germplasm should be saved
    assert not Germplasm.objects.filter(name="BulkLine1").exists()

@pytest.mark.django_db
def test_bulk_import_dry_run(api_client, breeder_user, test_program):
    api_client.force_authenticate(user=breeder_user)
    csv_data = (
        "name,species,pedigree_string,cross_type,year_developed,notes\n"
        "DryRun1,Triticum aestivum,F1/F2,biparental,2024,Good line\n"
    )
    file_obj = io.BytesIO(csv_data.encode("utf-8"))
    file_obj.name = "germplasm.csv"

    response = api_client.post(
        "/api/germplasm/bulk_import/",
        {"file": file_obj, "program": test_program.name, "dry_run": "true"},
        format="multipart"
    )
    assert response.status_code == 201
    assert response.data["created"] == 0
    assert len(response.data["errors"]) == 0

    # Verify no records actually created
    assert not Germplasm.objects.filter(name="DryRun1").exists()

@pytest.mark.django_db
def test_bulk_import_viewer_denied(api_client, viewer_user, test_program):
    api_client.force_authenticate(user=viewer_user)
    csv_data = "name,species\nLineViewer,Triticum aestivum\n"
    file_obj = io.BytesIO(csv_data.encode("utf-8"))
    file_obj.name = "germplasm.csv"

    response = api_client.post(
        "/api/germplasm/bulk_import/",
        {"file": file_obj, "program": test_program.name},
        format="multipart"
    )
    assert response.status_code == 403
