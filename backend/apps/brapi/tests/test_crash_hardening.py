import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Program, UserProfile

User = get_user_model()


@pytest.fixture
def program(db):
    return Program.objects.create(name="Program A", crop="wheat")


@pytest.fixture
def client(db, program):
    user = User.objects.create_user(username="brapi_user", password="password12345")
    UserProfile.objects.create(user=user, role="breeder", program=program)
    api_client = APIClient()
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.django_db
@pytest.mark.parametrize(
    "url",
    [
        "/brapi/v2/studies?programDbId=not-a-number",
        "/brapi/v2/studies?locationDbId=abc",
        "/brapi/v2/studies?seasonDbId=abc",
        "/brapi/v2/germplasm?programDbId=abc",
        "/brapi/v2/observations?observationUnitDbId=abc",
        "/brapi/v2/observations?observationVariableDbId=abc",
        "/brapi/v2/observations?studyDbId=abc",
        "/brapi/v2/variables?observationVariableDbId=abc",
        "/brapi/v2/locations?locationDbId=abc",
        "/brapi/v2/programs?programDbId=abc",
        "/brapi/v2/observationunits?observationUnitDbId=abc",
        "/brapi/v2/observationunits?studyDbId=abc",
    ],
)
def test_brapi_malformed_db_id_returns_400_not_500(client, url):
    resp = client.get(url)
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_brapi_valid_numeric_db_id_still_works(client, program):
    resp = client.get(f"/brapi/v2/programs?programDbId={program.id}")
    assert resp.status_code == status.HTTP_200_OK
    ids = {row["programDbId"] for row in resp.data["result"]["data"]}
    assert str(program.id) in ids
