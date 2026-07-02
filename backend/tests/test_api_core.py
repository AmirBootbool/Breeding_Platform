import pytest

from apps.core.models import Program


@pytest.mark.django_db
def test_program_list_requires_auth(api_client):
    response = api_client.get("/api/programs/")

    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_program_create_and_list(auth_client):
    response = auth_client.post(
        "/api/programs/",
        {
            "name": "Breeding Program A",
            "crop": "wheat",
            "description": "Primary program",
        },
        format="json",
    )

    assert response.status_code == 201
    assert Program.objects.filter(name="Breeding Program A").exists()

    list_response = auth_client.get("/api/programs/")
    assert list_response.status_code == 200
    assert list_response.data["count"] == 2
    assert any(
        item["name"] == "Breeding Program A" for item in list_response.data["results"]
    )


@pytest.mark.django_db
def test_viewer_can_read_but_not_create_program(client_for_role, program):
    client = client_for_role("viewer")

    list_response = client.get("/api/programs/")
    create_response = client.post("/api/programs/", {"name": "Nope"}, format="json")

    assert list_response.status_code == 200
    assert list_response.data["count"] == 1
    assert create_response.status_code == 403


@pytest.mark.django_db
def test_admin_can_manage_user_profiles(client_for_role, user):
    admin_client = client_for_role("admin", username="api_admin")
    breeder_client = client_for_role("breeder", username="api_breeder")

    admin_response = admin_client.patch(
        f"/api/user-profiles/{user.profile.id}/",
        {"role": "technician"},
        format="json",
    )
    breeder_response = breeder_client.patch(
        f"/api/user-profiles/{user.profile.id}/",
        {"role": "viewer"},
        format="json",
    )

    assert admin_response.status_code == 200
    assert admin_response.data["role"] == "technician"
    assert breeder_response.status_code == 403
