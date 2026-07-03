import csv

from django.core.management.base import BaseCommand, CommandError

from apps.trials.models import ObservationVariable, Plot, Trial


class Command(BaseCommand):
    help = "Export trial layout in Field Book compatible CSV format."

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

        plots = (
            Plot.objects.filter(trial=trial)
            .select_related("germplasm")
            .order_by("plot_number")
        )
        variables = ObservationVariable.objects.all().order_by("name")

        headers = ["plot_id", "range", "plot", "entry"] + [
            var.name for var in variables
        ]

        def write_csv(f):
            writer = csv.writer(f)
            writer.writerow(headers)
            for plot in plots:
                # Field Book format maps plot_id & plot to plot_number,
                # range to rep, entry to name
                row = [
                    plot.plot_number,
                    plot.rep,
                    plot.plot_number,
                    plot.germplasm.name,
                ]
                # Empty columns for variables/traits
                row += [""] * len(variables)
                writer.writerow(row)

        if output_path:
            try:
                with open(output_path, "w", newline="", encoding="utf-8") as f:
                    write_csv(f)
                self.stdout.write(
                    f"Successfully exported Field Book layout for "
                    f"trial '{trial_code}' to {output_path}"
                )
            except Exception as e:
                raise CommandError(f"Failed to write to file: {e}")
        else:
            write_csv(self.stdout)
