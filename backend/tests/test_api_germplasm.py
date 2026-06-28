import pytest

from apps.core.models import Program
from apps.germplasm.models import Germplasm


@pytest.mark.django_db
def test_germplasm_create(auth_client):
    program = Program.objects.create(name='Program G')

    response = auth_client.post(
        '/api/germplasm/',
        {
            'name': 'Line 1',
            'program': program.id,
            'species': 'Triticum aestivum',
            'cross_type': 'unknown',
        },
        format='json',
    )

    assert response.status_code == 201
    assert Germplasm.objects.filter(name='Line 1').exists()
