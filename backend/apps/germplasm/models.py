from django.conf import settings
from django.db import models

from apps.core.models import Location, Program


class Germplasm(models.Model):
    CROSS_TYPE_CHOICES = [
        ("biparental", "Biparental cross"),
        ("self", "Self-pollinated"),
        ("backcross", "Backcross"),
        ("doubled_haploid", "Doubled haploid"),
        ("other", "Other"),
        ("unknown", "Unknown"),
    ]

    name = models.CharField(max_length=300, db_index=True)
    germplasm_db_id = models.CharField(max_length=100, unique=True, blank=True)
    species = models.CharField(max_length=100, default="Triticum aestivum")
    program = models.ForeignKey(
        Program, on_delete=models.CASCADE, related_name="germplasm"
    )
    parent_female = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="female_progeny",
        help_text="Female (seed) parent",
    )
    parent_male = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="male_progeny",
        help_text="Male (pollen) parent",
    )
    pedigree_string = models.CharField(
        max_length=500,
        blank=True,
        help_text='Free-text pedigree notation, e.g. "KAUZ/PASTOR".',
    )
    cross_type = models.CharField(
        max_length=20, choices=CROSS_TYPE_CHOICES, default="unknown"
    )
    generation = models.IntegerField(
        default=0,
        help_text="Generation index (0=F0, 1=F1, ..., 8=F8+)",
    )
    year_developed = models.IntegerField(null=True, blank=True)
    tags = models.JSONField(
        default=list,
        blank=True,
        help_text="Free-form tags, e.g. ['drought-tolerant', 'release-candidate']",
    )
    is_check = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True for permanent check/reference lines used across trials.",
    )
    notes = models.TextField(blank=True)
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    def save(self, *args, **kwargs):
        from django.db import connection

        if not self.germplasm_db_id:
            if connection.vendor == "postgresql":
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT nextval(pg_get_serial_sequence("
                        "'germplasm_germplasm', 'id'))"
                    )
                    next_id = cursor.fetchone()[0]
                self.id = next_id
                self.germplasm_db_id = f"G{next_id:06d}"
                super().save(*args, **kwargs)
            else:
                super().save(*args, **kwargs)
                self.germplasm_db_id = f"G{self.pk:06d}"
                Germplasm.objects.filter(pk=self.pk).update(
                    germplasm_db_id=self.germplasm_db_id
                )
        else:
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.program.name})"

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "germplasm"


class CrossingBlock(models.Model):
    """A named session/plan grouping multiple planned crosses."""

    MAP_PATTERN_CHOICES = [
        ("male_first", "Common male then females"),
        ("female_first", "Common female then males"),
        ("alternating", "Alternating male/female"),
    ]

    name = models.CharField(max_length=300)
    program = models.ForeignKey(
        Program, on_delete=models.CASCADE, related_name="crossing_blocks"
    )
    location = models.ForeignKey(
        Location,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    season = models.ForeignKey(
        "core.Season",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crossing_blocks",
    )
    map_pattern = models.CharField(
        max_length=30,
        choices=MAP_PATTERN_CHOICES,
        default="male_first",
    )
    include_reciprocals = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    def __str__(self):
        return f"{self.name} ({self.program.name})"

    class Meta:
        ordering = ["-created_at"]


class Cross(models.Model):
    CROSS_STATUS_CHOICES = [
        ("planned", "Planned"),
        ("pollinated", "Pollinated"),
        ("harvested", "Harvested"),
        ("failed", "Failed"),
    ]

    cross_code = models.CharField(max_length=100, unique=True)
    female_parent = models.ForeignKey(
        Germplasm,
        on_delete=models.PROTECT,
        related_name="crosses_as_female",
    )
    male_parent = models.ForeignKey(
        Germplasm,
        on_delete=models.PROTECT,
        related_name="crosses_as_male",
    )
    crossing_block = models.ForeignKey(
        CrossingBlock,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="crosses",
    )
    status = models.CharField(
        max_length=20,
        choices=CROSS_STATUS_CHOICES,
        default="planned",
    )
    progeny = models.ForeignKey(
        Germplasm,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_cross",
        help_text="Auto-created progeny germplasm entry",
    )
    is_reciprocal = models.BooleanField(
        default=False,
        help_text="Whether this is a reciprocal of another cross",
    )
    map_position = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Position in the crossing block sowing map",
    )
    cross_date = models.DateField(db_index=True)
    location = models.ForeignKey(
        Location,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.cross_code}: {self.female_parent.name} x {self.male_parent.name}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if (
            self.female_parent_id
            and self.male_parent_id
            and self.female_parent_id == self.male_parent_id
        ):
            raise ValidationError(
                {
                    "male_parent": (
                        "Female and male parent must be different germplasm records."
                    )
                }
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["-cross_date"]
        verbose_name_plural = "crosses"


class SeedLot(models.Model):
    STATUS_CHOICES = [
        ("available", "Available"),
        ("depleted", "Depleted"),
        ("reserved", "Reserved"),
        ("quarantine", "Quarantine"),
    ]

    germplasm = models.ForeignKey(
        Germplasm,
        on_delete=models.PROTECT,
        related_name="seed_lots",
    )
    program = models.ForeignKey(
        Program,
        on_delete=models.CASCADE,
        related_name="seed_lots",
    )
    lot_code = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        help_text="Unique seed packet identifier, e.g. LOT-2026-0042",
    )
    quantity_grams = models.FloatField(default=0.0)
    reserved_grams = models.FloatField(
        default=0.0,
        help_text="Quantity reserved for pending trials or distributions",
    )
    seed_count = models.PositiveIntegerField(null=True, blank=True)
    storage_location = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Physical location: e.g. Cold Room 1, Rack C, Box 12",
    )
    harvest_date = models.DateField(null=True, blank=True)
    source_plot = models.ForeignKey(
        "trials.Plot",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="harvested_seed_lots",
    )
    germination_rate = models.FloatField(
        null=True,
        blank=True,
        help_text="Germination rate percentage (0.0 to 100.0)",
    )
    germination_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of last germination test",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="available",
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    def save(self, *args, **kwargs):
        if not self.lot_code:
            from django.db import connection
            if connection.vendor == "postgresql":
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT nextval(pg_get_serial_sequence("
                        "'germplasm_seedlot', 'id'))"
                    )
                    next_id = cursor.fetchone()[0]
                self.id = next_id
                self.lot_code = f"LOT-{next_id:06d}"
                super().save(*args, **kwargs)
            else:
                super().save(*args, **kwargs)
                self.lot_code = f"LOT-{self.pk:06d}"
                SeedLot.objects.filter(pk=self.pk).update(lot_code=self.lot_code)
        else:
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.lot_code}: {self.germplasm.name} ({self.quantity_grams}g @ {self.storage_location})"

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Seed Lot"
        verbose_name_plural = "Seed Lots"


class SeedTransaction(models.Model):
    TRANSACTION_TYPE_CHOICES = [
        ("initial_deposit", "Initial Deposit"),
        ("harvest_deposit", "Harvest Deposit"),
        ("planting_deduction", "Planting Deduction"),
        ("distribution", "Distribution"),
        ("adjustment", "Inventory Adjustment"),
    ]

    seed_lot = models.ForeignKey(
        SeedLot,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    transaction_type = models.CharField(
        max_length=30,
        choices=TRANSACTION_TYPE_CHOICES,
    )
    quantity_grams = models.FloatField(
        help_text="Delta in grams (positive for deposit, negative for deduction)",
    )
    transaction_date = models.DateField(auto_now_add=True)
    destination_trial = models.ForeignKey(
        "trials.Trial",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="seed_transactions",
    )
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.transaction_type} ({self.quantity_grams}g) on {self.seed_lot.lot_code}"

    class Meta:
        ordering = ["-created_at"]
