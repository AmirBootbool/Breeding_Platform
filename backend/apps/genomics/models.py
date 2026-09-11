from django.conf import settings
from django.db import models

from apps.core.models import Program
from apps.germplasm.models import Germplasm
from apps.trials.models import AnalysisSet, ObservationVariable, Trial


class GenotypeDataset(models.Model):
    """Stores a curated marker/genotype dataset (SNP array, GBS, WGS)."""

    FORMAT_CHOICES = [
        ("matrix", "Dosage Matrix (.csv/.tsv)"),
        ("vcf", "Variant Call Format (.vcf)"),
        ("hapmap", "HapMap (.hmp.txt)"),
    ]

    IMPUTATION_CHOICES = [
        ("mean", "Mean Allele Dosage"),
        ("mode", "Mode Genotype"),
        ("none", "None (No Imputation)"),
    ]

    name = models.CharField(max_length=255, db_index=True)
    program = models.ForeignKey(
        Program, on_delete=models.CASCADE, related_name="genotype_datasets"
    )
    species = models.CharField(max_length=100, default="Triticum aestivum")
    file_format = models.CharField(
        max_length=32, choices=FORMAT_CHOICES, default="matrix"
    )
    marker_count = models.PositiveIntegerField(default=0)
    sample_count = models.PositiveIntegerField(default=0)
    marker_names = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered list of marker identifier strings",
    )
    sample_names = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered list of sample/germplasm identifier strings",
    )
    imputation_method = models.CharField(
        max_length=32, choices=IMPUTATION_CHOICES, default="mean"
    )
    maf_threshold = models.FloatField(
        default=0.05,
        help_text="Minor Allele Frequency filter threshold applied during import",
    )
    matrix_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Encoded dosage dictionary: sample_id -> list of numeric dosages (0.0 to 2.0)",
    )
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.sample_count} samples, {self.marker_count} SNPs)"


class GenotypeSample(models.Model):
    """Links a sample within a GenotypeDataset to a Germplasm accession."""

    dataset = models.ForeignKey(
        GenotypeDataset, on_delete=models.CASCADE, related_name="samples"
    )
    sample_id = models.CharField(max_length=200, db_index=True)
    germplasm = models.ForeignKey(
        Germplasm,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="genotype_samples",
    )
    call_rate = models.FloatField(default=1.0)
    heterozygosity = models.FloatField(default=0.0)

    class Meta:
        unique_together = [("dataset", "sample_id")]
        ordering = ["sample_id"]

    def __str__(self):
        germ_str = self.germplasm.name if self.germplasm else "Unlinked"
        return f"{self.sample_id} -> {germ_str}"


class GenomicPrediction(models.Model):
    """A Genomic Prediction training session (GBLUP / rrBLUP) for a quantitative trait."""

    MODEL_TYPE_CHOICES = [
        ("gblup", "GBLUP (VanRaden GRM)"),
        ("rrblup", "Ridge Regression BLUP (rrBLUP)"),
    ]

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    name = models.CharField(max_length=255, db_index=True)
    program = models.ForeignKey(
        Program, on_delete=models.CASCADE, related_name="genomic_predictions"
    )
    trait = models.ForeignKey(
        ObservationVariable,
        on_delete=models.CASCADE,
        related_name="genomic_predictions",
    )
    genotype_dataset = models.ForeignKey(
        GenotypeDataset,
        on_delete=models.CASCADE,
        related_name="predictions",
    )
    training_trial = models.ForeignKey(
        Trial,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="genomic_predictions",
    )
    training_analysis_set = models.ForeignKey(
        AnalysisSet,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="genomic_predictions",
    )
    model_type = models.CharField(
        max_length=32, choices=MODEL_TYPE_CHOICES, default="gblup"
    )
    n_training = models.PositiveIntegerField(
        default=0, help_text="Number of observed training lines"
    )
    n_candidates = models.PositiveIntegerField(
        default=0, help_text="Number of candidate lines predicted without field trial"
    )
    cv_accuracy = models.FloatField(
        null=True,
        blank=True,
        help_text="5-fold cross validation Pearson correlation r(GEBV, y)",
    )
    cv_mse = models.FloatField(
        null=True,
        blank=True,
        help_text="Mean squared error in cross-validation",
    )
    genomic_heritability = models.FloatField(
        null=True,
        blank=True,
        help_text="SNP broad-sense heritability h²_SNP",
    )
    variance_genomic = models.FloatField(null=True, blank=True)
    variance_residual = models.FloatField(null=True, blank=True)
    status = models.CharField(
        max_length=32, choices=STATUS_CHOICES, default="completed"
    )
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} [{self.trait.name}] (r={self.cv_accuracy or 0:.2f})"


class GenomicBreedingValue(models.Model):
    """Stores the Genomic Estimated Breeding Value (GEBV) for a single germplasm line."""

    prediction = models.ForeignKey(
        GenomicPrediction, on_delete=models.CASCADE, related_name="gebvs"
    )
    germplasm = models.ForeignKey(
        Germplasm, on_delete=models.CASCADE, related_name="gebv_records"
    )
    sample_id = models.CharField(max_length=200)
    gebv = models.FloatField(help_text="Genomic Estimated Breeding Value")
    reliability = models.FloatField(
        default=0.0, help_text="Reliability index r² (0.0 to 1.0)"
    )
    standard_error = models.FloatField(null=True, blank=True)
    rank = models.PositiveIntegerField(default=1)
    is_training = models.BooleanField(
        default=False,
        help_text="True if line had observed phenotype in the training trial",
    )
    observed_phenotype = models.FloatField(
        null=True, blank=True, help_text="Phenotypic BLUE/mean if in training set"
    )

    class Meta:
        unique_together = [("prediction", "germplasm")]
        ordering = ["rank"]

    def __str__(self):
        status = "Training" if self.is_training else "Candidate"
        return f"#{self.rank} {self.germplasm.name}: GEBV={self.gebv:.3f} ({status})"


class DiagnosticMarker(models.Model):
    """A known diagnostic or functional marker for wheat marker-assisted selection (MAS)."""

    CATEGORY_CHOICES = [
        ("disease", "Disease Resistance"),
        ("agronomic", "Agronomic / Yield"),
        ("quality", "Grain Quality"),
        ("phenology", "Phenology / Adaptation"),
        ("abiotic", "Abiotic Stress"),
    ]

    ASSAY_CHOICES = [
        ("KASP", "KASP Assay"),
        ("TaqMan", "TaqMan Probe"),
        ("PCR_Gel", "Gel / STS / CAPS PCR"),
        ("SNP_Chip", "SNP Array Probe"),
    ]

    name = models.CharField(max_length=150, unique=True, db_index=True)
    gene_symbol = models.CharField(max_length=100, blank=True)
    chromosome = models.CharField(
        max_length=20, blank=True, help_text="Wheat chromosome (e.g. 7D, 3B, 4A, 2D)"
    )
    target_trait = models.CharField(
        max_length=150, help_text="Target trait (e.g. Leaf Rust Resistance, Semi-dwarf)"
    )
    trait_category = models.CharField(
        max_length=50, choices=CATEGORY_CHOICES, default="disease", db_index=True
    )
    favorable_allele = models.CharField(
        max_length=50, help_text="Allele indicating favorable/resistant state"
    )
    unfavorable_allele = models.CharField(
        max_length=50, blank=True, help_text="Allele indicating susceptible/wildtype state"
    )
    assay_type = models.CharField(
        max_length=50, choices=ASSAY_CHOICES, default="KASP"
    )
    effect_description = models.TextField(
        blank=True, help_text="Phenotypic effect explanation"
    )
    program = models.ForeignKey(
        Program,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="diagnostic_markers",
        help_text="If null, marker is globally available across programs",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["trait_category", "name"]

    def __str__(self):
        return f"{self.name} ({self.gene_symbol or self.chromosome}): {self.target_trait}"


class MarkerScore(models.Model):
    """An individual allele call for a germplasm accession at a diagnostic marker locus."""

    STATUS_CHOICES = [
        ("favorable", "Favorable (Resistant / Desired)"),
        ("heterozygous", "Heterozygous (Carrier)"),
        ("unfavorable", "Unfavorable (Susceptible / Wildtype)"),
        ("missing", "Missing / No Call"),
    ]

    marker = models.ForeignKey(
        DiagnosticMarker, on_delete=models.CASCADE, related_name="scores"
    )
    germplasm = models.ForeignKey(
        Germplasm, on_delete=models.CASCADE, related_name="marker_scores"
    )
    call_status = models.CharField(
        max_length=30, choices=STATUS_CHOICES, default="missing", db_index=True
    )
    raw_genotype = models.CharField(
        max_length=50,
        blank=True,
        help_text="Raw allele string e.g. A:A, T:T, FAM, HEX",
    )
    notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("marker", "germplasm")]
        ordering = ["marker", "germplasm"]

    def __str__(self):
        return f"{self.germplasm.name} @ {self.marker.name}: {self.get_call_status_display()}"
