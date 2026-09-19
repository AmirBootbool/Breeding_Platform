from rest_framework import serializers

from apps.core.serializers import AuditSerializerMixin

from .models import Cross, Germplasm, SelectionShortlist, VarietyMaintenanceCycle


class GermplasmSerializer(AuditSerializerMixin, serializers.ModelSerializer):
    program_name = serializers.CharField(source="program.name", read_only=True)
    parent_female_name = serializers.CharField(
        source="parent_female.name", read_only=True
    )
    parent_male_name = serializers.CharField(source="parent_male.name", read_only=True)

    class Meta:
        model = Germplasm
        fields = [
            "id",
            "name",
            "germplasm_db_id",
            "external_accession_id",
            "species",
            "program",
            "program_name",
            "parent_female",
            "parent_female_name",
            "parent_male",
            "parent_male_name",
            "pedigree_string",
            "cross_type",
            "generation",
            "year_developed",
            "tags",
            "is_check",
            "release_status",
            "notes",
            "is_archived",
            "created_at",
            "updated_at",
            "created_by_username",
            "updated_by_username",
        ]
        read_only_fields = [
            "id",
            "germplasm_db_id",
            "program_name",
            "parent_female_name",
            "parent_male_name",
            "created_at",
            "updated_at",
            "created_by_username",
            "updated_by_username",
        ]


class CrossSerializer(serializers.ModelSerializer):
    female_parent_name = serializers.CharField(
        source="female_parent.name", read_only=True
    )
    male_parent_name = serializers.CharField(source="male_parent.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    progeny_name = serializers.CharField(
        source="progeny.name", read_only=True, default=None
    )

    class Meta:
        model = Cross
        fields = [
            "id",
            "cross_code",
            "female_parent",
            "female_parent_name",
            "male_parent",
            "male_parent_name",
            "crossing_block",
            "status",
            "is_reciprocal",
            "seed_count",
            "progeny",
            "progeny_name",
            "map_position",
            "cross_date",
            "location",
            "location_name",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "female_parent_name",
            "male_parent_name",
            "location_name",
            "progeny_name",
            "created_at",
            "updated_at",
        ]


class SelectionShortlistSerializer(serializers.ModelSerializer):
    germplasm_name = serializers.CharField(source="germplasm.name", read_only=True)
    season_name = serializers.CharField(source="season.name", read_only=True, default=None)

    class Meta:
        model = SelectionShortlist
        fields = [
            "id", "germplasm", "germplasm_name", "program", "season", "season_name",
            "source", "note", "created_by", "created_at",
        ]
        read_only_fields = ["id", "program", "created_by", "created_at"]


class VarietyMaintenanceCycleSerializer(serializers.ModelSerializer):
    variety_name = serializers.CharField(source="variety.name", read_only=True)
    season_name = serializers.CharField(source="season.name", read_only=True, default=None)

    class Meta:
        model = VarietyMaintenanceCycle
        fields = [
            "id", "variety", "variety_name", "method", "cycle_number",
            "season", "season_name", "off_types_removed", "notes",
            "created_by", "created_at",
        ]
        read_only_fields = ["id", "created_by", "created_at"]


