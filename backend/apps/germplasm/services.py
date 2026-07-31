import csv
import io

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.core.models import Program
from apps.germplasm.models import Germplasm


def import_germplasm_csv(file_obj, program_name, dry_run=False):
    """Parse and optionally persist germplasm rows from an uploaded CSV.

    Returns a dict: {"created": int, "skipped": int,
                     "errors": [{"row": int, "detail": str}]}
    """
    try:
        program = Program.objects.get(name=program_name)
    except Program.DoesNotExist as exc:
        raise ValidationError(f"Program '{program_name}' does not exist.") from exc

    text_stream = io.TextIOWrapper(file_obj, encoding="utf-8")
    reader = csv.DictReader(text_stream)

    # Header validation — must contain at least "name"
    if not reader.fieldnames or "name" not in reader.fieldnames:
        raise ValidationError(
            f"CSV is missing required headers. Found: {reader.fieldnames}"
        )

    created = 0
    skipped = 0
    errors = []
    with transaction.atomic():
        for i, row in enumerate(reader, start=2):  # header is row 1
            name = row.get("name", "").strip()
            if not name:
                errors.append({"row": i, "detail": "Missing required field: name"})
                continue

            # Skip duplicates within the same program (matches CLI behavior)
            if Germplasm.objects.filter(program=program, name=name).exists():
                skipped += 1
                continue

            try:
                germplasm = Germplasm(
                    name=name,
                    species=row.get("species", "").strip() or "Triticum aestivum",
                    program=program,
                    pedigree_string=row.get("pedigree_string", "").strip(),
                    cross_type=row.get("cross_type", "").strip() or "unknown",
                    year_developed=int(row["year_developed"]) if row.get("year_developed", "").strip() else None,
                    notes=row.get("notes", "").strip(),
                )
                germplasm.full_clean()
                if not dry_run:
                    germplasm.save()
                created += 1
            except (ValidationError, KeyError, ValueError) as exc:
                errors.append({"row": i, "detail": str(exc)})

        if dry_run or errors:
            transaction.set_rollback(True)

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }
