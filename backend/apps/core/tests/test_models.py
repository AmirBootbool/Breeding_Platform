import pytest

from django.contrib.auth.models import User

from apps.core.models import Location, Program, Season, UserProfile


@pytest.mark.django_db
def test_program_str():
    program = Program.objects.create(name="ICARDA Wheat", crop="wheat")
    assert str(program) == "ICARDA Wheat"


@pytest.mark.django_db
def test_program_name_unique():
    Program.objects.create(name="Unique Program")
    with pytest.raises(Exception):
        Program.objects.create(name="Unique Program")


@pytest.mark.django_db
def test_location_str():
    location = Location.objects.create(name="Tel Hadya", country="Syria")
    assert str(location) == "Tel Hadya"


@pytest.mark.django_db
def test_season_str():
    program = Program.objects.create(name="Main Program")
    season = Season.objects.create(
        name="2026 Winter Nursery", year=2026, program=program
    )
    assert "2026" in str(season)
    assert "Winter Nursery" in str(season)


@pytest.mark.django_db
def test_userprofile_role_default():
    program = Program.objects.create(name="Test Program")
    user = User.objects.create_user(username="testbreeder", password="pass")
    profile = UserProfile.objects.create(user=user, program=program)
    assert profile.role == "viewer"


@pytest.mark.django_db
def test_user_profile_timestamps_and_relations():
    program = Program.objects.create(name="CoreProg")
    location = Location.objects.create(name="Loc1", country="Wonderland")
    season = Season.objects.create(year=2026, name="2026 Main", program=program)

    user = User.objects.create_user(username="alice", password="password")
    profile = UserProfile.objects.create(user=user, role="breeder", program=program)

    assert location.country == "Wonderland"
    assert Location.objects.filter(country="Wonderland").exists()
    assert season.program == program
    assert profile.user.username == "alice"
    assert profile.role == "breeder"
    assert profile.program == program
    assert profile.created_at is not None
    assert profile.updated_at is not None

    original_updated_at = profile.updated_at
    profile.role = "technician"
    profile.save()
    profile.refresh_from_db()
    assert profile.updated_at != original_updated_at
