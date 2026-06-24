import random
from typing import List
from apps.germplasm.models import Germplasm
from .models import Plot


def generate_rcbd_layout(entries: List[Germplasm], num_reps: int, seed: int | None = None):
    """Generate RCBD layout ordering.

    Returns a list of (rep, plot_ordered_entries) where plot_ordered_entries is a list of germplasm instances in planting order for that rep.
    """
    if seed is not None:
        random.seed(seed)

    layouts = []
    for rep in range(1, num_reps + 1):
        shuffled = entries.copy()
        random.shuffle(shuffled)
        layouts.append((rep, shuffled))
    return layouts


def create_plots_for_trial(trial, entries: List[Germplasm], seed: int | None = None):
    """Create Plot objects for a trial using RCBD ordering. Plot numbers assigned sequentially across reps starting at 1."""
    layouts = generate_rcbd_layout(entries, trial.num_reps, seed=seed)
    plot_number = 1
    created = []
    for rep, entry_list in layouts:
        for g in entry_list:
            p = Plot.objects.create(trial=trial, germplasm=g, rep=rep, plot_number=plot_number)
            created.append(p)
            plot_number += 1
    return created
