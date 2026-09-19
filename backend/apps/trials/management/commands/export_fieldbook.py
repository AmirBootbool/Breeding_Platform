import csv

from openpyxl import Workbook

from django.core.management.base import BaseCommand, CommandError

from apps.trials.models import ObservationVariable, Plot, Trial


class Command(BaseCommand):
    help = "Export trial layout in Field Book compatible CSV or XLSX format."

    def add_arguments(self, parser):
        parser.add_argument("--trial", required=True, help="Trial code")
        parser.add_argument(
            "--output",
            help="Path to the output file. If omitted, writes CSV to stdout.",
        )
        parser.add_argument(
            "--format",
            choices=["csv", "xlsx"],
            default="csv",
            help="Output format (default: csv).",
        )

    def handle(self, *args, **options):
        trial_code = options["trial"]
        output_path = options["output"]
        fmt = options["format"]

        if fmt == "xlsx" and not output_path:
            raise CommandError("--output is required when --format xlsx is used.")

        try:
            trial = Trial.objects.get(trial_code=trial_code)
        except Trial.DoesNotExist:
            raise CommandError(f"Trial '{trial_code}' does not exist.")

        from apps.trials.services import prepare_fieldbook_export

        headers, plots, row_for = prepare_fieldbook_export(trial)

        if fmt == "xlsx":
            wb = Workbook(write_only=True)
            ws = wb.create_sheet()
            ws.append(headers)
            for plot in plots:
                ws.append(row_for(plot))
            try:
                wb.save(output_path)
            except OSError as e:
                raise CommandError(f"Failed to write to file: {e}")
            self.stdout.write(
                f"Successfully exported Field Book layout for "
                f"trial '{trial_code}' to {output_path}"
            )
            return

        def write_csv(f):
            writer = csv.writer(f)
            writer.writerow(headers)
            for plot in plots:
                writer.writerow(row_for(plot))

        if output_path:
            try:
                with open(output_path, "w", newline="", encoding="utf-8") as f:
                    write_csv(f)
                self.stdout.write(
                    f"Successfully exported Field Book layout for "
                    f"trial '{trial_code}' to {output_path}"
                )
            except OSError as e:
                raise CommandError(f"Failed to write to file: {e}")
        else:
            write_csv(self.stdout)
