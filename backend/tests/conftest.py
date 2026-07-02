import pytest
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Location, Program, Season, UserProfile
from apps.germplasm.models import Germplasm
from apps.trials.models import ObservationVariable, Plot, Trial


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def program(db):
    return Program.objects.create(name="Test Program")


@pytest.fixture
def location(db):
    return Location.objects.create(name="Test Field")


@pytest.fixture
def season(db, program):
    return Season.objects.create(name="2026 Main", year=2026, program=program)


@pytest.fixture
def germplasm(db, program):
    return Germplasm.objects.create(
        name="Line A", germplasm_db_id="G001", program=program
    )


@pytest.fixture
def second_germplasm(db, program):
    return Germplasm.objects.create(
        name="Line B", germplasm_db_id="G002", program=program
    )


@pytest.fixture
def trial(db, program, location, season):
    return Trial.objects.create(
        name="Trial One",
        trial_code="TR-001",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=2,
    )


@pytest.fixture
def plot(db, trial, germplasm):
    return Plot.objects.create(trial=trial, germplasm=germplasm, rep=1, plot_number=1)


@pytest.fixture
def observation_variable(db):
    return ObservationVariable.objects.create(
        name="Plant height", variable_code="PH", data_type="numeric"
    )


@pytest.fixture
def user(db, program):
    User = get_user_model()
    user = User.objects.create_user(username="tester", password="password12345")
    UserProfile.objects.create(user=user, role="breeder", program=program)
    return user


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def client_for_role(db, program):
    def make_client(role, username=None):
        User = get_user_model()
        username = username or f"{role}_user"
        user = User.objects.create_user(username=username, password="password12345")
        UserProfile.objects.create(user=user, role=role, program=program)
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    return make_client
