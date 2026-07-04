import pytest

from apps.germplasm.models import Germplasm


@pytest.mark.django_db
def test_germplasm_create(auth_client, program):
    response = auth_client.post(
        "/api/germplasm/",
        {
            "name": "Line 1",
            "program": program.id,
            "species": "Triticum aestivum",
            "cross_type": "unknown",
        },
        format="json",
    )

    assert response.status_code == 201
    assert Germplasm.objects.filter(name="Line 1").exists()


@pytest.mark.django_db
def test_technician_cannot_create_germplasm(client_for_role, program):
    client = client_for_role("technician")

    response = client.post(
        "/api/germplasm/",
        {
            "name": "Line 2",
            "program": program.id,
            "species": "Triticum aestivum",
            "cross_type": "unknown",
        },
        format="json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_cross_self_cross_via_api(auth_client, germplasm):
    response = auth_client.post(
        "/api/crosses/",
        {
            "cross_code": "SELF-X",
            "female_parent": germplasm.id,
            "male_parent": germplasm.id,
            "cross_date": "2026-07-03",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "errors" in response.data
    assert "male_parent" in response.data["errors"]


@pytest.mark.django_db
def test_duplicate_germplasm_db_id_via_api(auth_client, program, germplasm):
    response = auth_client.post(
        "/api/germplasm/",
        {
            "name": "Line 2",
            "program": program.id,
            "germplasm_db_id": germplasm.germplasm_db_id,
            "species": "Triticum aestivum",
            "cross_type": "unknown",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "errors" in response.data
    assert "germplasm_db_id" in response.data["errors"]
