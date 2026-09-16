import os

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from apps.trials.models import Trial


class Command(BaseCommand):
    help = "Import trial observations from a Field Book compatible CSV or XLSX export."

    def add_arguments(self, parser):
        parser.add_argument("csv_file", help="Path to the CSV or XLSX file")
        parser.add_argument("--trial", required=True, help="Trial code")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate file format and data correctness without importing.",
        )

    def handle(self, *args, **options):
        csv_file_path = options["csv_file"]
        trial_code = options["trial"]
        dry_run = options["dry_run"]

        if not os.path.exists(csv_file_path):
            raise CommandError(f"File '{csv_file_path}' does not exist.")

        try:
            trial = Trial.objects.get(trial_code=trial_code)
        except Trial.DoesNotExist:
            raise CommandError(f"Trial '{trial_code}' does not exist.")

        self.stdout.write(
            f"Importing Field Book data for trial '{trial.trial_code}'..."
        )

        from apps.trials.services import import_fieldbook_csv

        try:
            with open(csv_file_path, "rb") as f:
                result = import_fieldbook_csv(
                    trial, f, filename=csv_file_path, dry_run=dry_run
                )
        except ValidationError as ve:
            msg = ve.message_dict if hasattr(ve, "message_dict") else str(ve)
            raise CommandError(str(msg))

        self.stdout.write(f"Matched trait columns: {result['matched_variables']}")

        for err in result["errors"]:
            self.stderr.write(f"Row {err['row']}: {err['detail']}")

        saved = result["imported_count"] + result["updated_count"]

        self.stdout.write("--- Field Book Import Summary ---")
        self.stdout.write(f"Observations Saved: {saved}")
        self.stdout.write(f"Errors: {len(result['errors'])}")

        if dry_run:
            self.stdout.write("Dry run complete. No database changes were saved.")
        elif result["errors"]:
            self.stdout.write(
                "Import rolled back due to errors - fix the reported rows and re-run."
            )
        else:
            self.stdout.write("Field Book import complete.")
