from django.db import models
from apps.core.models import Program, Location, Season
from apps.germplasm.models import Germplasm


class Trial(models.Model):
    DESIGN_CHOICES = [
        ('RCBD', 'RCBD'),
        ('alpha_lattice', 'Alpha-lattice'),
        ('augmented', 'Augmented'),
        ('unreplicated', 'Unreplicated'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=255)
    trial_code = models.CharField(max_length=255, unique=True)
    brapi_study_db_id = models.CharField(max_length=255, blank=True)
    program = models.ForeignKey(Program, on_delete=models.CASCADE)
    location = models.ForeignKey(Location, on_delete=models.CASCADE)
    season = models.ForeignKey(Season, on_delete=models.CASCADE)
    design_type = models.CharField(max_length=32, choices=DESIGN_CHOICES, default='RCBD')
    num_reps = models.IntegerField(default=1)
    planting_date = models.DateField(null=True, blank=True)
    harvest_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return self.name


class Plot(models.Model):
    STATUS_CHOICES = [
        ('planned', 'Planned'),
        ('planted', 'Planted'),
        ('harvested', 'Harvested'),
        ('discarded', 'Discarded'),
    ]

    trial = models.ForeignKey(Trial, on_delete=models.CASCADE)
    germplasm = models.ForeignKey(Germplasm, on_delete=models.CASCADE)
    rep = models.IntegerField()
    block = models.IntegerField(null=True, blank=True)
    plot_number = models.IntegerField()
    row = models.IntegerField(null=True, blank=True)
    column = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default='planned')

    class Meta:
        unique_together = (('trial', 'plot_number'),)

    def __str__(self):
        return f"{self.trial.trial_code}: Plot {self.plot_number} ({self.germplasm.name})"
