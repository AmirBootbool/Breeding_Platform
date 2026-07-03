import csv
import os

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.core.models import Program
from apps.germplasm.models import Germplasm


class Command(BaseCommand):
    help = "Import germplasm records from a CSV file."

    def add_arguments(self, parser):
        parser.add_argument("csv_file", help="Path to the CSV file")
        parser.add_argument("--program", required=True, help="Program name")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate CSV format and data correctness without importing.",
        )

    def handle(self, *args, **options):
        csv_file_path = options["csv_file"]
        program_name = options["program"]
        dry_run = options["dry_run"]

        if not os.path.exists(csv_file_path):
            raise CommandError(f"CSV file '{csv_file_path}' does not exist.")

        try:
            program = Program.objects.get(name=program_name)
        except Program.DoesNotExist:
            raise CommandError(f"Program '{program_name}' does not exist.")

        self.stdout.write(f"Reading germplasm from: {csv_file_path}")
        self.stdout.write(f"Target Program: {program.name}")

        created_count = 0
        skipped_count = 0
        error_count = 0

        try:
            with open(csv_file_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)

                # Validate headers
                expected_headers = {"name"}
                if not reader.fieldnames or not expected_headers.issubset(
                    set(reader.fieldnames)
                ):
                    raise CommandError(
                        f"CSV is missing required headers. Found: {reader.fieldnames}"
                    )

                # Process rows within a single transaction if not dry-run
                with transaction.atomic():
                    for row_idx, row in enumerate(reader, start=2):
                        name = row.get("name", "").strip()
                        if not name:
                            self.stderr.write(f"Row {row_idx}: Skipped (missing name)")
                            error_count += 1
                            continue

                        # Check if duplicate in program
                        if Germplasm.objects.filter(
                            program=program, name=name
                        ).exists():
                            self.stdout.write(
                                f"Row {row_idx}: Skipped (Germplasm '{name}' "
                                "already exists in program)"
                            )
                            skipped_count += 1
                            continue

                        species = row.get("species", "").strip() or "Triticum aestivum"
                        pedigree_string = row.get("pedigree_string", "").strip()
                        cross_type = row.get("cross_type", "").strip() or "unknown"

                        year_developed_raw = row.get("year_developed", "").strip()
                        year_developed = None
                        if year_developed_raw:
                            try:
                                year_developed = int(year_developed_raw)
                            except ValueError:
                                self.stderr.write(
                                    f"Row {row_idx}: Error (invalid "
                                    f"year_developed: '{year_developed_raw}')"
                                )
                                error_count += 1
                                continue

                        notes = row.get("notes", "").strip()

                        # Instantiate model and validate
                        germplasm = Germplasm(
                            name=name,
                            species=species,
                            pedigree_string=pedigree_string,
                            cross_type=cross_type,
                            year_developed=year_developed,
                            notes=notes,
                            program=program,
                        )

                        try:
                            # Trigger model validations (e.g. choice
                            # validation for cross_type)
                            germplasm.full_clean()
                        except ValidationError as ve:
                            self.stderr.write(
                                f"Row {row_idx}: Validation Error: {ve.message_dict}"
                            )
                            error_count += 1
                            continue

                        if not dry_run:
                            germplasm.save()
                        created_count += 1

                    if dry_run:
                        # If dry-run, roll back any changes just in case
                        transaction.set_rollback(True)

        except Exception as e:
            if not isinstance(e, CommandError):
                raise CommandError(f"Error during import: {e}")
            raise e

        # Report summary
        self.stdout.write("--- Import Summary ---")
        self.stdout.write(f"Created: {created_count}")
        self.stdout.write(f"Skipped (Duplicate): {skipped_count}")
        self.stdout.write(f"Errors: {error_count}")
        if dry_run:
            self.stdout.write("Dry run complete. No database changes were saved.")
        else:
            self.stdout.write("Import complete.")
