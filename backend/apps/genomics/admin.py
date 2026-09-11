from django.contrib import admin

from .models import (
    DiagnosticMarker,
    GenomicBreedingValue,
    GenomicPrediction,
    GenotypeDataset,
    GenotypeSample,
    MarkerScore,
)


@admin.register(GenotypeDataset)
class GenotypeDatasetAdmin(admin.ModelAdmin):
    list_display = ["name", "program", "file_format", "marker_count", "sample_count", "created_at"]
    list_filter = ["program", "file_format", "imputation_method"]
    search_fields = ["name", "description"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(GenotypeSample)
class GenotypeSampleAdmin(admin.ModelAdmin):
    list_display = ["sample_id", "dataset", "germplasm", "call_rate", "heterozygosity"]
    list_filter = ["dataset"]
    search_fields = ["sample_id", "germplasm__name"]


@admin.register(GenomicPrediction)
class GenomicPredictionAdmin(admin.ModelAdmin):
    list_display = ["name", "program", "trait", "model_type", "cv_accuracy", "genomic_heritability", "created_at"]
    list_filter = ["program", "model_type", "status"]
    search_fields = ["name", "trait__name"]
    readonly_fields = ["created_at"]


@admin.register(GenomicBreedingValue)
class GenomicBreedingValueAdmin(admin.ModelAdmin):
    list_display = ["rank", "prediction", "germplasm", "sample_id", "gebv", "reliability", "is_training"]
    list_filter = ["prediction", "is_training"]
    search_fields = ["germplasm__name", "sample_id"]


@admin.register(DiagnosticMarker)
class DiagnosticMarkerAdmin(admin.ModelAdmin):
    list_display = ["name", "gene_symbol", "chromosome", "target_trait", "trait_category", "assay_type"]
    list_filter = ["trait_category", "assay_type", "chromosome"]
    search_fields = ["name", "gene_symbol", "target_trait"]


@admin.register(MarkerScore)
class MarkerScoreAdmin(admin.ModelAdmin):
    list_display = ["marker", "germplasm", "call_status", "raw_genotype", "updated_at"]
    list_filter = ["call_status", "marker"]
    search_fields = ["marker__name", "germplasm__name", "raw_genotype"]
