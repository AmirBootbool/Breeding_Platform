from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from apps.core.serializers import AuditSerializerMixin

from .models import Observation, ObservationVariable, Plot, Trial


class TrialSerializer(AuditSerializerMixin, serializers.ModelSerializer):
    program_name = serializers.CharField(source="program.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    season_name = serializers.CharField(source="season.name", read_only=True)
    plot_count = serializers.SerializerMethodField()

    class Meta:
        model = Trial
        fields = [
            "id",
            "name",
            "trial_code",
            "brapi_study_db_id",
            "program",
            "program_name",
            "location",
            "location_name",
            "season",
            "season_name",
            "design_type",
            "num_reps",
            "planting_date",
            "harvest_date",
            "notes",
            "plot_count",
            "created_at",
            "updated_at",
            "created_by_username",
            "updated_by_username",
        ]
        read_only_fields = [
            "id",
            "program_name",
            "location_name",
            "season_name",
            "plot_count",
            "created_at",
            "updated_at",
            "created_by_username",
            "updated_by_username",
        ]

    @extend_schema_field(OpenApiTypes.INT)
    def get_plot_count(self, obj) -> int:
        return getattr(obj, "plot_count", obj.plots.count())


class PlotSerializer(serializers.ModelSerializer):
    trial_code = serializers.CharField(source="trial.trial_code", read_only=True)
    germplasm_name = serializers.CharField(source="germplasm.name", read_only=True)

    class Meta:
        model = Plot
        fields = [
            "id",
            "trial",
            "trial_code",
            "germplasm",
            "germplasm_name",
            "rep",
            "block",
            "plot_number",
            "row",
            "column",
            "status",
        ]
        read_only_fields = ["id", "trial_code", "germplasm_name"]


class ObservationVariableSerializer(AuditSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = ObservationVariable
        fields = [
            "id",
            "name",
            "variable_code",
            "description",
            "unit",
            "data_type",
            "min_value",
            "max_value",
            "is_required",
            "created_at",
            "updated_at",
            "created_by_username",
            "updated_by_username",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by_username", "updated_by_username"]


class ObservationSerializer(serializers.ModelSerializer):
    trial_code = serializers.CharField(source="plot.trial.trial_code", read_only=True)
    germplasm_name = serializers.CharField(source="plot.germplasm.name", read_only=True)
    variable_name = serializers.CharField(source="variable.name", read_only=True)

    class Meta:
        model = Observation
        fields = [
            "id",
            "plot",
            "trial_code",
            "germplasm_name",
            "variable",
            "variable_name",
            "observation_time",
            "value_text",
            "value_numeric",
            "value_date",
            "notes",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "trial_code",
            "germplasm_name",
            "variable_name",
            "created_at",
        ]
