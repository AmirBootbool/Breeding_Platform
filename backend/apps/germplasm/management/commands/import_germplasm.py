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

        self.stdout.write(f"Reading germplasm from: {csv_file_path}")
        self.stdout.write(f"Target Program: {program_name}")

        try:
            from apps.germplasm.services import import_germplasm_csv
            
            with open(csv_file_path, "rb") as f:
                result = import_germplasm_csv(f, program_name, dry_run=dry_run)
        except ValidationError as ve:
            msg = ve.messages[0] if hasattr(ve, "messages") else str(ve)
            raise CommandError(msg)
        except Exception as e:
            raise CommandError(f"Error during import: {e}")

        # Report summary
        self.stdout.write("--- Import Summary ---")
        self.stdout.write(f"Created: {result['created']}")
        self.stdout.write(f"Skipped (Duplicate): {result['skipped']}")
        self.stdout.write(f"Errors: {len(result['errors'])}")
        
        for err in result["errors"]:
            self.stderr.write(f"Row {err['row']}: {err['detail']}")

        if dry_run:
            self.stdout.write("Dry run complete. No database changes were saved.")
        elif result["errors"]:
            self.stdout.write("Import rolled back due to errors.")
        else:
            self.stdout.write("Import complete.")
