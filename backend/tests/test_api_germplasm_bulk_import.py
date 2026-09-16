import io

import openpyxl
import pytest
from rest_framework.test import APIClient

from django.contrib.auth.models import User

from apps.core.models import Program, UserProfile
from apps.germplasm.models import Germplasm


def make_xlsx_upload(filename, headers, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    buf.name = filename
    return buf


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
        format="multipart",
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
        format="multipart",
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
        format="multipart",
    )
    assert response.status_code == 201
    assert response.data["created"] == 0
    assert len(response.data["errors"]) == 0

    # Verify no records actually created
    assert not Germplasm.objects.filter(name="DryRun1").exists()


@pytest.mark.django_db
def test_bulk_import_valid_xlsx(api_client, breeder_user, test_program):
    api_client.force_authenticate(user=breeder_user)
    file_obj = make_xlsx_upload(
        "germplasm.xlsx",
        ["name", "species", "pedigree_string", "cross_type", "year_developed", "notes"],
        [
            ["XlsxLine1", "Triticum aestivum", "F1/F2", "biparental", 2024, "Good line"],
            ["XlsxLine2", "Triticum aestivum", "", "unknown", "", ""],
            ["XlsxLine3", "Triticum aestivum", "NL2/NL3", "backcross", 2023, "Notes here"],
        ],
    )

    response = api_client.post(
        "/api/germplasm/bulk_import/",
        {"file": file_obj, "program": test_program.name, "dry_run": "false"},
        format="multipart",
    )
    assert response.status_code == 201
    assert response.data["created"] == 3
    assert len(response.data["errors"]) == 0

    assert Germplasm.objects.filter(name="XlsxLine1", program=test_program).exists()
    line1 = Germplasm.objects.get(name="XlsxLine1", program=test_program)
    # year_developed came in as an Excel float (2024.0) - confirm it landed
    # as the plain integer 2024, not a parsing error.
    assert line1.year_developed == 2024


@pytest.mark.django_db
def test_bulk_import_invalid_xlsx_rollback(api_client, breeder_user, test_program):
    api_client.force_authenticate(user=breeder_user)
    # Row 3 is missing name
    file_obj = make_xlsx_upload(
        "germplasm.xlsx",
        ["name", "species"],
        [["XlsxLine1", "Triticum aestivum"], ["", "Triticum aestivum"]],
    )

    response = api_client.post(
        "/api/germplasm/bulk_import/",
        {"file": file_obj, "program": test_program.name, "dry_run": "false"},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.data["created"] == 0
    assert len(response.data["errors"]) == 1
    assert response.data["errors"][0]["row"] == 3

    assert not Germplasm.objects.filter(name="XlsxLine1").exists()


@pytest.mark.django_db
def test_bulk_import_xlsx_dry_run(api_client, breeder_user, test_program):
    api_client.force_authenticate(user=breeder_user)
    file_obj = make_xlsx_upload(
        "germplasm.xlsx", ["name", "species"], [["XlsxDryRun1", "Triticum aestivum"]]
    )

    response = api_client.post(
        "/api/germplasm/bulk_import/",
        {"file": file_obj, "program": test_program.name, "dry_run": "true"},
        format="multipart",
    )
    assert response.status_code == 201
    assert response.data["created"] == 0
    assert not Germplasm.objects.filter(name="XlsxDryRun1").exists()


@pytest.mark.django_db
def test_bulk_import_corrupted_xlsx_returns_400_not_500(api_client, breeder_user, test_program):
    api_client.force_authenticate(user=breeder_user)
    # A .csv renamed to .xlsx is not a valid OOXML/zip container.
    file_obj = io.BytesIO(b"name,species\nBadFile,wheat\n")
    file_obj.name = "not_really.xlsx"

    response = api_client.post(
        "/api/germplasm/bulk_import/",
        {"file": file_obj, "program": test_program.name},
        format="multipart",
    )
    assert response.status_code == 400
    assert not Germplasm.objects.filter(name="BadFile").exists()


@pytest.mark.django_db
def test_bulk_import_viewer_denied(api_client, viewer_user, test_program):
    api_client.force_authenticate(user=viewer_user)
    csv_data = "name,species\nLineViewer,Triticum aestivum\n"
    file_obj = io.BytesIO(csv_data.encode("utf-8"))
    file_obj.name = "germplasm.csv"

    response = api_client.post(
        "/api/germplasm/bulk_import/",
        {"file": file_obj, "program": test_program.name},
        format="multipart",
    )
    assert response.status_code == 403
