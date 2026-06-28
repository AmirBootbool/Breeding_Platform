import pytest

from apps.core.models import Location, Program, Season
from apps.germplasm.models import Germplasm
from apps.trials.models import Plot, Trial


@pytest.mark.django_db
def test_trial_create_plots(auth_client):
    program = Program.objects.create(name='Trial Program')
    location = Location.objects.create(name='Test Field')
    season = Season.objects.create(name='2026 Main', year=2026, program=program)
    Germplasm.objects.create(name='Line A', germplasm_db_id='G001', program=program)
    Germplasm.objects.create(name='Line B', germplasm_db_id='G002', program=program)
    trial = Trial.objects.create(
        name='Trial One',
        trial_code='TR-001',
        program=program,
        location=location,
        season=season,
        design_type='RCBD',
        num_reps=2,
    )

    response = auth_client.post(
        f'/api/trials/{trial.id}/create_plots/',
        {},
        format='json',
    )

    assert response.status_code == 201
    assert response.data['created_count'] == 4
    assert Plot.objects.filter(trial=trial).count() == 4
