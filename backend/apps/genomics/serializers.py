from rest_framework import serializers

from apps.core.models import Program
from apps.germplasm.models import Germplasm
from apps.trials.models import AnalysisSet, ObservationVariable, Trial

from .models import (
    DiagnosticMarker,
    GenomicBreedingValue,
    GenomicPrediction,
    GenotypeDataset,
    GenotypeSample,
    MarkerScore,
)


class GenotypeSampleSerializer(serializers.ModelSerializer):
    germplasm_name = serializers.ReadOnlyField(source="germplasm.name")
    germplasm_db_id = serializers.ReadOnlyField(source="germplasm.germplasm_db_id")

    class Meta:
        model = GenotypeSample
        fields = [
            "id",
            "dataset",
            "sample_id",
            "germplasm",
            "germplasm_name",
            "germplasm_db_id",
            "call_rate",
            "heterozygosity",
        ]


class GenotypeDatasetSerializer(serializers.ModelSerializer):
    program_name = serializers.ReadOnlyField(source="program.name")
    created_by_username = serializers.ReadOnlyField(source="created_by.username")

    class Meta:
        model = GenotypeDataset
        fields = [
            "id",
            "name",
            "program",
            "program_name",
            "species",
            "file_format",
            "marker_count",
            "sample_count",
            "imputation_method",
            "maf_threshold",
            "description",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_username",
        ]
        read_only_fields = [
            "marker_count",
            "sample_count",
            "created_at",
            "updated_at",
            "created_by",
        ]


class GenomicBreedingValueSerializer(serializers.ModelSerializer):
    germplasm_name = serializers.ReadOnlyField(source="germplasm.name")
    germplasm_db_id = serializers.ReadOnlyField(source="germplasm.germplasm_db_id")
    predicted_performance = serializers.SerializerMethodField()

    class Meta:
        model = GenomicBreedingValue
        fields = [
            "id",
            "prediction",
            "germplasm",
            "germplasm_name",
            "germplasm_db_id",
            "sample_id",
            "gebv",
            "predicted_performance",
            "reliability",
            "standard_error",
            "rank",
            "is_training",
            "observed_phenotype",
        ]

    def get_predicted_performance(self, obj):
        # Return estimated total performance if prediction mean is stored or calculated
        return round(obj.gebv, 4)


class GenomicPredictionSerializer(serializers.ModelSerializer):
    program_name = serializers.ReadOnlyField(source="program.name")
    trait_name = serializers.ReadOnlyField(source="trait.name")
    trait_unit = serializers.ReadOnlyField(source="trait.unit")
    genotype_dataset_name = serializers.ReadOnlyField(source="genotype_dataset.name")
    training_trial_name = serializers.ReadOnlyField(source="training_trial.trial_code")
    training_analysis_set_name = serializers.ReadOnlyField(
        source="training_analysis_set.name"
    )
    created_by_username = serializers.ReadOnlyField(source="created_by.username")

    class Meta:
        model = GenomicPrediction
        fields = [
            "id",
            "name",
            "program",
            "program_name",
            "trait",
            "trait_name",
            "trait_unit",
            "genotype_dataset",
            "genotype_dataset_name",
            "training_trial",
            "training_trial_name",
            "training_analysis_set",
            "training_analysis_set_name",
            "model_type",
            "n_training",
            "n_candidates",
            "cv_accuracy",
            "cv_mse",
            "genomic_heritability",
            "variance_genomic",
            "variance_residual",
            "status",
            "error_message",
            "created_at",
            "created_by",
            "created_by_username",
        ]
        read_only_fields = [
            "n_training",
            "n_candidates",
            "cv_accuracy",
            "cv_mse",
            "genomic_heritability",
            "variance_genomic",
            "variance_residual",
            "status",
            "error_message",
            "created_at",
            "created_by",
        ]


class DiagnosticMarkerSerializer(serializers.ModelSerializer):
    program_name = serializers.ReadOnlyField(source="program.name")

    class Meta:
        model = DiagnosticMarker
        fields = [
            "id",
            "name",
            "gene_symbol",
            "chromosome",
            "target_trait",
            "trait_category",
            "favorable_allele",
            "unfavorable_allele",
            "assay_type",
            "effect_description",
            "program",
            "program_name",
            "created_at",
        ]


class MarkerScoreSerializer(serializers.ModelSerializer):
    marker_name = serializers.ReadOnlyField(source="marker.name")
    gene_symbol = serializers.ReadOnlyField(source="marker.gene_symbol")
    germplasm_name = serializers.ReadOnlyField(source="germplasm.name")
    germplasm_db_id = serializers.ReadOnlyField(source="germplasm.germplasm_db_id")

    class Meta:
        model = MarkerScore
        fields = [
            "id",
            "marker",
            "marker_name",
            "gene_symbol",
            "germplasm",
            "germplasm_name",
            "germplasm_db_id",
            "call_status",
            "raw_genotype",
            "notes",
            "updated_at",
        ]
