import pytest
from rest_framework import status

from apps.germplasm.models import Germplasm


@pytest.mark.django_db
def test_metrics_endpoint_access_control(api_client, staff_client):
    # Unauthenticated should be rejected
    unauth_response = api_client.get("/api/metrics/")
    assert unauth_response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    # Staff user should be allowed
    response = staff_client.get("/api/metrics/")
    assert response.status_code == status.HTTP_200_OK
    assert "text/plain" in response["Content-Type"]
    content = response.content.decode("utf-8")
    assert "wbp_germplasm_total" in content
    assert "wbp_trials_active_total" in content
    assert "wbp_observations_total" in content


@pytest.mark.django_db
def test_metrics_gauges_dynamic_update(staff_client, program):
    # Initial count
    response = staff_client.get("/api/metrics/")
    assert response.status_code == status.HTTP_200_OK
    content = response.content.decode("utf-8")

    # Find the line with wbp_germplasm_total
    initial_value = 0
    for line in content.splitlines():
        if line.startswith("wbp_germplasm_total"):
            initial_value = float(line.split()[1])
            break

    # Add a germplasm record
    Germplasm.objects.create(
        name="New Line Metrics Test", germplasm_db_id="G-METRICS-01", program=program
    )

    # Re-evaluate
    response = staff_client.get("/api/metrics/")
    content = response.content.decode("utf-8")
    new_value = 0
    for line in content.splitlines():
        if line.startswith("wbp_germplasm_total"):
            new_value = float(line.split()[1])
            break

    assert new_value == initial_value + 1.0

