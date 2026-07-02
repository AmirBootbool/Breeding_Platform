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
