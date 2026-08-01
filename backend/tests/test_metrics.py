import pytest
from rest_framework import status
from apps.germplasm.models import Germplasm


@pytest.mark.django_db
def test_metrics_endpoint_public(api_client):
    response = api_client.get("/api/metrics/")
    assert response.status_code == status.HTTP_200_OK
    assert "text/plain" in response["Content-Type"]
    content = response.content.decode("utf-8")
    assert "wbp_germplasm_total" in content
    assert "wbp_trials_active_total" in content
    assert "wbp_observations_total" in content


@pytest.mark.django_db
def test_metrics_gauges_dynamic_update(api_client, program):
    # Initial count
    response = api_client.get("/api/metrics/")
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
        name="New Line Metrics Test",
        germplasm_db_id="G-METRICS-01",
        program=program
    )

    # Re-evaluate
    response = api_client.get("/api/metrics/")
    content = response.content.decode("utf-8")
    new_value = 0
    for line in content.splitlines():
        if line.startswith("wbp_germplasm_total"):
            new_value = float(line.split()[1])
            break

    assert new_value == initial_value + 1.0
