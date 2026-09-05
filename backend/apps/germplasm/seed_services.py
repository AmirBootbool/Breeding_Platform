from django.core.exceptions import ValidationError
from django.db import transaction
from .models import SeedLot, SeedTransaction


def record_seed_transaction(
    seed_lot,
    transaction_type,
    quantity_grams,
    destination_trial=None,
    notes="",
    user=None,
):
    """
    Executes a seed transaction (deposit, planting deduction, distribution, adjustment)
    and updates the parent SeedLot's remaining balance atomically.
    """
    quantity_grams = float(quantity_grams)

    with transaction.atomic():
        new_balance = seed_lot.quantity_grams + quantity_grams
        if new_balance < 0:
            raise ValidationError(
                f"Insufficient seed inventory on {seed_lot.lot_code}. "
                f"Current balance: {seed_lot.quantity_grams}g, requested deduction: {-quantity_grams}g."
            )

        tx = SeedTransaction.objects.create(
            seed_lot=seed_lot,
            transaction_type=transaction_type,
            quantity_grams=quantity_grams,
            destination_trial=destination_trial,
            notes=notes,
            created_by=user,
        )

        seed_lot.quantity_grams = round(new_balance, 2)
        if seed_lot.quantity_grams == 0:
            seed_lot.status = "depleted"
        elif seed_lot.status == "depleted" and seed_lot.quantity_grams > 0:
            seed_lot.status = "available"

        seed_lot.updated_by = user
        seed_lot.save()

    return tx


def build_barcode_label_data(seed_lot):
    """
    Generates standardized barcode & label payload for physical seed envelope printing.
    """
    return {
        "lot_code": seed_lot.lot_code,
        "germplasm_name": seed_lot.germplasm.name,
        "germplasm_db_id": seed_lot.germplasm.germplasm_db_id,
        "species": seed_lot.germplasm.species,
        "program_name": seed_lot.program.name,
        "quantity_grams": seed_lot.quantity_grams,
        "storage_location": seed_lot.storage_location,
        "harvest_date": (
            seed_lot.harvest_date.strftime("%Y-%m-%d")
            if seed_lot.harvest_date
            else "N/A"
        ),
        "source_plot": (
            seed_lot.source_plot.plot_number if seed_lot.source_plot else "N/A"
        ),
        "barcode_text": f"*{seed_lot.lot_code}*",
        "qr_payload": (
            f"ID:{seed_lot.germplasm.germplasm_db_id}|LOT:{seed_lot.lot_code}|"
            f"LOC:{seed_lot.storage_location}|QTY:{seed_lot.quantity_grams}g"
        ),
    }
