import csv

from django.core.management.base import BaseCommand, CommandError

from apps.trials.models import Observation, Trial


class Command(BaseCommand):
    help = "Export trial observations to a CSV file or stdout."

    def add_arguments(self, parser):
        parser.add_argument("--trial", required=True, help="Trial code")
        parser.add_argument(
            "--output",
            help="Path to the output CSV file. If omitted, writes to stdout.",
        )

    def handle(self, *args, **options):
        trial_code = options["trial"]
        output_path = options["output"]

        try:
            trial = Trial.objects.get(trial_code=trial_code)
        except Trial.DoesNotExist:
            raise CommandError(f"Trial '{trial_code}' does not exist.")

        observations = (
            Observation.objects.filter(plot__trial=trial)
            .select_related("plot__germplasm", "variable")
            .order_by("plot__plot_number", "variable__name")
        )

        headers = [
            "plot_number",
            "germplasm_name",
            "rep",
            "variable_name",
            "value_numeric",
            "value_text",
            "value_date",
            "observation_time",
            "notes",
        ]

        def write_csv(f):
            writer = csv.writer(f)
            writer.writerow(headers)
            for obs in observations:
                writer.writerow(
                    [
                        obs.plot.plot_number,
                        obs.plot.germplasm.name,
                        obs.plot.rep,
                        obs.variable.name,
                        obs.value_numeric if obs.value_numeric is not None else "",
                        obs.value_text or "",
                        obs.value_date if obs.value_date is not None else "",
                        (
                            obs.observation_time.isoformat()
                            if obs.observation_time
                            else ""
                        ),
                        obs.notes or "",
                    ]
                )

        if output_path:
            try:
                with open(output_path, "w", newline="", encoding="utf-8") as f:
                    write_csv(f)
                self.stdout.write(
                    f"Successfully exported data for trial '{trial_code}' "
                    f"to {output_path}"
                )
            except Exception as e:
                raise CommandError(f"Failed to write to file: {e}")
        else:
            # Write to stdout
            write_csv(self.stdout)
