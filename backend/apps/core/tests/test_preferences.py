import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model
from apps.core.models import UserPreference, UserProfile

User = get_user_model()


@pytest.fixture
def auth_client():
    user = User.objects.create_user(username="pref_user", password="testpassword123")
    UserProfile.objects.create(user=user, role="breeder")
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.mark.django_db
def test_get_preferences_returns_empty_data_for_new_user(auth_client):
    client, user = auth_client
    response = client.get("/api/me/preferences/")
    assert response.status_code == status.HTTP_200_OK
    assert response.data["data"] == {}
    assert "updated_at" in response.data


@pytest.mark.django_db
def test_patch_preferences_updates_and_merges_blob(auth_client):
    client, user = auth_client
    
    # 1. First patch
    payload_1 = {
        "data": {
            "theme": "dark",
            "tableDensity": "compact",
            "defaultLandingPage": "/germplasm",
        }
    }
    response_1 = client.patch("/api/me/preferences/", data=payload_1, format="json")
    assert response_1.status_code == status.HTTP_200_OK
    assert response_1.data["data"]["theme"] == "dark"
    assert response_1.data["data"]["tableDensity"] == "compact"
    assert response_1.data["data"]["defaultLandingPage"] == "/germplasm"

    # 2. Second patch with updated keys
    payload_2 = {
        "data": {
            "theme": "sunlight",
            "pinnedRecords": [{"id": 1, "type": "germplasm", "label": "Amber"}],
        }
    }
    response_2 = client.patch("/api/me/preferences/", data=payload_2, format="json")
    assert response_2.status_code == status.HTTP_200_OK
    assert response_2.data["data"]["theme"] == "sunlight"
    assert len(response_2.data["data"]["pinnedRecords"]) == 1

    # Verify DB state
    pref = UserPreference.objects.get(user=user)
    assert pref.data["theme"] == "sunlight"


@pytest.mark.django_db
def test_unauthenticated_cannot_access_preferences():
    client = APIClient()
    response_get = client.get("/api/me/preferences/")
    assert response_get.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    response_patch = client.patch("/api/me/preferences/", data={"data": {}}, format="json")
    assert response_patch.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
