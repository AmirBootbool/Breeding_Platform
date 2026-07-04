import csv

from django.contrib import admin
from django.http import HttpResponse

from .models import Cross, Germplasm


@admin.register(Germplasm)
class GermplasmAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "germplasm_db_id",
        "program",
        "cross_type",
        "year_developed",
        "created_at",
    ]
    readonly_fields = ["created_at", "updated_at"]
    search_fields = ["name", "germplasm_db_id", "pedigree_string"]
    list_filter = ["program", "cross_type"]
    raw_id_fields = ["parent_female", "parent_male"]
    actions = ["export_to_csv"]
    fieldsets = [
        ("Identity", {"fields": ["name", "germplasm_db_id", "species", "program"]}),
        (
            "Pedigree",
            {
                "fields": [
                    "parent_female",
                    "parent_male",
                    "pedigree_string",
                    "cross_type",
                    "year_developed",
                ]
            },
        ),
        ("Notes", {"fields": ["notes"]}),
    ]

    @admin.action(description="Export selected germplasm to CSV")
    def export_to_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="germplasm_export.csv"'
        writer = csv.writer(response)
        writer.writerow(
            [
                "ID",
                "Name",
                "Germplasm DB ID",
                "Species",
                "Program",
                "Female Parent",
                "Male Parent",
                "Pedigree",
                "Cross Type",
                "Year Developed",
            ]
        )
        for g in queryset.select_related("program", "parent_female", "parent_male"):
            writer.writerow(
                [
                    g.id,
                    g.name,
                    g.germplasm_db_id,
                    g.species,
                    g.program.name,
                    g.parent_female.name if g.parent_female else "",
                    g.parent_male.name if g.parent_male else "",
                    g.pedigree_string,
                    g.cross_type,
                    g.year_developed,
                ]
            )
        return response


@admin.register(Cross)
class CrossAdmin(admin.ModelAdmin):
    list_display = [
        "cross_code",
        "female_parent",
        "male_parent",
        "cross_date",
        "location",
        "created_at",
        "updated_at",
    ]
    readonly_fields = ["created_at", "updated_at"]
    search_fields = ["cross_code", "female_parent__name", "male_parent__name"]
    list_filter = ["location", "cross_date"]
    raw_id_fields = ["female_parent", "male_parent"]
