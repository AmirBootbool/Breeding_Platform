import io
import pytest
from apps.core.models import Program, get_default_species_for_crop
from apps.germplasm.models import Germplasm
from apps.germplasm.services import import_germplasm_csv
from apps.trials.models import ObservationVariable


@pytest.mark.django_db
def test_species_resolution_helper():
    assert get_default_species_for_crop("wheat") == "Triticum aestivum"
    assert get_default_species_for_crop("durum_wheat") == "Triticum durum"
    assert get_default_species_for_crop("barley") == "Hordeum vulgare"
    assert get_default_species_for_crop("oats") == "Avena sativa"
    assert get_default_species_for_crop("triticale") == "x Triticosecale"
    assert get_default_species_for_crop("unknown_crop") == "Triticum aestivum"


@pytest.mark.django_db
def test_program_multi_crop_and_updated_at(client_for_role):
    client = client_for_role("admin")

    payload = {
        "name": "Barley Malt Program 2026",
        "crop": "barley",
        "description": "2-row malting barley breeding program",
    }

    resp = client.post("/api/programs/", payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["crop"] == "barley"
    assert "updated_at" in data or "created_at" in data

    prog = Program.objects.get(id=data["id"])
    assert prog.crop == "barley"
    assert prog.updated_at is not None


@pytest.mark.django_db
def test_import_germplasm_csv_auto_species_resolution():
    barley_prog = Program.objects.create(
        name="Barley Feed Program",
        crop="barley",
    )

    csv_content = (
        "name,species,pedigree_string,cross_type\n"
        "BARLEY-LINE-01,,SCARLETT / BARKER,biparental\n"
        "BARLEY-LINE-02,Hordeum vulgare subsp. distichon,VANGUARD / RGT,biparental\n"
    )

    file_obj = io.BytesIO(csv_content.encode("utf-8"))
    res = import_germplasm_csv(file_obj, barley_prog.name)
    assert res["created"] == 2
    assert res["errors"] == []

    # Line 1 had blank species, should resolve to Hordeum vulgare from program.crop
    line1 = Germplasm.objects.get(name="BARLEY-LINE-01", program=barley_prog)
    assert line1.species == "Hordeum vulgare"

    # Line 2 had explicit species, should preserve custom species
    line2 = Germplasm.objects.get(name="BARLEY-LINE-02", program=barley_prog)
    assert line2.species == "Hordeum vulgare subsp. distichon"


@pytest.mark.django_db
def test_observation_variable_crop_filtering(client_for_role):
    client = client_for_role("viewer")

    ObservationVariable.objects.create(name="Grain Yield", crop="all", data_type="numeric")
    ObservationVariable.objects.create(name="Grain Protein", crop="wheat", data_type="numeric")
    ObservationVariable.objects.create(name="Malt Extract %", crop="barley", data_type="numeric")

    # Filter for barley
    resp_barley = client.get("/api/observation-variables/?crop=barley")
    assert resp_barley.status_code == 200
    names = [v["name"] for v in resp_barley.json()["results"]]
    assert "Malt Extract %" in names
    assert "Grain Protein" not in names

    # Filter for wheat
    resp_wheat = client.get("/api/observation-variables/?crop=wheat")
    assert resp_wheat.status_code == 200
    names_wheat = [v["name"] for v in resp_wheat.json()["results"]]
    assert "Grain Protein" in names_wheat
    assert "Malt Extract %" not in names_wheat
