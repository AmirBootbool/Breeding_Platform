import pytest
from django.contrib.auth import get_user_model
from apps.core.models import Program, Location, Season, UserProfile


@pytest.mark.django_db
def test_core_models_and_userprofile():
    User = get_user_model()
    program = Program.objects.create(name='CoreProg')
    location = Location.objects.create(name='Loc1', country='Wonderland')
    season = Season.objects.create(year=2026, name='2026 Main', program=program)

    user = User.objects.create_user(username='alice', password='password')
    profile = UserProfile.objects.create(user=user, role='breeder', program=program)

    assert Program.objects.count() == 1
    assert Location.objects.filter(country='Wonderland').exists()
    assert season.program == program
    assert profile.user.username == 'alice'
    assert profile.role == 'breeder'
    assert profile.program == program
