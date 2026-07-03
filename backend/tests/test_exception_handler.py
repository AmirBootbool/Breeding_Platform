import pytest


@pytest.mark.django_db
def test_unauthenticated_request_format(api_client):
    # Try accessing a protected endpoint without auth
    response = api_client.get("/api/programs/")
    assert response.status_code == 403
    assert isinstance(response.data, dict)
    assert "status_code" in response.data
    assert "errors" in response.data
    assert response.data["status_code"] == 403
    assert "detail" in response.data["errors"]


@pytest.mark.django_db
def test_validation_error_format_duplicate_name(auth_client, program):
    # Try creating a program with a duplicate name
    response = auth_client.post(
        "/api/programs/",
        {"name": program.name, "crop": "wheat"},
        format="json",
    )
    assert response.status_code == 400
    assert isinstance(response.data, dict)
    assert "status_code" in response.data
    assert "errors" in response.data
    assert response.data["status_code"] == 400
    assert "name" in response.data["errors"]
    assert any("exists" in str(err) for err in response.data["errors"]["name"])


@pytest.mark.django_db
def test_validation_error_format_missing_required(auth_client):
    # Try creating a program with missing required name
    response = auth_client.post(
        "/api/programs/",
        {"crop": "barley"},
        format="json",
    )
    assert response.status_code == 400
    assert isinstance(response.data, dict)
    assert "status_code" in response.data
    assert "errors" in response.data
    assert response.data["status_code"] == 400
    assert "name" in response.data["errors"]
