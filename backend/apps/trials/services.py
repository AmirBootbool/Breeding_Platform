import logging
import random
from typing import Sequence

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Avg, Count, Max, Min, StdDev

from apps.germplasm.models import Germplasm

from .models import Plot, Trial

logger = logging.getLogger("apps.trials.services")


def generate_rcbd_layout(
    entries: Sequence[Germplasm],
    num_reps: int,
    seed: int | None = None,
) -> list[tuple[int, list[Germplasm]]]:
    rng = random.Random(seed)
    entries = list(entries)

    layouts = []
    for rep in range(1, num_reps + 1):
        shuffled = entries.copy()
        rng.shuffle(shuffled)
        layouts.append((rep, shuffled))
    return layouts


def generate_alpha_lattice_layout(
    entries: Sequence[Germplasm],
    num_reps: int,
    block_size: int,
    seed: int | None = None,
) -> list[dict]:
    if len(entries) % block_size != 0:
        raise ValidationError(
            f"Entry count ({len(entries)}) must be evenly divisible by block_size ({block_size})."
        )
    if block_size < 2:
        raise ValidationError("block_size must be at least 2.")

    rng = random.Random(seed)
    blocks_per_rep = len(entries) // block_size
    layout = []

    for rep in range(1, num_reps + 1):
        shuffled = list(entries)
        rng.shuffle(shuffled)
        position = 1
        for block_num in range(1, blocks_per_rep + 1):
            block_entries = shuffled[(block_num - 1) * block_size : block_num * block_size]
            for germplasm in block_entries:
                layout.append({
                    "germplasm": germplasm,
                    "rep": rep,
                    "incomplete_block": block_num,
                    "position": position,
                })
                position += 1
    return layout


def generate_augmented_layout(
    entries: Sequence[Germplasm],
    check_entries: Sequence[Germplasm],
    num_reps: int,
    seed: int | None = None,
) -> list[dict]:
    rng = random.Random(seed)
    check_set = set(check_entries)
    test_entries = [e for e in entries if e not in check_set]

    rng.shuffle(test_entries)
    buckets = [[] for _ in range(num_reps)]
    for i, entry in enumerate(test_entries):
        buckets[i % num_reps].append(entry)

    layout = []
    for rep in range(1, num_reps + 1):
        rep_entries = list(check_entries) + buckets[rep - 1]
        rng.shuffle(rep_entries)
        for position, germplasm in enumerate(rep_entries, start=1):
            layout.append({
                "germplasm": germplasm,
                "rep": rep,
                "incomplete_block": None,
                "position": position,
                "is_check": germplasm in check_set,
            })
    return layout


def create_plots_for_trial(
    trial: Trial,
    entries: Sequence[Germplasm],
    seed: int | None = None,
    check_entries: Sequence[Germplasm] | None = None,
) -> list[Plot]:
    entries = list(entries)
    logger.info(
        "Creating plots for trial %s (design: %s, replications: %d, seed: %s)",
        trial.trial_code,
        trial.design_type,
        trial.num_reps,
        seed,
    )

    if not entries:
        raise ValidationError({"entries": "At least one germplasm entry is required."})
    if trial.num_reps < 1:
        raise ValidationError({"num_reps": "Trial must have at least one replication."})
    if Plot.objects.filter(trial=trial).exists():
        raise ValidationError({"trial": "Plots already exist for this trial."})

    plots_to_create = []
    if trial.design_type == "RCBD":
        layouts = generate_rcbd_layout(entries, trial.num_reps, seed=seed)
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
    elif trial.design_type == "alpha_lattice":
        if trial.block_size is None:
            raise ValidationError({"block_size": "block_size is required for alpha-lattice trials."})
        layout = generate_alpha_lattice_layout(
            entries, trial.num_reps, trial.block_size, seed=seed
        )
        plot_number = 1
        for row in layout:
            plots_to_create.append(
                Plot(
                    trial=trial,
                    germplasm=row["germplasm"],
                    rep=row["rep"],
                    incomplete_block=row["incomplete_block"],
                    plot_number=plot_number,
                )
            )
            plot_number += 1
    elif trial.design_type == "augmented":
        checks = list(check_entries) if check_entries else []
        layout = generate_augmented_layout(
            entries, checks, trial.num_reps, seed=seed
        )
        plot_number = 1
        for row in layout:
            plots_to_create.append(
                Plot(
                    trial=trial,
                    germplasm=row["germplasm"],
                    rep=row["rep"],
                    incomplete_block=None,
                    is_check=row["is_check"],
                    plot_number=plot_number,
                )
            )
            plot_number += 1
    else:
        raise ValidationError({"design_type": f"Unsupported design type: {trial.design_type}"})

    with transaction.atomic():
        created = Plot.objects.bulk_create(plots_to_create)

    return created


def compute_trial_summary(trial: Trial) -> list[dict]:
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
