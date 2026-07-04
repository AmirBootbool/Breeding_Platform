import pytest

from apps.core.models import Location, Program, Season
from apps.germplasm.models import Cross, Germplasm
from apps.trials.models import Observation, Plot, Trial


@pytest.mark.django_db
def test_filter_programs(auth_client, program):
    # Create program with different crop
    Program.objects.create(name="Barley Program", crop="barley")

    # Filter by crop
    response = auth_client.get("/api/programs/?crop=barley")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["name"] == "Barley Program"


@pytest.mark.django_db
def test_filter_locations(auth_client):
    Location.objects.create(name="Field A", country="USA", region="Midwest")
    Location.objects.create(name="Field B", country="Canada", region="Ontario")

    # Filter by country
    response = auth_client.get("/api/locations/?country=USA")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["name"] == "Field A"

    # Filter by region
    response = auth_client.get("/api/locations/?region=Ontario")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["name"] == "Field B"


@pytest.mark.django_db
def test_filter_seasons(auth_client, program, season):
    other_program = Program.objects.create(name="Other Program")
    Season.objects.create(
        name="2025 Winter", year=2025, program=other_program
    )

    # Filter by year
    response = auth_client.get("/api/seasons/?year=2025")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["name"] == "2025 Winter"

    # Filter by program
    response = auth_client.get(f"/api/seasons/?program={program.id}")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["name"] == season.name


@pytest.mark.django_db
def test_filter_germplasm(auth_client, program, germplasm):
    other_program = Program.objects.create(name="Other Program")
    Germplasm.objects.create(
        name="Line C",
        germplasm_db_id="G003",
        program=other_program,
        cross_type="self",
        species="Triticum durum",
    )

    # Filter by program
    response = auth_client.get(f"/api/germplasm/?program={other_program.id}")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["name"] == "Line C"

    # Filter by cross_type
    response = auth_client.get("/api/germplasm/?cross_type=self")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["name"] == "Line C"

    # Filter by species
    response = auth_client.get("/api/germplasm/?species=Triticum durum")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["name"] == "Line C"


@pytest.mark.django_db
def test_filter_crosses(auth_client, germplasm, second_germplasm):
    other_program = Program.objects.create(name="Other Program")
    germ_c = Germplasm.objects.create(
        name="Line C", germplasm_db_id="G003", program=other_program
    )
    germ_d = Germplasm.objects.create(
        name="Line D", germplasm_db_id="G004", program=other_program
    )
    loc = Location.objects.create(name="Crossing Block A")

    Cross.objects.create(
        cross_code="C001",
        female_parent=germplasm,
        male_parent=second_germplasm,
        cross_date="2026-06-01",
    )
    Cross.objects.create(
        cross_code="C002",
        female_parent=germ_c,
        male_parent=germ_d,
        cross_date="2026-06-02",
        location=loc,
    )

    # Filter by female parent
    response = auth_client.get(f"/api/crosses/?female_parent={germ_c.id}")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["cross_code"] == "C002"

    # Filter by location
    response = auth_client.get(f"/api/crosses/?location={loc.id}")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["cross_code"] == "C002"


@pytest.mark.django_db
def test_filter_trials(auth_client, program, location, season, trial):
    other_program = Program.objects.create(name="Other Program")
    other_loc = Location.objects.create(name="Other Field")
    other_season = Season.objects.create(
        name="2025 Season", year=2025, program=other_program
    )
    Trial.objects.create(
        name="Trial Two",
        trial_code="TR-002",
        program=other_program,
        location=other_loc,
        season=other_season,
        design_type="alpha_lattice",
    )

    # Filter by design type
    response = auth_client.get("/api/trials/?design_type=alpha_lattice")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["trial_code"] == "TR-002"

    # Filter by location
    response = auth_client.get(f"/api/trials/?location={location.id}")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["trial_code"] == trial.trial_code


@pytest.mark.django_db
def test_filter_plots(auth_client, trial, plot):
    other_germ = Germplasm.objects.create(
        name="Other Line", germplasm_db_id="G999", program=trial.program
    )
    Plot.objects.create(
        trial=trial,
        germplasm=other_germ,
        rep=2,
        plot_number=2,
        status="planted",
    )

    # Filter by germplasm
    response = auth_client.get(f"/api/plots/?germplasm={other_germ.id}")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["plot_number"] == 2

    # Filter by status
    response = auth_client.get("/api/plots/?status=planted")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["plot_number"] == 2


@pytest.mark.django_db
def test_filter_observations(auth_client, plot, observation_variable):
    Observation.objects.create(
        plot=plot,
        variable=observation_variable,
        value_numeric=15.2,
    )

    # Filter by variable
    response = auth_client.get(f"/api/observations/?variable={observation_variable.id}")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["value_numeric"] == 15.2

    # Filter by nested trial (plot__trial)
    response = auth_client.get(f"/api/observations/?plot__trial={plot.trial.id}")
    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["value_numeric"] == 15.2
