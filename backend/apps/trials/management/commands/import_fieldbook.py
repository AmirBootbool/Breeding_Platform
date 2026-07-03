import csv
import os

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.trials.models import Observation, ObservationVariable, Plot, Trial


class Command(BaseCommand):
    help = "Import trial observations from a Field Book compatible CSV export."

    def add_arguments(self, parser):
        parser.add_argument("csv_file", help="Path to the CSV file")
        parser.add_argument("--trial", required=True, help="Trial code")

    def handle(self, *args, **options):
        csv_file_path = options["csv_file"]
        trial_code = options["trial"]

        if not os.path.exists(csv_file_path):
            raise CommandError(f"CSV file '{csv_file_path}' does not exist.")

        try:
            trial = Trial.objects.get(trial_code=trial_code)
        except Trial.DoesNotExist:
            raise CommandError(f"Trial '{trial_code}' does not exist.")

        # Load all variables and build mapping of name -> ObservationVariable
        variables = {var.name: var for var in ObservationVariable.objects.all()}

        self.stdout.write(
            f"Importing Field Book data for trial '{trial.trial_code}'..."
        )

        imported_count = 0
        error_count = 0

        try:
            with open(csv_file_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)

                # Determine plot ID column header
                # (support plot_id, plot, or plot_number)
                plot_id_col = None
                for col in ["plot_id", "plot", "plot_number"]:
                    if col in reader.fieldnames:
                        plot_id_col = col
                        break

                if not plot_id_col:
                    raise CommandError(
                        "CSV is missing plot identifier column "
                        "(plot_id/plot/plot_number). "
                        f"Headers: {reader.fieldnames}"
                    )

                # Match other columns to variables
                var_cols = {}
                for col in reader.fieldnames:
                    if col in variables:
                        var_cols[col] = variables[col]

                if not var_cols:
                    self.stdout.write(
                        "No matching observation variable columns found in CSV."
                    )
                    return

                self.stdout.write(f"Found trait columns: {list(var_cols.keys())}")

                # Process all rows atomically
                with transaction.atomic():
                    for row_idx, row in enumerate(reader, start=2):
                        plot_number_raw = row.get(plot_id_col, "").strip()
                        if not plot_number_raw:
                            self.stderr.write(
                                f"Row {row_idx}: Skipped (missing plot identifier)"
                            )
                            error_count += 1
                            continue

                        try:
                            plot_number = int(plot_number_raw)
                        except ValueError:
                            self.stderr.write(
                                f"Row {row_idx}: Error (invalid plot number format: "
                                f"'{plot_number_raw}')"
                            )
                            error_count += 1
                            continue

                        # Find matching plot
                        try:
                            plot = Plot.objects.get(
                                trial=trial, plot_number=plot_number
                            )
                        except Plot.DoesNotExist:
                            self.stderr.write(
                                f"Row {row_idx}: Error (plot {plot_number} "
                                f"not found in trial '{trial_code}')"
                            )
                            error_count += 1
                            continue

                        # Parse variable values
                        for col_name, var in var_cols.items():
                            cell_val = row.get(col_name, "").strip()
                            if cell_val == "":
                                # Skip empty values
                                continue

                            val_num = None
                            val_text = ""
                            val_date = None

                            if var.data_type in ("numeric", "integer"):
                                try:
                                    val_num = float(cell_val)
                                except ValueError:
                                    self.stderr.write(
                                        f"Row {row_idx}: Error (invalid numeric value "
                                        f"'{cell_val}' for variable '{col_name}')"
                                    )
                                    error_count += 1
                                    continue
                            elif var.data_type == "date":
                                val_date = parse_date(cell_val)
                                if not val_date:
                                    self.stderr.write(
                                        f"Row {row_idx}: Error (invalid date format "
                                        f"'{cell_val}' for variable '{col_name}', "
                                        "expect YYYY-MM-DD)"
                                    )
                                    error_count += 1
                                    continue
                            else:  # text, categorical
                                val_text = cell_val

                            # Create or update observation
                            obs, created = Observation.objects.get_or_create(
                                plot=plot,
                                variable=var,
                                defaults={
                                    "value_numeric": val_num,
                                    "value_text": val_text,
                                    "value_date": val_date,
                                    "observation_time": timezone.now(),
                                },
                            )
                            if not created:
                                obs.value_numeric = val_num
                                obs.value_text = val_text
                                obs.value_date = val_date
                                obs.observation_time = timezone.now()

                            try:
                                obs.full_clean()
                                obs.save()
                                imported_count += 1
                            except ValidationError as ve:
                                model_field_errors = (
                                    ve.message_dict
                                    if hasattr(ve, "message_dict")
                                    else ve.messages
                                )
                                self.stderr.write(
                                    f"Row {row_idx}: Validation error "
                                    f"saving observation "
                                    f"for '{col_name}': {model_field_errors}"
                                )
                                error_count += 1

        except Exception as e:
            if not isinstance(e, CommandError):
                raise CommandError(f"Error during import: {e}")
            raise e

        self.stdout.write("--- Field Book Import Summary ---")
        self.stdout.write(f"Observations Saved: {imported_count}")
        self.stdout.write(f"Errors: {error_count}")
        self.stdout.write("Field Book import complete.")
