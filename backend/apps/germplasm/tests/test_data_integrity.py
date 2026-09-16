import pytest
from rest_framework import status
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from apps.core.models import Program, UserProfile
from apps.germplasm.models import Germplasm, SeedLot, SeedTransaction
from apps.germplasm.seed_services import record_seed_transaction

User = get_user_model()


@pytest.fixture
def program(db):
    return Program.objects.create(name="Bread Wheat", crop="wheat")


@pytest.fixture
def client(program):
    user = User.objects.create_user(username="breeder", password="password12345")
    UserProfile.objects.create(user=user, role="breeder", program=program)
    api_client = APIClient()
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def germplasm(program):
    return Germplasm.objects.create(name="Line A", program=program)


@pytest.mark.django_db
def test_record_seed_transaction_reads_a_freshly_locked_balance(program, germplasm):
    lot = SeedLot.objects.create(
        germplasm=germplasm, program=program, lot_code="LOT-1", quantity_grams=100
    )
    # Simulate a caller holding a stale in-memory copy of the lot (e.g.
    # fetched before another request already changed the balance).
    stale_lot = SeedLot.objects.get(pk=lot.pk)
    lot.quantity_grams = 40
    lot.save(update_fields=["quantity_grams"])

    record_seed_transaction(stale_lot, "adjustment", -30, notes="test")

    lot.refresh_from_db()
    # Must be based on the fresh (40g) balance, not the stale in-memory
    # value (100g) the caller happened to be holding.
    assert lot.quantity_grams == 10


@pytest.mark.django_db
def test_record_seed_transaction_still_rejects_insufficient_stock(program, germplasm):
    lot = SeedLot.objects.create(
        germplasm=germplasm, program=program, lot_code="LOT-2", quantity_grams=5
    )
    with pytest.raises(ValidationError):
        record_seed_transaction(lot, "adjustment", -10, notes="test")


@pytest.mark.django_db
def test_split_lot_is_atomic_and_leaves_no_orphaned_deduction(client, program, germplasm):
    lot = SeedLot.objects.create(
        germplasm=germplasm, program=program, lot_code="LOT-3", quantity_grams=100
    )

    resp = client.post(
        f"/api/seed-lots/{lot.id}/split/",
        {"quantity_grams": 40, "storage_location": "Shelf B"},
        format="json",
    )
    assert resp.status_code == status.HTTP_201_CREATED

    lot.refresh_from_db()
    assert lot.quantity_grams == 60
    new_lot_id = resp.data["new_lot"]["id"]
    new_lot = SeedLot.objects.get(id=new_lot_id)
    assert new_lot.quantity_grams == 40

    # Every gram is accounted for: parent's deduction + new lot's deposit.
    total_tx = sum(
        tx.quantity_grams
        for tx in SeedTransaction.objects.filter(seed_lot__in=[lot, new_lot])
    )
    assert total_tx == 0  # -40 (parent) + 40 (new lot) nets to zero


@pytest.mark.django_db
def test_split_lot_rejects_quantity_at_or_above_current_balance(client, program, germplasm):
    lot = SeedLot.objects.create(
        germplasm=germplasm, program=program, lot_code="LOT-4", quantity_grams=50
    )
    resp = client.post(
        f"/api/seed-lots/{lot.id}/split/", {"quantity_grams": 50}, format="json"
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    lot.refresh_from_db()
    assert lot.quantity_grams == 50  # untouched
    assert not SeedTransaction.objects.filter(seed_lot=lot).exists()


@pytest.mark.django_db
def test_advance_plots_disambiguates_colliding_generated_names(client, program, germplasm):
    from apps.core.models import Location, Season
    from apps.trials.models import Plot, Trial
    from apps.trials.services import advance_plots

    loc = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026", year=2026, program=program)
    trial = Trial.objects.create(
        name="Trial", trial_code="TR-1", program=program, location=loc,
        season=season, design_type="RCBD",
    )
    # An F8 line: advancement is capped at F8, so advancing it repeatedly
    # would otherwise generate the identical name every time.
    line = Germplasm.objects.create(name="Line-X", program=program, generation=8)
    plot1 = Plot.objects.create(trial=trial, germplasm=line, rep=1, plot_number=1)
    plot2 = Plot.objects.create(trial=trial, germplasm=line, rep=2, plot_number=2)

    ids1 = advance_plots([plot1.id], selections_per_plot=1, selection_method="SSD")
    ids2 = advance_plots([plot2.id], selections_per_plot=1, selection_method="SSD")

    name1 = Germplasm.objects.get(id=ids1[0]).name
    name2 = Germplasm.objects.get(id=ids2[0]).name
    assert name1 != name2


@pytest.mark.django_db
def test_harvest_plots_disambiguates_colliding_generated_names(client, program, germplasm):
    from apps.core.models import Location, Season
    from apps.trials.models import Plot, Trial

    loc = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026", year=2026, program=program)
    trial = Trial.objects.create(
        name="Trial", trial_code="TR-2", program=program, location=loc,
        season=season, design_type="RCBD",
    )
    plot = Plot.objects.create(trial=trial, germplasm=germplasm, rep=1, plot_number=5)

    resp1 = client.post(
        f"/api/trials/{trial.id}/harvest_plots/",
        {"plot_ids": [plot.id], "method": "bulk"},
        format="json",
    )
    resp2 = client.post(
        f"/api/trials/{trial.id}/harvest_plots/",
        {"plot_ids": [plot.id], "method": "bulk"},
        format="json",
    )
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    name1 = Germplasm.objects.get(id=resp1.data["created_ids"][0]).name
    name2 = Germplasm.objects.get(id=resp2.data["created_ids"][0]).name
    assert name1 != name2


@pytest.mark.django_db
def test_harvest_plots_rejects_non_numeric_ssd_count(client, program, germplasm):
    from apps.core.models import Location, Season
    from apps.trials.models import Plot, Trial

    loc = Location.objects.create(name="Field")
    season = Season.objects.create(name="2026", year=2026, program=program)
    trial = Trial.objects.create(
        name="Trial", trial_code="TR-3", program=program, location=loc,
        season=season, design_type="RCBD",
    )
    plot = Plot.objects.create(trial=trial, germplasm=germplasm, rep=1, plot_number=1)

    resp = client.post(
        f"/api/trials/{trial.id}/harvest_plots/",
        {"plot_ids": [plot.id], "method": "ssd", "ssd_count": "many"},
        format="json",
    )
    assert resp.status_code == 400
