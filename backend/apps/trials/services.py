import logging
import random
from typing import Sequence

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Avg, Count, Max, Min, StdDev

from apps.germplasm.models import Germplasm

from .models import Plot

logger = logging.getLogger("apps.trials.services")


def generate_rcbd_layout(
    entries: Sequence[Germplasm],
    num_reps: int,
    seed: int | None = None,
):
    rng = random.Random(seed)
    entries = list(entries)

    layouts = []
    for rep in range(1, num_reps + 1):
        shuffled = entries.copy()
        rng.shuffle(shuffled)
        layouts.append((rep, shuffled))
    return layouts


def create_plots_for_trial(
    trial, entries: Sequence[Germplasm], seed: int | None = None
):
    entries = list(entries)
    logger.info(
        "Creating %d plots for trial %s (replications: %d, seed: %s)",
        len(entries) * trial.num_reps,
        trial.trial_code,
        trial.num_reps,
        seed,
    )

    if not entries:
        raise ValidationError({"entries": "At least one germplasm entry is required."})
    if trial.num_reps < 1:
        raise ValidationError({"num_reps": "Trial must have at least one replication."})
    if Plot.objects.filter(trial=trial).exists():
        raise ValidationError({"trial": "Plots already exist for this trial."})

    layouts = generate_rcbd_layout(entries, trial.num_reps, seed=seed)
    plots_to_create = []
    plot_number = 1

    for rep, entry_list in layouts:
        for germplasm in entry_list:
            plots_to_create.append(
                Plot(
                    trial=trial,
                    germplasm=germplasm,
                    rep=rep,
                    plot_number=plot_number,
                )
            )
            plot_number += 1

    with transaction.atomic():
        created = Plot.objects.bulk_create(plots_to_create)

    return created


def compute_trial_summary(trial):
    """Return per-variable stats for all observations in a trial."""
    from .models import Observation

    stats = (
        Observation.objects.filter(plot__trial=trial, value_numeric__isnull=False)
        .values("variable__name", "variable__unit")
        .annotate(
            count=Count("id"),
            mean=Avg("value_numeric"),
            min_val=Min("value_numeric"),
            max_val=Max("value_numeric"),
            std_dev=StdDev("value_numeric"),
        )
        .order_by("variable__name")
    )
    results = []
    for row in stats:
        cv = None
        if row["mean"] and row["std_dev"]:
            cv = round((row["std_dev"] / row["mean"]) * 100, 2)
        results.append(
            {
                "variable": row["variable__name"],
                "unit": row["variable__unit"],
                "count": row["count"],
                "mean": round(row["mean"], 4) if row["mean"] is not None else None,
                "min": row["min_val"],
                "max": row["max_val"],
                "std_dev": (
                    round(row["std_dev"], 4) if row["std_dev"] is not None else None
                ),
                "cv_percent": cv,
            }
        )
    return results
