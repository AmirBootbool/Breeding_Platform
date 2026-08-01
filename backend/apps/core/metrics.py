from prometheus_client import Gauge
from django.utils import timezone
from django.db.models import Q

from apps.germplasm.models import Germplasm
from apps.trials.models import Observation, Trial

germplasm_total = Gauge("wbp_germplasm_total", "Total germplasm records")
trials_active_total = Gauge("wbp_trials_active_total", "Trials with harvest date in the future or unset")
observations_total = Gauge("wbp_observations_total", "Total observations recorded")


def refresh_domain_gauges():
    germplasm_total.set(Germplasm.objects.count())
    today = timezone.now().date()
    trials_active_total.set(
        Trial.objects.filter(Q(harvest_date__gte=today) | Q(harvest_date__isnull=True)).count()
    )
    observations_total.set(Observation.objects.count())
