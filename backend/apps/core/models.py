from django.conf import settings
from django.db import models


CROP_CHOICES = [
    ("wheat", "Bread Wheat (Triticum aestivum)"),
    ("durum_wheat", "Durum Wheat (Triticum durum)"),
    ("barley", "Barley (Hordeum vulgare)"),
    ("triticale", "Triticale (x Triticosecale)"),
    ("oats", "Oats (Avena sativa)"),
    ("rye", "Rye (Secale cereale)"),
    ("other", "Other Crop"),
]

CROP_SPECIES_MAP = {
    "wheat": "Triticum aestivum",
    "durum_wheat": "Triticum durum",
    "barley": "Hordeum vulgare",
    "triticale": "x Triticosecale",
    "oats": "Avena sativa",
    "rye": "Secale cereale",
}


def get_default_species_for_crop(crop_name):
    """Returns standardized botanical species name for a given crop code."""
    return CROP_SPECIES_MAP.get(crop_name, "Triticum aestivum")


class Program(models.Model):
    name = models.CharField(max_length=255, unique=True)
    crop = models.CharField(max_length=255, choices=CROP_CHOICES, default="wheat")
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
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]


class Location(models.Model):
    name = models.CharField(max_length=255, db_index=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    country = models.CharField(max_length=255, blank=True)
    region = models.CharField(max_length=255, blank=True)
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

    class Meta:
        ordering = ["name"]


class Season(models.Model):
    name = models.CharField(max_length=200)
    year = models.IntegerField(db_index=True)
    program = models.ForeignKey(
        Program, on_delete=models.CASCADE, related_name="seasons"
    )
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
        return f"{self.name} ({self.year})"

    class Meta:
        ordering = ["-year", "name"]
        unique_together = [["name", "program", "year"]]


class UserProfile(models.Model):
    ROLE_CHOICES = [
        ("admin", "Admin"),
        ("breeder", "Breeder"),
        ("technician", "Technician"),
        ("viewer", "Viewer"),
    ]
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    role = models.CharField(
        max_length=32, choices=ROLE_CHOICES, default="viewer", db_index=True
    )
    program = models.ForeignKey(
        Program,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"
