"""Genomics app configuration."""
from django.apps import AppConfig


class GenomicsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.genomics"
    verbose_name = "Genomics & Marker-Assisted Selection"
