from django.conf import settings
from django.db import models

from apps.core.models import Location, Program, Season
from apps.germplasm.models import Germplasm


class Trial(models.Model):
    DESIGN_CHOICES = [
        ("RCBD", "RCBD"),
        ("alpha_lattice", "Alpha-lattice"),
        ("augmented", "Augmented"),
        ("unreplicated", "Unreplicated"),
        ("other", "Other"),
    ]

    name = models.CharField(max_length=255, db_index=True)
    trial_code = models.CharField(max_length=255, unique=True)
    brapi_study_db_id = models.CharField(max_length=255, blank=True)
    program = models.ForeignKey(Program, on_delete=models.CASCADE)
    location = models.ForeignKey(Location, on_delete=models.PROTECT)
    season = models.ForeignKey(Season, on_delete=models.PROTECT)
    design_type = models.CharField(
        max_length=32, choices=DESIGN_CHOICES, default="RCBD"
    )
    num_reps = models.IntegerField(default=1)
    block_size = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Incomplete block size for alpha-lattice designs.",
    )
    planting_date = models.DateField(null=True, blank=True)
    harvest_date = models.DateField(null=True, blank=True)
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

    def __str__(self):
        return f"{self.trial_code} - {self.name}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.num_reps < 1:
            raise ValidationError(
                {"num_reps": "Trial must have at least one replication."}
            )
        if self.design_type == "alpha_lattice":
            if self.block_size is None:
                raise ValidationError(
                    {"block_size": "block_size is required for alpha-lattice trials."}
                )
            if self.block_size < 2:
                raise ValidationError(
                    {"block_size": "block_size must be at least 2."}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["trial_code"]

    def create_plots(self, entries, seed: int | None = None):
        from .utils import create_plots_for_trial

        return create_plots_for_trial(self, entries, seed=seed)


class Plot(models.Model):
    STATUS_CHOICES = [
        ("planned", "Planned"),
        ("planted", "Planted"),
        ("harvested", "Harvested"),
        ("discarded", "Discarded"),
    ]

    trial = models.ForeignKey(Trial, on_delete=models.CASCADE, related_name="plots")
    germplasm = models.ForeignKey(Germplasm, on_delete=models.PROTECT)
    rep = models.IntegerField()
    block = models.IntegerField(null=True, blank=True)
    plot_number = models.IntegerField()
    row = models.IntegerField(null=True, blank=True)
    column = models.IntegerField(null=True, blank=True)
    incomplete_block = models.PositiveIntegerField(null=True, blank=True)
    is_check = models.BooleanField(default=False)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="planned")

    class Meta:
        unique_together = (("trial", "plot_number"),)

    def __str__(self):
        return (
            f"{self.trial.trial_code}: Plot {self.plot_number} ({self.germplasm.name})"
        )


class ObservationVariable(models.Model):
    DATA_TYPE_CHOICES = [
        ("numeric", "Numeric"),
        ("integer", "Integer"),
        ("categorical", "Categorical"),
        ("text", "Text"),
        ("date", "Date"),
    ]

    name = models.CharField(max_length=255, db_index=True)
    variable_code = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    unit = models.CharField(max_length=64, blank=True)
    data_type = models.CharField(
        max_length=16, choices=DATA_TYPE_CHOICES, default="numeric"
    )
    min_value = models.FloatField(null=True, blank=True)
    max_value = models.FloatField(null=True, blank=True)
    is_required = models.BooleanField(default=False)
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

    def __str__(self):
        return self.name

    def clean(self):
        from django.core.exceptions import ValidationError

        if (
            self.min_value is not None
            and self.max_value is not None
            and self.min_value > self.max_value
        ):
            raise ValidationError(
                {
                    "max_value": (
                        "Maximum value must be greater than or equal to "
                        "minimum value."
                    )
                }
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "observation variables"


class Observation(models.Model):
    plot = models.ForeignKey(
        Plot, on_delete=models.CASCADE, related_name="observations"
    )
    variable = models.ForeignKey(
        ObservationVariable, on_delete=models.PROTECT, related_name="observations"
    )
    observation_time = models.DateTimeField(null=True, blank=True, db_index=True)
    value_text = models.TextField(blank=True)
    value_numeric = models.FloatField(null=True, blank=True)
    value_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["plot", "variable"]

    def __str__(self):
        return f"{self.plot} / {self.variable.name}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.variable.data_type in ("numeric", "integer"):
            if self.value_numeric is None:
                raise ValidationError(
                    {"value_numeric": "Numeric observation requires a numeric value."}
                )
            if (
                self.variable.data_type == "integer"
                and int(self.value_numeric) != self.value_numeric
            ):
                raise ValidationError(
                    {"value_numeric": "Integer observations must be whole numbers."}
                )
            if (
                self.variable.min_value is not None
                and self.value_numeric < self.variable.min_value
            ):
                raise ValidationError(
                    {
                        "value_numeric": (
                            "Observation is below the configured minimum value."
                        )
                    }
                )
            if (
                self.variable.max_value is not None
                and self.value_numeric > self.variable.max_value
            ):
                raise ValidationError(
                    {
                        "value_numeric": (
                            "Observation exceeds the configured maximum value."
                        )
                    }
                )

        if self.variable.data_type == "text" and not self.value_text:
            raise ValidationError({"value_text": "Text observation requires a value."})

        if self.variable.data_type == "date" and self.value_date is None:
            raise ValidationError(
                {"value_date": "Date observation requires a date value."}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
