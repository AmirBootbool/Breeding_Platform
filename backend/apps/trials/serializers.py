from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.serializers import AuditSerializerMixin

from .models import AnalysisSet, Observation, ObservationVariable, Plot, TraitPanel, Trial


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
            "block_size",
            "prep_fraction",
            "planting_date",
            "harvest_date",
            "notes",
            "status",
            "generation",
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

    def validate(self, attrs):
        design_type = attrs.get(
            "design_type",
            getattr(self.instance, "design_type", "RCBD") if self.instance else "RCBD",
        )
        block_size = attrs.get(
            "block_size",
            getattr(self.instance, "block_size", None) if self.instance else None,
        )
        prep_fraction = attrs.get(
            "prep_fraction",
            getattr(self.instance, "prep_fraction", None) if self.instance else None,
        )
        num_reps = attrs.get(
            "num_reps",
            getattr(self.instance, "num_reps", 1) if self.instance else 1,
        )
        
        if design_type == "alpha_lattice":
            if block_size is None:
                raise serializers.ValidationError(
                    {"block_size": "block_size is required for alpha-lattice trials."}
                )
            if block_size < 2:
                raise serializers.ValidationError(
                    {"block_size": "block_size must be at least 2."}
                )
        if design_type == "prep":
            if prep_fraction is None:
                raise serializers.ValidationError(
                    {"prep_fraction": "prep_fraction is required for P-Rep trials."}
                )
            if not (0.0 < prep_fraction <= 1.0):
                raise serializers.ValidationError(
                    {"prep_fraction": "prep_fraction must be between 0.0 (exclusive) and 1.0 (inclusive)."}
                )
        if design_type == "latin_square":
            if num_reps != 1:
                raise serializers.ValidationError(
                    {"num_reps": "Latin Square designs must have num_reps = 1."}
                )
        if design_type == "augmented_block":
            if block_size is None:
                raise serializers.ValidationError(
                    {"block_size": "block_size is required for augmented block trials."}
                )
            if block_size < 2:
                raise serializers.ValidationError(
                    {"block_size": "block_size must be at least 2."}
                )
        return attrs

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
            "incomplete_block",
            "is_check",
            "row",
            "column",
            "status",
        ]
        read_only_fields = ["id", "trial_code", "germplasm_name"]


class ObservationVariableSerializer(AuditSerializerMixin, serializers.ModelSerializer):
    panel_ids = serializers.SerializerMethodField()
    usage_count = serializers.SerializerMethodField()

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
            "crop",
            "category",
            "categorical_options",
            "is_required",
            "panel_ids",
            "usage_count",
            "created_at",
            "updated_at",
            "created_by_username",
            "updated_by_username",
        ]
        read_only_fields = [
            "id",
            "panel_ids",
            "usage_count",
            "created_at",
            "updated_at",
            "created_by_username",
            "updated_by_username",
        ]

    @extend_schema_field(OpenApiTypes.STR)
    def get_panel_ids(self, obj):
        return list(obj.panels.values_list("id", flat=True))

    @extend_schema_field(OpenApiTypes.INT)
    def get_usage_count(self, obj):
        return getattr(obj, "usage_count", obj.observations.count())


class TraitPanelSerializer(serializers.ModelSerializer):
    variable_ids = serializers.PrimaryKeyRelatedField(
        source="variables",
        many=True,
        queryset=ObservationVariable.objects.all(),
    )
    variable_details = ObservationVariableSerializer(
        source="variables", many=True, read_only=True
    )
    program_name = serializers.CharField(source="program.name", read_only=True)
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True
    )
    variable_count = serializers.SerializerMethodField()

    class Meta:
        model = TraitPanel
        fields = [
            "id",
            "name",
            "description",
            "category",
            "program",
            "program_name",
            "variable_ids",
            "variable_details",
            "variable_count",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "variable_details",
            "variable_count",
            "program_name",
            "created_by_username",
            "created_at",
            "updated_at",
        ]

    @extend_schema_field(OpenApiTypes.INT)
    def get_variable_count(self, obj):
        return obj.variables.count()


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


class AnalysisSetSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source="program.name", read_only=True)
    trial_details = TrialSerializer(source="trials", many=True, read_only=True)
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True
    )

    class Meta:
        model = AnalysisSet
        fields = [
            "id",
            "name",
            "program",
            "program_name",
            "trials",
            "trial_details",
            "description",
            "created_at",
            "created_by_username",
        ]
        read_only_fields = [
            "id",
            "program_name",
            "trial_details",
            "created_at",
            "created_by_username",
        ]
