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
    year_developed = models.IntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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


class Cross(models.Model):
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
