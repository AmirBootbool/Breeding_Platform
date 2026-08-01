import pytest
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from apps.core.models import Program, UserProfile

User = get_user_model()


@pytest.mark.django_db
def test_audit_endpoint_requires_admin(api_client, client_for_role):
    url = "/api/audit/recent_changes/"

    # Unauthenticated
    response = api_client.get(url)
    assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]

    # Viewer
    viewer_client = client_for_role("viewer")
    response = viewer_client.get(url)
    assert response.status_code == status.HTTP_403_FORBIDDEN

    # Breeder
    breeder_client = client_for_role("breeder")
    response = breeder_client.get(url)
    assert response.status_code == status.HTTP_403_FORBIDDEN

    # Technician
    technician_client = client_for_role("technician")
    response = technician_client.get(url)
    assert response.status_code == status.HTTP_403_FORBIDDEN

    # Admin
    admin_client = client_for_role("admin")
    response = admin_client.get(url)
    assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_audit_endpoint_data_serialization(program):
    admin_user = User.objects.create_user(username="test_admin", password="password123")
    UserProfile.objects.create(user=admin_user, role="admin")
    
    client = APIClient()
    client.force_authenticate(user=admin_user)

    # Perform updates to trigger attribution fields
    program.name = "Updated Program Name"
    program.updated_by = admin_user
    program.save()

    url = "/api/audit/recent_changes/"
    response = client.get(url)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) >= 1

    # Verify attributes
    entry = data[0]
    assert entry["model"] == "Program"
    assert entry["id"] == program.id
    assert entry["updated_by"] == "test_admin"
    assert "created_at" in entry
    assert "updated_at" in entry


@pytest.mark.django_db
def test_audit_endpoint_limit_param():
    admin_user = User.objects.create_user(username="test_admin_limit", password="password123")
    UserProfile.objects.create(user=admin_user, role="admin")
    
    client = APIClient()
    client.force_authenticate(user=admin_user)

    # Create multiple programs
    for i in range(5):
        Program.objects.create(
            name=f"Program Limit Test {i}",
            crop="Wheat",
            created_by=admin_user,
            updated_by=admin_user
        )

    url = "/api/audit/recent_changes/"
    # Get with limit 2
    response = client.get(url, {"limit": 2})
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 2
