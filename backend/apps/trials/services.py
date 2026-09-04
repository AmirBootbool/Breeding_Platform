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


def generate_prep_layout(
    entries: Sequence[Germplasm],
    check_entries: Sequence[Germplasm],
    prep_fraction: float,
    seed: int | None = None,
) -> list[dict]:
    rng = random.Random(seed)
    check_set = set(check_entries)
    test_entries = [e for e in entries if e not in check_set]

    rep1 = list(check_entries) + test_entries
    rng.shuffle(rep1)

    num_prep = int(round(len(test_entries) * prep_fraction))
    prep_test_entries = rng.sample(test_entries, num_prep) if test_entries else []
    rep2 = list(check_entries) + prep_test_entries
    rng.shuffle(rep2)

    layout = []
    for position, germplasm in enumerate(rep1, start=1):
        layout.append({
            "germplasm": germplasm,
            "rep": 1,
            "position": position,
            "is_check": germplasm in check_set,
        })
    for position, germplasm in enumerate(rep2, start=1):
        layout.append({
            "germplasm": germplasm,
            "rep": 2,
            "position": position,
            "is_check": germplasm in check_set,
        })
    return layout


def generate_latin_square_layout(
    entries: Sequence[Germplasm],
    seed: int | None = None,
) -> list[dict]:
    n = len(entries)
    if n > 30:
        raise ValidationError(f"Latin Square max size is 30. Got {n} entries.")
    
    rng = random.Random(seed)
    entries = list(entries)
    rng.shuffle(entries)

    square = []
    for i in range(n):
        row = [entries[(i + j) % n] for j in range(n)]
        square.append(row)
    
    rng.shuffle(square)
    col_indices = list(range(n))
    rng.shuffle(col_indices)
    
    layout = []
    position = 1
    for r in range(n):
        for c in range(n):
            germplasm = square[r][col_indices[c]]
            layout.append({
                "germplasm": germplasm,
                "row": r + 1,
                "column": c + 1,
                "position": position,
            })
            position += 1
    return layout


def generate_augmented_block_layout(
    entries: Sequence[Germplasm],
    check_entries: Sequence[Germplasm],
    block_size: int,
    seed: int | None = None,
) -> list[dict]:
    if block_size < 2:
        raise ValidationError("block_size must be at least 2.")
        
    rng = random.Random(seed)
    check_set = set(check_entries)
    test_entries = [e for e in entries if e not in check_set]
    rng.shuffle(test_entries)
    
    blocks = []
    current_block = []
    for entry in test_entries:
        if len(current_block) >= block_size:
            blocks.append(current_block)
            current_block = []
        current_block.append(entry)
    if current_block:
        blocks.append(current_block)
        
    layout = []
    position = 1
    for block_idx, block_test_entries in enumerate(blocks, start=1):
        block_all = list(check_entries) + block_test_entries
        rng.shuffle(block_all)
        for germplasm in block_all:
            layout.append({
                "germplasm": germplasm,
                "incomplete_block": block_idx,
                "position": position,
                "is_check": germplasm in check_set,
            })
            position += 1
    return layout


def generate_unreplicated_layout(
    entries: Sequence[Germplasm],
    seed: int | None = None,
) -> list[dict]:
    rng = random.Random(seed)
    entries = list(entries)
    rng.shuffle(entries)
    
    layout = []
    for position, germplasm in enumerate(entries, start=1):
        layout.append({
            "germplasm": germplasm,
            "rep": 1,
            "position": position,
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
    elif trial.design_type == "prep":
        if trial.prep_fraction is None:
            raise ValidationError(
                {"prep_fraction": "prep_fraction is required for P-Rep trials."}
            )
        checks = list(check_entries) if check_entries else []
        layout = generate_prep_layout(entries, checks, trial.prep_fraction, seed=seed)
        plot_number = 1
        for row in layout:
            plots_to_create.append(
                Plot(
                    trial=trial,
                    germplasm=row["germplasm"],
                    rep=row["rep"],
                    is_check=row["is_check"],
                    plot_number=plot_number,
                )
            )
            plot_number += 1
    elif trial.design_type == "latin_square":
        if trial.num_reps != 1:
            raise ValidationError(
                {"num_reps": "Latin Square designs must have num_reps = 1."}
            )
        layout = generate_latin_square_layout(entries, seed=seed)
        plot_number = 1
        for row in layout:
            plots_to_create.append(
                Plot(
                    trial=trial,
                    germplasm=row["germplasm"],
                    rep=1,
                    row=row["row"],
                    column=row["column"],
                    plot_number=plot_number,
                )
            )
            plot_number += 1
    elif trial.design_type == "augmented_block":
        if trial.block_size is None:
            raise ValidationError(
                {"block_size": "block_size is required for augmented block trials."}
            )
        checks = list(check_entries) if check_entries else []
        layout = generate_augmented_block_layout(entries, checks, trial.block_size, seed=seed)
        plot_number = 1
        for row in layout:
            plots_to_create.append(
                Plot(
                    trial=trial,
                    germplasm=row["germplasm"],
                    rep=1,
                    incomplete_block=row["incomplete_block"],
                    is_check=row["is_check"],
                    plot_number=plot_number,
                )
            )
            plot_number += 1
    elif trial.design_type == "unreplicated":
        layout = generate_unreplicated_layout(entries, seed=seed)
        plot_number = 1
        for row in layout:
            plots_to_create.append(
                Plot(
                    trial=trial,
                    germplasm=row["germplasm"],
                    rep=row["rep"],
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


def advance_plots(plot_ids: list[int], selections_per_plot: int = 1, selection_method: str = "SSD") -> list[int]:
    """Advance selected plots to the next generation by creating new Germplasm records."""
    from .models import Plot
    from apps.germplasm.models import Germplasm
    from django.db import transaction
    from datetime import date
    import re

    plots = Plot.objects.filter(id__in=plot_ids).select_related("germplasm", "trial__program")
    if not plots.exists():
        return []

    created_ids = []
    current_year = date.today().year

    method_abbr = {
        "SSD": "SSD",
        "Single Spike": "SS",
        "Single Plant": "SP",
        "Special Bulk": "SB",
        "Bulk": "BLK",
    }.get(selection_method, "SEL")

    with transaction.atomic():
        for plot in plots:
            base_name = plot.germplasm.name
            base_pedigree = plot.germplasm.pedigree_string
            program = plot.trial.program
            
            # Remove any trailing generation suffixes like -F2 or -SSD-1 to keep names clean
            clean_name = re.sub(r'-(F\d+|SSD|SS|SP|SB|BLK)(-\d+)?$', '', base_name)
            clean_pedigree = re.sub(r'-(F\d+|SSD|SS|SP|SB|BLK)(-\d+)?$', '', base_pedigree) if base_pedigree else ""
            
            current_gen = plot.germplasm.generation or 0
            new_gen = current_gen + 1 if current_gen < 8 else 8
            
            gen_suffix = f"-F{new_gen}" if new_gen > 0 else ""

            for i in range(1, selections_per_plot + 1):
                sel_suffix = f"-{method_abbr}"
                if selections_per_plot > 1:
                    sel_suffix = f"-{method_abbr}{i}"
                
                full_suffix = f"{gen_suffix}{sel_suffix}"
                
                new_germplasm = Germplasm.objects.create(
                    name=f"{clean_name}{full_suffix}",
                    pedigree_string=f"{clean_pedigree}{full_suffix}",
                    program=program,
                    parent_female=plot.germplasm,
                    cross_type="self",
                    generation=new_gen,
                    year_developed=current_year,
                )
                created_ids.append(new_germplasm.id)
                
    return created_ids


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


def import_fieldbook_csv(trial: Trial, file_obj, dry_run: bool = False, user=None) -> dict:
    """Import or update observations for a trial from an uploaded Field Book CSV file.

    Returns dict with imported_count, updated_count, matched_variables, and errors.
    """
    import csv
    import io
    from django.core.exceptions import ValidationError
    from django.db import transaction
    from django.utils import timezone
    from django.utils.dateparse import parse_date

    from .models import Observation, ObservationVariable, Plot

    if hasattr(file_obj, "read"):
        raw = file_obj.read()
        if isinstance(raw, str):
            text = raw
        else:
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = raw.decode("latin-1")
        stream = io.StringIO(text)
    elif isinstance(file_obj, str):
        stream = io.StringIO(file_obj)
    else:
        stream = file_obj

    reader = csv.DictReader(stream)
    if not reader.fieldnames:
        raise ValidationError("CSV file is empty or missing headers.")

    plot_id_col = None
    for col in ["plot_id", "plot", "plot_number", "plotnumber", "Plot"]:
        if col in reader.fieldnames:
            plot_id_col = col
            break

    if not plot_id_col:
        raise ValidationError(
            f"CSV is missing plot identifier column (plot_id/plot/plot_number). Found headers: {reader.fieldnames}"
        )

    # Load all variables and build mapping by name, variable_code, and lowercased keys
    variables = list(ObservationVariable.objects.all())
    var_map = {}
    for var in variables:
        var_map[var.name] = var
        var_map[var.name.lower()] = var
        if var.variable_code:
            var_map[var.variable_code] = var
            var_map[var.variable_code.lower()] = var

    matched_cols = {}
    for col in reader.fieldnames:
        if col == plot_id_col:
            continue
        cleaned_col = col.strip()
        if cleaned_col in var_map:
            matched_cols[col] = var_map[cleaned_col]
        elif cleaned_col.lower() in var_map:
            matched_cols[col] = var_map[cleaned_col.lower()]

    if not matched_cols:
        raise ValidationError(
            f"No matching observation variable columns found in CSV. Found headers: {reader.fieldnames}"
        )

    # Pre-fetch trial plots into a lookup dict: plot_number -> Plot
    plots_by_number = {p.plot_number: p for p in Plot.objects.filter(trial=trial)}

    imported_count = 0
    updated_count = 0
    errors = []

    with transaction.atomic():
        for row_idx, row in enumerate(reader, start=2):
            plot_raw = row.get(plot_id_col, "").strip()
            if not plot_raw:
                errors.append({"row": row_idx, "detail": "Missing plot identifier."})
                continue
            try:
                plot_num = int(plot_raw)
            except ValueError:
                errors.append(
                    {"row": row_idx, "detail": f"Invalid plot number '{plot_raw}'."}
                )
                continue

            plot = plots_by_number.get(plot_num)
            if not plot:
                errors.append(
                    {
                        "row": row_idx,
                        "detail": f"Plot {plot_num} does not exist in trial '{trial.trial_code}'.",
                    }
                )
                continue

            for col_name, var in matched_cols.items():
                cell_val = row.get(col_name, "").strip()
                if cell_val == "":
                    continue

                val_num = None
                val_text = ""
                val_date = None

                if var.data_type in ("numeric", "integer"):
                    try:
                        val_num = float(cell_val)
                    except ValueError:
                        errors.append(
                            {
                                "row": row_idx,
                                "detail": f"Invalid numeric value '{cell_val}' for variable '{var.name}'.",
                            }
                        )
                        continue
                elif var.data_type == "date":
                    val_date = parse_date(cell_val)
                    if not val_date:
                        errors.append(
                            {
                                "row": row_idx,
                                "detail": f"Invalid date '{cell_val}' for variable '{var.name}' (expect YYYY-MM-DD).",
                            }
                        )
                        continue
                else:
                    val_text = cell_val

                obs = Observation.objects.filter(plot=plot, variable=var).first()
                if obs:
                    obs.value_numeric = val_num
                    obs.value_text = val_text
                    obs.value_date = val_date
                    obs.observation_time = timezone.now()
                    is_new = False
                else:
                    obs = Observation(
                        plot=plot,
                        variable=var,
                        value_numeric=val_num,
                        value_text=val_text,
                        value_date=val_date,
                        observation_time=timezone.now(),
                    )
                    is_new = True

                try:
                    obs.full_clean()
                    if not dry_run:
                        obs.save()
                    if is_new:
                        imported_count += 1
                    else:
                        updated_count += 1
                except ValidationError as ve:
                    detail = (
                        ve.message_dict if hasattr(ve, "message_dict") else str(ve)
                    )
                    errors.append(
                        {
                            "row": row_idx,
                            "detail": f"Validation error for '{var.name}': {detail}",
                        }
                    )

        if dry_run or errors:
            transaction.set_rollback(True)

    return {
        "imported_count": imported_count if not (dry_run or errors) else 0,
        "updated_count": updated_count if not (dry_run or errors) else 0,
        "matched_variables": list({v.name for v in matched_cols.values()}),
        "errors": errors,
        "dry_run": dry_run,
    }

