import logging
import random
from typing import Sequence

import pandas as pd
import statsmodels.formula.api as smf

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Avg, Count, Max, Min, StdDev

from apps.germplasm.models import Germplasm
from apps.germplasm.services import get_family_group

from .models import Observation, Plot, Trial

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
            block_entries = shuffled[
                (block_num - 1) * block_size : block_num * block_size
            ]
            for germplasm in block_entries:
                layout.append(
                    {
                        "germplasm": germplasm,
                        "rep": rep,
                        "incomplete_block": block_num,
                        "position": position,
                    }
                )
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
            layout.append(
                {
                    "germplasm": germplasm,
                    "rep": rep,
                    "incomplete_block": None,
                    "position": position,
                    "is_check": germplasm in check_set,
                }
            )
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
            raise ValidationError(
                {"block_size": "block_size is required for alpha-lattice trials."}
            )
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
        layout = generate_augmented_layout(entries, checks, trial.num_reps, seed=seed)
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
        raise ValidationError(
            {"design_type": f"Unsupported design type: {trial.design_type}"}
        )

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


def validate_analysis_set_coverage(analysis_set):
    """Returns a warning string if the set spans only one environment,
    since heritability/GxE estimates are only meaningful across >=2
    environments. Does not raise — the caller decides whether to block.
    """
    trials = analysis_set.trials.all()
    environments = {(t.season_id, t.location_id) for t in trials}
    if len(environments) < 2:
        return (
            "This analysis set spans only one season/location combination. "
            "Heritability and GxE estimates require multiple environments."
        )
    return None


def build_observation_dataframe(analysis_set, variable):
    """Flatten observations for one trait across all trials in an
    analysis set into a dataframe suitable for mixed-model fitting.
    """
    observations = Observation.objects.filter(
        plot__trial__in=analysis_set.trials.all(), variable=variable
    ).select_related("plot", "plot__trial", "plot__germplasm")
    rows = [
        {
            "value": obs.value_numeric,
            "germplasm": obs.plot.germplasm.name,
            "environment": f"{obs.plot.trial.season_id}_{obs.plot.trial.location_id}",
            "replication": obs.plot.rep,
        }
        for obs in observations
        if obs.value_numeric is not None
    ]
    return pd.DataFrame(rows)


def compute_heritability(analysis_set, variable):
    """Fit a genotype + environment random-effects model and return
    broad-sense heritability plus variance components.

    Returns: {
        "h2": float | None,
        "variance_genotype": float,
        "variance_gxe": float,
        "variance_residual": float,
        "n_environments": int,
        "n_genotypes": int,
        "warning": str | None,
    }
    """
    df = build_observation_dataframe(analysis_set, variable)
    coverage_warning = validate_analysis_set_coverage(analysis_set)

    n_environments = df["environment"].nunique() if not df.empty else 0
    n_genotypes = df["germplasm"].nunique() if not df.empty else 0

    if n_environments < 2 or len(df) < 10:
        return {
            "h2": None,
            "variance_genotype": None,
            "variance_gxe": None,
            "variance_residual": None,
            "n_environments": n_environments,
            "n_genotypes": n_genotypes,
            "warning": coverage_warning or "Insufficient data for a reliable estimate.",
        }

    try:
        # Random intercept for genotype, nested random effect approximated via
        # a genotype:environment interaction term added as a grouping variable.
        df["geno_env"] = df["germplasm"] + "_" + df["environment"]
        model = smf.mixedlm("value ~ 1", df, groups=df["germplasm"], re_formula="1")
        result = model.fit(reml=True)

        var_genotype = float(result.cov_re.iloc[0, 0])
        var_residual = float(result.scale)

        # Genotype x environment variance estimated as a second pass: fit
        # genotype-within-environment as the grouping variable and subtract.
        model_gxe = smf.mixedlm("value ~ 1", df, groups=df["geno_env"], re_formula="1")
        result_gxe = model_gxe.fit(reml=True)
        var_geno_plus_gxe = float(result_gxe.cov_re.iloc[0, 0])
        var_gxe = max(var_geno_plus_gxe - var_genotype, 0.0)

        reps = df.groupby("environment")["replication"].nunique().mean()
        if not reps:
            reps = 1

        denominator = (
            var_genotype
            + (var_gxe / n_environments)
            + (var_residual / (n_environments * reps))
        )
        h2 = var_genotype / denominator if denominator > 0 else 0.0
        h2 = max(0.0, min(1.0, h2))

        return {
            "h2": round(h2, 3),
            "variance_genotype": round(var_genotype, 4),
            "variance_gxe": round(var_gxe, 4),
            "variance_residual": round(var_residual, 4),
            "n_environments": n_environments,
            "n_genotypes": n_genotypes,
            "warning": coverage_warning,
        }
    except Exception as exc:
        return {
            "h2": None,
            "variance_genotype": None,
            "variance_gxe": None,
            "variance_residual": None,
            "n_environments": n_environments,
            "n_genotypes": n_genotypes,
            "warning": f"Model fitting failed: {str(exc)}",
        }


def compute_cross_environment_ranking(analysis_set, variable):
    """Returns germplasm ranked by environment-adjusted mean performance
    (best linear unbiased estimate of the genotype effect from the same
    mixed model used for heritability).
    """
    df = build_observation_dataframe(analysis_set, variable)
    if df.empty:
        return []

    n_environments = df["environment"].nunique()
    if n_environments < 2 or len(df) < 10:
        # Fallback to raw means if there is insufficient data to run mixed models
        raw_means = []
        for name in df["germplasm"].unique():
            sub = df[df["germplasm"] == name]

            try:
                germ = Germplasm.objects.filter(
                    name=name, program=analysis_set.program
                ).first()
                family_group = get_family_group(germ) if germ else None
            except Exception:
                family_group = None

            env_means = {
                env: round(float(env_sub["value"].mean()), 3)
                for env, env_sub in sub.groupby("environment")
            }

            raw_means.append(
                {
                    "germplasm": name,
                    "adjusted_mean": round(float(sub["value"].mean()), 3),
                    "raw_mean": round(float(sub["value"].mean()), 3),
                    "n_observations": int(len(sub)),
                    "n_environments": int(sub["environment"].nunique()),
                    "family_group": family_group,
                    "raw_means_by_env": env_means,
                }
            )
        raw_means.sort(key=lambda r: r["adjusted_mean"], reverse=True)
        return raw_means

    try:
        model = smf.mixedlm(
            "value ~ environment", df, groups=df["germplasm"], re_formula="1"
        )
        result = model.fit(reml=True)
        random_effects = result.random_effects  # dict: germplasm -> series
        overall_intercept = float(result.fe_params.get("Intercept", 0.0))
    except Exception:
        # Fallback to raw means on failure
        raw_means = []
        for name in df["germplasm"].unique():
            sub = df[df["germplasm"] == name]

            try:
                germ = Germplasm.objects.filter(
                    name=name, program=analysis_set.program
                ).first()
                family_group = get_family_group(germ) if germ else None
            except Exception:
                family_group = None

            env_means = {
                env: round(float(env_sub["value"].mean()), 3)
                for env, env_sub in sub.groupby("environment")
            }

            raw_means.append(
                {
                    "germplasm": name,
                    "adjusted_mean": round(float(sub["value"].mean()), 3),
                    "raw_mean": round(float(sub["value"].mean()), 3),
                    "n_observations": int(len(sub)),
                    "n_environments": int(sub["environment"].nunique()),
                    "family_group": family_group,
                    "raw_means_by_env": env_means,
                }
            )
        raw_means.sort(key=lambda r: r["adjusted_mean"], reverse=True)
        return raw_means

    ranking = []
    from apps.germplasm.models import Germplasm
    from apps.germplasm.services import get_family_group

    for name, effect in random_effects.items():
        try:
            germ = Germplasm.objects.filter(
                name=name, program=analysis_set.program
            ).first()
            family_group = get_family_group(germ) if germ else None
        except Exception:
            family_group = None

        adjusted_val = overall_intercept + float(effect.iloc[0])
        sub = df[df["germplasm"] == name]
        env_means = {
            env: round(float(env_sub["value"].mean()), 3)
            for env, env_sub in sub.groupby("environment")
        }

        ranking.append(
            {
                "germplasm": name,
                "adjusted_mean": round(adjusted_val, 3),
                "raw_mean": round(float(sub["value"].mean()), 3),
                "n_observations": int(len(sub)),
                "n_environments": int(sub["environment"].nunique()),
                "family_group": family_group,
                "raw_means_by_env": env_means,
            }
        )
    ranking.sort(key=lambda r: r["adjusted_mean"], reverse=True)
    return ranking
