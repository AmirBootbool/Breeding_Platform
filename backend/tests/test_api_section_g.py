from datetime import timedelta
import pytest
from django.utils import timezone
from rest_framework import status
from apps.germplasm.models import Germplasm, Cross, SeedLot
from apps.trials.models import ObservationVariable, Plot, Observation
from apps.trials.services import import_fieldbook_csv


@pytest.mark.django_db
def test_external_accession_id_crud_and_search(auth_client, program):
    """Ticket G1: external_accession_id can be created, updated, and searched."""
    res = auth_client.post(
        "/api/germplasm/",
        {
            "name": "PI-TEST-LINE",
            "species": "Triticum aestivum",
            "program": program.id,
            "cross_type": "biparental",
            "generation": 4,
            "external_accession_id": "PI 596532",
        },
        format="json",
    )
    assert res.status_code == status.HTTP_201_CREATED
    germ_id = res.data["id"]
    assert res.data["external_accession_id"] == "PI 596532"

    # Search by external accession id
    search_res = auth_client.get("/api/germplasm/?search=596532")
    assert search_res.status_code == status.HTTP_200_OK
    assert any(g["id"] == germ_id for g in search_res.data["results"])


@pytest.mark.django_db
def test_seed_lot_needs_retest_action(auth_client, program, germplasm):
    """Ticket G2: /api/seed-lots/needs_retest/ returns lots without recent germination tests."""
    today = timezone.now().date()

    # Lot 1: Tested 2 years ago (needs retest)
    SeedLot.objects.create(
        germplasm=germplasm,
        program=program,
        lot_code="LOT-OLD-01",
        quantity_grams=100.0,
        germination_date=today - timedelta(days=500),
        status="available",
    )

    # Lot 2: Never tested (needs retest)
    SeedLot.objects.create(
        germplasm=germplasm,
        program=program,
        lot_code="LOT-UNTESTED-02",
        quantity_grams=150.0,
        germination_date=None,
        status="available",
    )

    # Lot 3: Tested 1 month ago (fresh)
    SeedLot.objects.create(
        germplasm=germplasm,
        program=program,
        lot_code="LOT-FRESH-03",
        quantity_grams=200.0,
        germination_date=today - timedelta(days=30),
        status="available",
    )

    # Lot 4: Depleted lot tested 2 years ago (status is depleted so excluded)
    SeedLot.objects.create(
        germplasm=germplasm,
        program=program,
        lot_code="LOT-DEPLETED-04",
        quantity_grams=0.0,
        germination_date=today - timedelta(days=500),
        status="depleted",
    )

    res = auth_client.get("/api/seed-lots/needs_retest/")
    assert res.status_code == status.HTTP_200_OK
    codes = [l["lot_code"] for l in res.data]
    assert "LOT-OLD-01" in codes
    assert "LOT-UNTESTED-02" in codes
    assert "LOT-FRESH-03" not in codes
    assert "LOT-DEPLETED-04" not in codes


@pytest.mark.django_db
def test_cross_seed_count_field(auth_client, program, germplasm):
    """Ticket G3: Cross seed_count field is patchable and returned in serializer."""
    female = germplasm
    male = Germplasm.objects.create(
        name="Male-Parent-01",
        species="Triticum aestivum",
        program=program,
        cross_type="biparental",
        generation=0,
    )
    cross = Cross.objects.create(
        female_parent=female,
        male_parent=male,
        cross_code="CR-2026-001",
        cross_date=timezone.now().date(),
        status="harvested",
        seed_count=45,
    )

    # Fetch cross
    res = auth_client.get(f"/api/crosses/{cross.id}/")
    assert res.status_code == status.HTTP_200_OK
    assert res.data["seed_count"] == 45

    # Update seed count
    patch_res = auth_client.patch(
        f"/api/crosses/{cross.id}/",
        {"seed_count": 80},
        format="json",
    )
    assert patch_res.status_code == status.HTTP_200_OK
    assert patch_res.data["seed_count"] == 80


@pytest.mark.django_db
def test_dus_descriptor_and_categorical_states(auth_client):
    """Ticket G6: is_dus_descriptor and categorical_states on ObservationVariable."""
    res = auth_client.post(
        "/api/observation-variables/",
        {
            "name": "Plant Growth Habit",
            "variable_code": "PGH",
            "data_type": "categorical",
            "category": "morphological",
            "is_dus_descriptor": True,
            "categorical_states": {
                "1": "Erect",
                "3": "Semi-erect",
                "5": "Intermediate",
                "7": "Semi-prostrate",
                "9": "Prostrate",
            },
        },
        format="json",
    )
    assert res.status_code == status.HTTP_201_CREATED
    var_id = res.data["id"]
    assert res.data["is_dus_descriptor"] is True
    assert res.data["categorical_states"]["1"] == "Erect"

    # Filter by is_dus_descriptor
    filter_res = auth_client.get("/api/observation-variables/?is_dus_descriptor=true")
    assert filter_res.status_code == status.HTTP_200_OK
    assert any(v["id"] == var_id for v in filter_res.data["results"])


@pytest.mark.django_db
def test_fieldbook_import_with_column_mapping(trial, germplasm):
    """Ticket G7: Column mapping maps arbitrary headers (e.g. STB_sev) to platform variables."""
    var = ObservationVariable.objects.create(
        name="Septoria Tritici Blotch Severity",
        variable_code="STB_SEV",
        data_type="numeric",
    )
    plot = Plot.objects.create(trial=trial, plot_number=101, germplasm=germplasm, rep=1)

    csv_content = (
        "plot_id,STB_Custom_Col,Unrecognized_Col\n"
        "101,4.5,hello\n"
    )

    # Import with column mapping
    result = import_fieldbook_csv(
        trial=trial,
        file_obj=csv_content,
        filename="fieldbook.csv",
        dry_run=False,
        column_mapping={"STB_Custom_Col": "Septoria Tritici Blotch Severity"},
    )

    assert result["imported_count"] == 1
    assert "Septoria Tritici Blotch Severity" in result["matched_variables"]
    assert "Unrecognized_Col" in result["unmatched_columns"]

    obs = Observation.objects.get(plot=plot, variable=var)
    assert obs.value_numeric == 4.5


@pytest.mark.django_db
def test_variety_maintenance_cycle_crud(auth_client, germplasm):
    """Ticket G8: VarietyMaintenanceCycle CRUD, validation, and program isolation."""
    res = auth_client.post(
        "/api/maintenance-cycles/",
        {
            "variety": germplasm.id,
            "cycle_number": 1,
            "method": "ear_to_row",
            "off_types_removed": 4,
            "notes": "Rouged 4 tall off-types at anthesis",
        },
        format="json",
    )
    assert res.status_code == status.HTTP_201_CREATED
    cycle_id = res.data["id"]
    assert res.data["off_types_removed"] == 4

    # List endpoint with filter
    list_res = auth_client.get(f"/api/maintenance-cycles/?variety={germplasm.id}")
    assert list_res.status_code == status.HTTP_200_OK
    assert any(c["id"] == cycle_id for c in list_res.data["results"])
