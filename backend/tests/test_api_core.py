import pytest

from apps.core.models import Program


@pytest.mark.django_db
def test_program_list_requires_auth(api_client):
    response = api_client.get('/api/programs/')

    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_program_create_and_list(auth_client):
    response = auth_client.post(
        '/api/programs/',
        {'name': 'Breeding Program A', 'crop': 'wheat', 'description': 'Primary program'},
        format='json',
    )

    assert response.status_code == 201
    assert Program.objects.filter(name='Breeding Program A').exists()

    list_response = auth_client.get('/api/programs/')
    assert list_response.status_code == 200
    assert list_response.data['count'] == 1
