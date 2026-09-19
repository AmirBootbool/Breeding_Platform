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


class UserPreference(models.Model):
    """Free-form, versioned bag of per-user UI preferences.

    Deliberately a single JSONField rather than one column per
    preference: the frontend owns the shape of this blob (theme,
    table density, saved views, dashboard widget layout, pinned
    records, column config per table) and adds new keys without a
    migration. The backend only stores and returns it.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="preferences"
    )
    data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Preferences({self.user.username})"


class ShareLink(models.Model):
    TARGET_TYPE_CHOICES = [
        ("season_summary", "Season Summary"),
    ]
    token = models.CharField(max_length=64, unique=True, db_index=True)
    target_type = models.CharField(max_length=32, choices=TARGET_TYPE_CHOICES)
    target_id = models.PositiveIntegerField()
    expires_at = models.DateTimeField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def is_valid(self):
        from django.utils import timezone
        return timezone.now() < self.expires_at


class WeatherObservation(models.Model):
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="weather_observations")
    date = models.DateField()
    temp_min_c = models.FloatField(null=True, blank=True)
    temp_max_c = models.FloatField(null=True, blank=True)
    precipitation_mm = models.FloatField(null=True, blank=True)
    source = models.CharField(max_length=100, blank=True, default="manual import")

    class Meta:
        unique_together = ("location", "date")
        ordering = ["-date"]


