import pytest
from apps.core.models import Program, Location, Season
from apps.germplasm.models import Germplasm
from apps.trials.models import Trial, Plot


@pytest.mark.django_db
def test_plot_unique_number_within_trial():
    program = Program.objects.create(name='P2')
    location = Location.objects.create(name='Farm')
    season = Season.objects.create(year=2026, name='S', program=program)

    g = Germplasm.objects.create(name='LineA', germplasm_db_id='LA', program=program)
    trial = Trial.objects.create(name='TrialX', trial_code='TX', program=program, location=location, season=season, design_type='RCBD', num_reps=1)

    Plot.objects.create(trial=trial, germplasm=g, rep=1, plot_number=1)
    # creating another plot with same plot_number in same trial should fail
    with pytest.raises(Exception):
        Plot.objects.create(trial=trial, germplasm=g, rep=1, plot_number=1)
