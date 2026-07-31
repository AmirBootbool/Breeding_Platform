import pytest
from apps.trials.models import Observation, Plot, ObservationVariable

@pytest.fixture
def second_plot(db, trial, second_germplasm):
    return Plot.objects.create(trial=trial, germplasm=second_germplasm, rep=1, plot_number=2)

@pytest.fixture
def second_variable(db):
    return ObservationVariable.objects.create(
        name="Grain yield", variable_code="GY", data_type="numeric", min_value=10.0, max_value=100.0
    )

@pytest.fixture
def third_variable(db):
    return ObservationVariable.objects.create(
        name="Notes variable", variable_code="NV", data_type="text"
    )

@pytest.mark.django_db
def test_bulk_create_observations_success(
    client_for_role, plot, second_plot, observation_variable, second_variable, third_variable
):
    client = client_for_role("breeder")
    
    payload = {
        "observations": [
            {"plot": plot.id, "variable": observation_variable.id, "value_numeric": 75.0},
            {"plot": plot.id, "variable": second_variable.id, "value_numeric": 50.0},
            {"plot": plot.id, "variable": third_variable.id, "value_text": "Good"},
            {"plot": second_plot.id, "variable": observation_variable.id, "value_numeric": 80.0},
            {"plot": second_plot.id, "variable": second_variable.id, "value_numeric": 55.0},
        ]
    }
    
    response = client.post("/api/observations/bulk_create/", payload, format="json")
    assert response.status_code == 201
    assert len(response.data["created"]) == 5
    assert len(response.data["errors"]) == 0
    
    assert Observation.objects.filter(plot=plot).count() == 3
    assert Observation.objects.filter(plot=second_plot).count() == 2

@pytest.mark.django_db
def test_bulk_create_observations_validation_error_rollback(
    client_for_role, plot, second_plot, observation_variable, second_variable
):
    client = client_for_role("breeder")
    
    # second_variable has min_value=10.0, max_value=100.0. The second observation has value_numeric=5.0 which is out of range.
    payload = {
        "observations": [
            {"plot": plot.id, "variable": observation_variable.id, "value_numeric": 75.0},
            {"plot": plot.id, "variable": second_variable.id, "value_numeric": 5.0},
        ]
    }
    
    response = client.post("/api/observations/bulk_create/", payload, format="json")
    assert response.status_code == 400
    assert response.data["created"] == []
    assert len(response.data["errors"]) == 1
    assert response.data["errors"][0]["index"] == 1
    
    # Check whole-batch rollback: no observations should be saved
    assert Observation.objects.count() == 0

@pytest.mark.django_db
def test_bulk_create_observations_technician_allowed(
    client_for_role, plot, observation_variable
):
    client = client_for_role("technician")
    payload = {
        "observations": [
            {"plot": plot.id, "variable": observation_variable.id, "value_numeric": 75.0}
        ]
    }
    response = client.post("/api/observations/bulk_create/", payload, format="json")
    assert response.status_code == 201

@pytest.mark.django_db
def test_bulk_create_observations_viewer_denied(
    client_for_role, plot, observation_variable
):
    client = client_for_role("viewer")
    payload = {
        "observations": [
            {"plot": plot.id, "variable": observation_variable.id, "value_numeric": 75.0}
        ]
    }
    response = client.post("/api/observations/bulk_create/", payload, format="json")
    assert response.status_code == 403
