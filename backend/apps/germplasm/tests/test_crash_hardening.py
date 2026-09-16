import io

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model

from apps.core.models import Program, UserProfile
from apps.germplasm.models import Cross, CrossingBlock, Germplasm, SeedLot
from apps.germplasm.services import import_germplasm_csv

User = get_user_model()


def _client_for(role, program=None):
    user = User.objects.create_user(
        username=f"{role}_{Program.objects.count()}_{User.objects.count()}",
        password="password12345",
    )
    UserProfile.objects.create(user=user, role=role, program=program)
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.fixture
def program(db):
    return Program.objects.create(name="Bread Wheat", crop="wheat")


@pytest.mark.django_db
def test_bulk_delete_skips_protected_germplasm(program):
    client, _ = _client_for("breeder", program)
    protected = Germplasm.objects.create(name="Parent Line", program=program)
    free = Germplasm.objects.create(name="Unreferenced Line", program=program)
    SeedLot.objects.create(
        germplasm=protected, program=program, lot_code="LOT-1", quantity_grams=10
    )

    resp = client.post(
        "/api/germplasm/bulk_delete/",
        {"ids": [protected.id, free.id]},
        format="json",
    )

    assert resp.status_code == status.HTTP_409_CONFLICT
    assert resp.data["deleted_count"] == 1
    assert free.id in resp.data["deleted_ids"]
    assert resp.data["skipped"][0]["id"] == protected.id
    assert not Germplasm.objects.filter(id=free.id).exists()
    assert Germplasm.objects.filter(id=protected.id).exists()


@pytest.mark.django_db
def test_advance_rejects_non_numeric_ssd_count(program):
    client, _ = _client_for("breeder", program)
    germ = Germplasm.objects.create(name="Line A", program=program, generation=1)

    resp = client.post(
        "/api/germplasm/advance/",
        {"germplasm_ids": [germ.id], "method": "ssd", "ssd_count": "not-a-number"},
        format="json",
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_low_stock_rejects_non_numeric_threshold(program):
    client, _ = _client_for("breeder", program)
    germ = Germplasm.objects.create(name="Line A", program=program)
    SeedLot.objects.create(
        germplasm=germ, program=program, lot_code="LOT-1", quantity_grams=5
    )

    resp = client.get("/api/seed-lots/low_stock/?threshold=abc")
    assert resp.status_code == status.HTTP_400_BAD_REQUEST

    resp_default = client.get("/api/seed-lots/low_stock/")
    assert resp_default.status_code == status.HTTP_200_OK


@pytest.mark.django_db
def test_csv_import_ragged_row_does_not_crash_the_whole_import(program):
    # A row shorter than the header gives DictReader's missing trailing
    # columns as None (not a missing key), so `.strip()` on None used to
    # raise an uncaught AttributeError that aborted the whole import - even
    # though a bare name with blank optional fields is otherwise valid.
    csv_data = (
        "name,species,pedigree_string,cross_type,year_developed,notes\n"
        "GoodLine,Triticum aestivum,F1/F2,biparental,2024,ok\n"
        "ShortRow\n"
    )
    file_obj = io.BytesIO(csv_data.encode("utf-8"))
    result = import_germplasm_csv(file_obj, program.name, dry_run=False)

    assert result["created"] == 2
    assert not result["errors"]
    assert Germplasm.objects.filter(name="GoodLine").exists()
    assert Germplasm.objects.filter(name="ShortRow").exists()


@pytest.mark.django_db
def test_csv_import_row_with_blank_name_reports_a_per_row_error(program):
    # Any row error rolls back the whole batch (existing, unrelated
    # behavior) - what matters here is that a blank name is reported as a
    # clean per-row error instead of raising.
    csv_data = "name,species\n,Triticum aestivum\nLine2,Triticum aestivum\n"
    file_obj = io.BytesIO(csv_data.encode("utf-8"))
    result = import_germplasm_csv(file_obj, program.name, dry_run=False)

    assert any(e["row"] == 2 and "name" in e["detail"] for e in result["errors"])


@pytest.mark.django_db
def test_cross_code_generation_is_sequential_and_unique(program):
    from apps.germplasm.crossing_service import plan_crosses

    block = CrossingBlock.objects.create(name="Block A", program=program)
    fem1 = Germplasm.objects.create(name="Fem1", program=program)
    fem2 = Germplasm.objects.create(name="Fem2", program=program)
    male1 = Germplasm.objects.create(name="Male1", program=program)

    created = plan_crosses(block, [fem1.id, fem2.id], [male1.id])
    codes = [c.cross_code for c in created]
    assert len(codes) == len(set(codes))
    assert Cross.objects.filter(cross_code__in=codes).count() == len(codes)
