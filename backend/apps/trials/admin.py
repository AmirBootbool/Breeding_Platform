import csv

from django.contrib import admin
from django.http import HttpResponse

from .models import Observation, ObservationVariable, Plot, Trial


class PlotInline(admin.TabularInline):
    model = Plot
    extra = 0
    raw_id_fields = ["germplasm"]


class ObservationInline(admin.TabularInline):
    model = Observation
    extra = 0
    raw_id_fields = ["variable"]


@admin.register(Trial)
class TrialAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "trial_code",
        "program",
        "location",
        "season",
        "design_type",
        "num_reps",
        "created_at",
        "updated_at",
    ]
    readonly_fields = ["created_at", "updated_at"]
    search_fields = ["name", "trial_code"]
    list_filter = ["design_type", "program", "location", "season"]
    raw_id_fields = ["program", "location", "season"]
    inlines = [PlotInline]
    actions = ["export_to_csv"]

    @admin.action(description="Export selected trials to CSV")
    def export_to_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="trials_export.csv"'
        writer = csv.writer(response)
        writer.writerow(
            [
                "ID",
                "Name",
                "Trial Code",
                "Program",
                "Location",
                "Season",
                "Design Type",
                "Num Reps",
            ]
        )
        for trial in queryset.select_related("program", "location", "season"):
            writer.writerow(
                [
                    trial.id,
                    trial.name,
                    trial.trial_code,
                    trial.program.name,
                    trial.location.name,
                    trial.season.name if trial.season else "",
                    trial.design_type,
                    trial.num_reps,
                ]
            )
        return response


@admin.register(Plot)
class PlotAdmin(admin.ModelAdmin):
    list_display = ["trial", "plot_number", "germplasm", "rep", "status"]
    list_filter = ["trial", "rep", "status"]
    search_fields = ["germplasm__name"]
    raw_id_fields = ["trial", "germplasm"]
    inlines = [ObservationInline]
    actions = ["make_planted", "make_harvested", "make_discarded"]

    @admin.action(description="Mark selected plots as Planted")
    def make_planted(self, request, queryset):
        updated = queryset.update(status="planted")
        self.message_user(request, f"Successfully marked {updated} plots as Planted.")

    @admin.action(description="Mark selected plots as Harvested")
    def make_harvested(self, request, queryset):
        updated = queryset.update(status="harvested")
        self.message_user(request, f"Successfully marked {updated} plots as Harvested.")

    @admin.action(description="Mark selected plots as Discarded")
    def make_discarded(self, request, queryset):
        updated = queryset.update(status="discarded")
        self.message_user(request, f"Successfully marked {updated} plots as Discarded.")


@admin.register(ObservationVariable)
class ObservationVariableAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "variable_code",
        "data_type",
        "unit",
        "is_required",
        "created_at",
    ]
    readonly_fields = ["created_at"]
    search_fields = ["name", "variable_code"]
    list_filter = ["data_type", "is_required"]


@admin.register(Observation)
class ObservationAdmin(admin.ModelAdmin):
    list_display = [
        "plot",
        "variable",
        "observation_time",
        "value_numeric",
        "value_text",
    ]
    readonly_fields = ["created_at"]
    list_filter = ["variable", "observation_time"]
    search_fields = [
        "plot__trial__trial_code",
        "plot__germplasm__name",
        "variable__name",
    ]
    raw_id_fields = ["plot", "variable"]
