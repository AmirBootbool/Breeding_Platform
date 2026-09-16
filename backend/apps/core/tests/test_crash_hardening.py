import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Program, UserProfile

User = get_user_model()


@pytest.fixture
def admin_client(db):
    program = Program.objects.create(name="Program A", crop="wheat")
    user = User.objects.create_user(username="admin_user", password="password12345")
    UserProfile.objects.create(user=user, role="admin", program=program)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_recent_changes_rejects_non_numeric_limit(admin_client):
    resp = admin_client.get("/api/audit/recent_changes/?limit=abc")
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_recent_changes_rejects_negative_limit(admin_client):
    resp = admin_client.get("/api/audit/recent_changes/?limit=-1")
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_recent_changes_search_finds_matches_past_the_naive_limit(admin_client):
    # Create more programs than the requested `limit` so the target match
    # would fall outside a naive "slice-then-filter" implementation.
    for i in range(5):
        Program.objects.create(name=f"Filler Program {i}", crop="wheat")
    target = Program.objects.create(name="Findable Program", crop="wheat")

    resp = admin_client.get("/api/audit/recent_changes/?limit=2&search=Findable")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert any(entry["id"] == target.id and entry["model"] == "Program" for entry in data)


@pytest.mark.django_db
def test_entity_history_rejects_non_numeric_id(admin_client):
    resp = admin_client.get("/api/audit/entity_history/?model=program&id=abc")
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
