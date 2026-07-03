import pytest
from rest_framework import status

from apps.trials.models import Observation


@pytest.fixture
def observation(db, plot, observation_variable):
    return Observation.objects.create(
        plot=plot,
        variable=observation_variable,
        value_numeric=15.5,
    )


@pytest.mark.django_db
def test_health_check_public(api_client):
    response = api_client.get("/api/health/")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["status"] == "healthy"
    assert response.data["database"] == "up"


@pytest.mark.django_db
def test_brapi_requires_auth(api_client):
    endpoints = [
        "/brapi/v2/studies",
        "/brapi/v2/germplasm",
        "/brapi/v2/observations",
        "/brapi/v2/variables",
        "/brapi/v2/observationvariables",
    ]
    for endpoint in endpoints:
        response = api_client.get(endpoint)
        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)



@pytest.mark.django_db
def test_brapi_studies(auth_client, trial):
    response = auth_client.get("/brapi/v2/studies")
    assert response.status_code == status.HTTP_200_OK
    data = response.data
    assert "metadata" in data
    assert "result" in data
    assert "data" in data["result"]
    assert len(data["result"]["data"]) == 1

    study = data["result"]["data"][0]
    assert study["studyDbId"] == str(trial.id)
    assert study["studyName"] == trial.name
    assert study["studyCode"] == trial.trial_code
    assert study["programDbId"] == str(trial.program.id)

    # Test retrieve
    response_detail = auth_client.get(f"/brapi/v2/studies/{trial.id}")
    assert response_detail.status_code == status.HTTP_200_OK
    detail_data = response_detail.data
    assert "metadata" in detail_data
    assert "result" in detail_data
    assert "data" not in detail_data["result"]  # detail view shouldn't have data wrapper
    assert detail_data["result"]["studyDbId"] == str(trial.id)


@pytest.mark.django_db
def test_brapi_germplasm(auth_client, germplasm):
    response = auth_client.get("/brapi/v2/germplasm")
    assert response.status_code == status.HTTP_200_OK
    data = response.data
    assert len(data["result"]["data"]) == 1

    g = data["result"]["data"][0]
    assert g["germplasmDbId"] == germplasm.germplasm_db_id
    assert g["germplasmName"] == germplasm.name
    assert g["accessionNumber"] == germplasm.germplasm_db_id

    # Test retrieve
    response_detail = auth_client.get(f"/brapi/v2/germplasm/{germplasm.id}")
    assert response_detail.status_code == status.HTTP_200_OK
    assert response_detail.data["result"]["germplasmDbId"] == germplasm.germplasm_db_id


@pytest.mark.django_db
def test_brapi_observations(auth_client, observation):
    response = auth_client.get("/brapi/v2/observations")
    assert response.status_code == status.HTTP_200_OK
    data = response.data
    assert len(data["result"]["data"]) == 1

    obs = data["result"]["data"][0]
    assert obs["observationDbId"] == str(observation.id)
    assert obs["observationVariableName"] == observation.variable.name
    assert obs["value"] == "15.5"

    # Test retrieve
    response_detail = auth_client.get(f"/brapi/v2/observations/{observation.id}")
    assert response_detail.status_code == status.HTTP_200_OK
    assert response_detail.data["result"]["observationDbId"] == str(observation.id)


@pytest.mark.django_db
def test_brapi_variables(auth_client, observation_variable):
    for endpoint in ["/brapi/v2/variables", "/brapi/v2/observationvariables"]:
        response = auth_client.get(endpoint)
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert len(data["result"]["data"]) == 1

        v = data["result"]["data"][0]
        assert v["observationVariableDbId"] == str(observation_variable.id)
        assert v["observationVariableName"] == observation_variable.name
        assert v["scale"]["scaleName"] == (observation_variable.unit or "unitless")

    # Test retrieve
    response_detail = auth_client.get(f"/brapi/v2/variables/{observation_variable.id}")
    assert response_detail.status_code == status.HTTP_200_OK
    assert response_detail.data["result"]["observationVariableDbId"] == str(observation_variable.id)


@pytest.mark.django_db
def test_brapi_pagination(auth_client, germplasm, second_germplasm):
    # page=0, pageSize=1 (should return 1st item)
    response = auth_client.get("/brapi/v2/germplasm?page=0&pageSize=1")
    assert response.status_code == status.HTTP_200_OK
    data = response.data
    assert len(data["result"]["data"]) == 1
    assert data["metadata"]["pagination"]["currentPage"] == 0
    assert data["metadata"]["pagination"]["pageSize"] == 1
    assert data["metadata"]["pagination"]["totalCount"] == 2
    assert data["metadata"]["pagination"]["totalPages"] == 2

    # page=1, pageSize=1 (should return 2nd item)
    response2 = auth_client.get("/brapi/v2/germplasm?page=1&pageSize=1")
    assert response2.status_code == status.HTTP_200_OK
    assert len(response2.data["result"]["data"]) == 1
    assert response2.data["metadata"]["pagination"]["currentPage"] == 1


@pytest.mark.django_db
def test_brapi_filtering(auth_client, trial, germplasm, observation):
    # Filter studies by programDbId
    response = auth_client.get(f"/brapi/v2/studies?programDbId={trial.program.id}")
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data["result"]["data"]) == 1

    response = auth_client.get("/brapi/v2/studies?programDbId=9999")
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data["result"]["data"]) == 0

    # Filter observations by studyDbId
    response = auth_client.get(f"/brapi/v2/observations?studyDbId={trial.id}")
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data["result"]["data"]) == 1

    response = auth_client.get("/brapi/v2/observations?studyDbId=9999")
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data["result"]["data"]) == 0
