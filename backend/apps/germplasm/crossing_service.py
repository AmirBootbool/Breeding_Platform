"""
Business logic for the Crossing Block module.

Handles planning crosses from female/male parent lists, generating crossing
maps with configurable patterns, executing crosses to create progeny
germplasm, and auto-generating names and cross codes.
"""

import datetime
from collections import defaultdict

from django.db import transaction
from django.utils import timezone

from apps.germplasm.models import Cross, CrossingBlock, Germplasm


def _next_cross_code(year=None):
    """Generate the next sequential cross code for the given year.

    Format: X-YYYY-NNNN (e.g. X-2026-0001)
    """
    if year is None:
        year = timezone.now().year
    prefix = f"X-{year}-"
    last = (
        Cross.objects.filter(cross_code__startswith=prefix)
        .order_by("-cross_code")
        .values_list("cross_code", flat=True)
        .first()
    )
    if last:
        seq = int(last.split("-")[-1]) + 1
    else:
        seq = 1
    return f"{prefix}{seq:04d}"


def auto_name_progeny(female_name, male_name):
    """Returns standard wheat pedigree notation: '♀Name/♂Name'."""
    return f"{female_name}/{male_name}"


def plan_crosses(crossing_block, female_ids, male_ids):
    """
    Create planned Cross records for every ♀×♂ combination within the block.
    If crossing_block.include_reciprocals is True, also creates ♂×♀ entries.
    Assigns map_position based on the block's map_pattern.

    Returns the list of created Cross objects.
    """
    females = list(
        Germplasm.objects.filter(id__in=female_ids).order_by("name")
    )
    males = list(
        Germplasm.objects.filter(id__in=male_ids).order_by("name")
    )

    if not females or not males:
        raise ValueError("At least one female and one male parent are required.")

    # Build the cross pairs
    pairs = []
    for f in females:
        for m in males:
            if f.id == m.id:
                continue  # Skip self-crosses
            pairs.append({"female": f, "male": m, "reciprocal": False})

    if crossing_block.include_reciprocals:
        reciprocal_pairs = []
        for f in females:
            for m in males:
                if f.id == m.id:
                    continue
                reciprocal_pairs.append(
                    {"female": m, "male": f, "reciprocal": True}
                )
        pairs.extend(reciprocal_pairs)

    # Generate map positions based on pattern
    ordered_pairs = _order_by_pattern(
        pairs, crossing_block.map_pattern, females, males
    )

    # Persist the crosses
    cross_date = datetime.date.today()
    created_crosses = []

    with transaction.atomic():
        for position, pair in enumerate(ordered_pairs, start=1):
            code = _next_cross_code()
            cross = Cross(
                cross_code=code,
                female_parent=pair["female"],
                male_parent=pair["male"],
                crossing_block=crossing_block,
                status="planned",
                is_reciprocal=pair["reciprocal"],
                map_position=position,
                cross_date=cross_date,
                location=crossing_block.location,
            )
            cross.save()
            created_crosses.append(cross)

    return created_crosses


def _order_by_pattern(pairs, pattern, females, males):
    """
    Reorder cross pairs according to the chosen map pattern.

    male_first:   Group by male — [MaleA crosses...] [MaleB crosses...] ...
    female_first: Group by female — [FemA crosses...] [FemB crosses...] ...
    alternating:  Group by male, interleave male/female in sequence.
    """
    if pattern == "male_first":
        grouped = defaultdict(list)
        for p in pairs:
            grouped[p["male"].id].append(p)
        ordered = []
        for m in males:
            ordered.extend(
                sorted(grouped.get(m.id, []), key=lambda x: x["female"].name)
            )
        # Also include reciprocals grouped by their male
        for f in females:
            ordered.extend(
                sorted(grouped.get(f.id, []), key=lambda x: x["female"].name)
            )
        # Deduplicate while preserving order
        seen = set()
        result = []
        for p in ordered:
            key = (p["female"].id, p["male"].id, p["reciprocal"])
            if key not in seen:
                seen.add(key)
                result.append(p)
        return result

    elif pattern == "female_first":
        grouped = defaultdict(list)
        for p in pairs:
            grouped[p["female"].id].append(p)
        ordered = []
        for f in females:
            ordered.extend(
                sorted(grouped.get(f.id, []), key=lambda x: x["male"].name)
            )
        for m in males:
            ordered.extend(
                sorted(grouped.get(m.id, []), key=lambda x: x["male"].name)
            )
        seen = set()
        result = []
        for p in ordered:
            key = (p["female"].id, p["male"].id, p["reciprocal"])
            if key not in seen:
                seen.add(key)
                result.append(p)
        return result

    else:  # alternating
        return pairs


def execute_cross(cross, user=None):
    """
    Mark a planned cross as 'pollinated' and create the progeny
    Germplasm entry.

    Returns the created Germplasm (progeny) instance.
    """
    if cross.progeny_id is not None:
        return cross.progeny  # Already executed

    progeny_name = auto_name_progeny(
        cross.female_parent.name, cross.male_parent.name
    )

    progeny = Germplasm.objects.create(
        name=progeny_name,
        species=cross.female_parent.species,
        program=cross.crossing_block.program,
        parent_female=cross.female_parent,
        parent_male=cross.male_parent,
        pedigree_string=progeny_name,
        cross_type="biparental",
        generation=1,
        year_developed=datetime.date.today().year,
        created_by=user,
        updated_by=user,
    )

    cross.progeny = progeny
    cross.status = "pollinated"
    # Bypass full_clean for the update to avoid re-validating unchanged fields
    Cross.objects.filter(pk=cross.pk).update(
        progeny=progeny, status="pollinated"
    )

    return progeny


def execute_all_crosses(crossing_block, user=None):
    """Execute all planned crosses in a block, creating progeny for each."""
    crosses = crossing_block.crosses.filter(status="planned").select_related(
        "female_parent", "male_parent"
    )
    created = []
    with transaction.atomic():
        for cross in crosses:
            progeny = execute_cross(cross, user=user)
            created.append(progeny)
    return created


def generate_crossing_map(crossing_block):
    """
    Build an ordered crossing map for field layout.

    Returns a list of dicts:
    [
      { position, type: 'parent'|'cross', entry_name, cross_code,
        female_name, male_name }
    ]

    For 'male_first' pattern, inserts a parent marker row before each
    group of crosses sharing the same male.
    For 'female_first', inserts markers before each female group.
    """
    crosses = list(
        crossing_block.crosses.all()
        .select_related("female_parent", "male_parent")
        .order_by("map_position")
    )

    if not crosses:
        return []

    map_entries = []
    position = 1
    pattern = crossing_block.map_pattern

    if pattern == "male_first":
        current_male = None
        for cross in crosses:
            if cross.male_parent_id != current_male:
                current_male = cross.male_parent_id
                map_entries.append(
                    {
                        "position": position,
                        "type": "parent",
                        "entry_name": cross.male_parent.name,
                        "cross_code": None,
                        "female_name": None,
                        "male_name": cross.male_parent.name,
                    }
                )
                position += 1
            map_entries.append(
                {
                    "position": position,
                    "type": "cross",
                    "entry_name": auto_name_progeny(
                        cross.female_parent.name, cross.male_parent.name
                    ),
                    "cross_code": cross.cross_code,
                    "female_name": cross.female_parent.name,
                    "male_name": cross.male_parent.name,
                }
            )
            position += 1

    elif pattern == "female_first":
        current_female = None
        for cross in crosses:
            if cross.female_parent_id != current_female:
                current_female = cross.female_parent_id
                map_entries.append(
                    {
                        "position": position,
                        "type": "parent",
                        "entry_name": cross.female_parent.name,
                        "cross_code": None,
                        "female_name": cross.female_parent.name,
                        "male_name": None,
                    }
                )
                position += 1
            map_entries.append(
                {
                    "position": position,
                    "type": "cross",
                    "entry_name": auto_name_progeny(
                        cross.female_parent.name, cross.male_parent.name
                    ),
                    "cross_code": cross.cross_code,
                    "female_name": cross.female_parent.name,
                    "male_name": cross.male_parent.name,
                }
            )
            position += 1

    else:  # alternating
        for cross in crosses:
            map_entries.append(
                {
                    "position": position,
                    "type": "cross",
                    "entry_name": auto_name_progeny(
                        cross.female_parent.name, cross.male_parent.name
                    ),
                    "cross_code": cross.cross_code,
                    "female_name": cross.female_parent.name,
                    "male_name": cross.male_parent.name,
                }
            )
            position += 1

    return map_entries
