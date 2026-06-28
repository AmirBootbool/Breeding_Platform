import random
from typing import Sequence

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.germplasm.models import Germplasm

from .models import Plot


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


def create_plots_for_trial(trial, entries: Sequence[Germplasm], seed: int | None = None):
    entries = list(entries)
    if not entries:
        raise ValidationError({'entries': 'At least one germplasm entry is required.'})
    if trial.num_reps < 1:
        raise ValidationError({'num_reps': 'Trial must have at least one replication.'})
    if Plot.objects.filter(trial=trial).exists():
        raise ValidationError({'trial': 'Plots already exist for this trial.'})

    layouts = generate_rcbd_layout(entries, trial.num_reps, seed=seed)
    created = []
    plot_number = 1

    with transaction.atomic():
        for rep, entry_list in layouts:
            for germplasm in entry_list:
                plot = Plot.objects.create(
                    trial=trial,
                    germplasm=germplasm,
                    rep=rep,
                    plot_number=plot_number,
                )
                created.append(plot)
                plot_number += 1

    return created
