import pytest
from rest_framework import status
from apps.trials.models import Observation, Plot, ObservationVariable
from apps.germplasm.models import Germplasm


@pytest.fixture
def float_variable(db):
    return ObservationVariable.objects.create(
        name="Yield",
        variable_code="YLD",
        data_type="numeric",
        min_value=1.0,
        max_value=100.0,
    )


@pytest.fixture
def text_variable(db):
    return ObservationVariable.objects.create(
        name="Notes Var",
        variable_code="NTS",
        data_type="text",
    )


@pytest.mark.django_db
def test_brapi_observation_create_single(client_for_role, plot, float_variable):
    client = client_for_role("technician")
    payload = {
        "observationUnitDbId": str(plot.id),
        "observationVariableDbId": str(float_variable.id),
        "value": "45.6",
    }
    response = client.post("/brapi/v2/observations", data=payload, format="json")
    assert response.status_code == status.HTTP_201_CREATED
    assert "metadata" in response.data
    assert "result" in response.data
    assert response.data["result"]["value"] == "45.6"

    # Verify DB
    obs = Observation.objects.get(plot=plot, variable=float_variable)
    assert obs.value_numeric == 45.6


@pytest.mark.django_db
def test_brapi_observation_create_bulk(client_for_role, plot, float_variable, text_variable):
    client = client_for_role("technician")
    payload = [
        {
            "observationUnitDbId": str(plot.id),
            "observationVariableDbId": str(float_variable.id),
            "value": "12.3",
        },
        {
            "observationUnitDbId": str(plot.id),
            "observationVariableDbId": str(text_variable.id),
            "value": "Excellent growth",
        }
    ]
    response = client.post("/brapi/v2/observations", data=payload, format="json")
    assert response.status_code == status.HTTP_201_CREATED
    assert "metadata" in response.data
    assert "result" in response.data
    assert "data" in response.data["result"]
    assert len(response.data["result"]["data"]) == 2

    # Verify DB
    obs1 = Observation.objects.get(plot=plot, variable=float_variable)
    assert obs1.value_numeric == 12.3
    obs2 = Observation.objects.get(plot=plot, variable=text_variable)
    assert obs2.value_text == "Excellent growth"


@pytest.mark.django_db
def test_brapi_observation_update(client_for_role, plot, float_variable):
    client = client_for_role("technician")
    obs = Observation.objects.create(
        plot=plot,
        variable=float_variable,
        value_numeric=15.0,
    )

    payload = {
        "value": "78.9",
    }
    response = client.put(f"/brapi/v2/observations/{obs.id}", data=payload, format="json")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["result"]["value"] == "78.9"

    obs.refresh_from_db()
    assert obs.value_numeric == 78.9


@pytest.mark.django_db
def test_brapi_observation_validation_errors(client_for_role, plot, float_variable):
    client = client_for_role("technician")

    # Unknown plot
    payload = {
        "observationUnitDbId": "99999",
        "observationVariableDbId": str(float_variable.id),
        "value": "5.0",
    }
    response = client.post("/brapi/v2/observations", data=payload, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST

    # Out of bounds
    payload = {
        "observationUnitDbId": str(plot.id),
        "observationVariableDbId": str(float_variable.id),
        "value": "250.0",  # Max is 100
    }
    response = client.post("/brapi/v2/observations", data=payload, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_brapi_observation_unit_update(client_for_role, plot):
    # Breeder is allowed to update plot status
    client = client_for_role("breeder")
    assert plot.status == "planned"

    # Via observationUnitState
    payload = {
        "observationUnitState": "planted"
    }
    response = client.put(f"/brapi/v2/observationunits/{plot.id}", data=payload, format="json")
    assert response.status_code == status.HTTP_200_OK
    plot.refresh_from_db()
    assert plot.status == "planted"

    # Via additionalInfo status
    payload = {
        "additionalInfo": {"status": "harvested"}
    }
    response = client.put(f"/brapi/v2/observationunits/{plot.id}", data=payload, format="json")
    assert response.status_code == status.HTTP_200_OK
    plot.refresh_from_db()
    assert plot.status == "harvested"


@pytest.mark.django_db
def test_brapi_observation_unit_rejects_layout(client_for_role, plot):
    client = client_for_role("breeder")
    payload = {
        "observationUnitPosition": {
            "rowNumber": "5"
        }
    }
    response = client.put(f"/brapi/v2/observationunits/{plot.id}", data=payload, format="json")
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_brapi_germplasm_create(client_for_role, program):
    client = client_for_role("breeder")
    payload = {
        "germplasmName": "Attila BrAPI",
        "accessionNumber": "ATT-BR-01",
        "programDbId": str(program.id),
        "pedigree": "ParentA x ParentB",
        "breedingMethod": "biparental",
        "yearOfDevelopment": 2026,
    }
    response = client.post("/brapi/v2/germplasm", data=payload, format="json")
    assert response.status_code == status.HTTP_201_CREATED
    assert "metadata" in response.data
    assert "result" in response.data
    assert response.data["result"]["germplasmName"] == "Attila BrAPI"

    # Verify DB
    g = Germplasm.objects.get(germplasm_db_id="ATT-BR-01")
    assert g.name == "Attila BrAPI"
    assert g.pedigree_string == "ParentA x ParentB"


@pytest.mark.django_db
def test_brapi_rbac_viewer_blocked(client_for_role, plot, float_variable, program):
    client = client_for_role("viewer")

    # Blocked on observation create
    response = client.post("/brapi/v2/observations", data={
        "observationUnitDbId": str(plot.id),
        "observationVariableDbId": str(float_variable.id),
        "value": "5.0"
    })
    assert response.status_code == status.HTTP_403_FORBIDDEN

    # Blocked on plot status update
    response = client.put(f"/brapi/v2/observationunits/{plot.id}", data={
        "observationUnitState": "planted"
    })
    assert response.status_code == status.HTTP_403_FORBIDDEN

    # Blocked on germplasm create
    response = client.post("/brapi/v2/germplasm", data={
        "germplasmName": "Attila BrAPI",
        "programDbId": str(program.id),
    })
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_brapi_rbac_technician_germplasm_blocked(client_for_role, program):
    # Technicians are blocked on germplasm creations
    client = client_for_role("technician")
    response = client.post("/brapi/v2/germplasm", data={
        "germplasmName": "Attila BrAPI",
        "programDbId": str(program.id),
    })
    assert response.status_code == status.HTTP_403_FORBIDDEN
