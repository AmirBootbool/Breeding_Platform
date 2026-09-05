import csv
import io

from django.core.exceptions import ValidationError
from django.db import models, transaction

from apps.core.models import Program, get_default_species_for_crop
from apps.germplasm.models import Germplasm


def import_germplasm_csv(file_obj, program_name, dry_run=False):
    """Parse and optionally persist germplasm rows from an uploaded CSV.

    Returns a dict: {"created": int, "skipped": int,
                     "errors": [{"row": int, "detail": str}]}
    """
    try:
        program = Program.objects.get(name=program_name)
    except Program.DoesNotExist as exc:
        raise ValidationError(f"Program '{program_name}' does not exist.") from exc

    text_stream = io.TextIOWrapper(file_obj, encoding="utf-8")
    reader = csv.DictReader(text_stream)

    # Header validation — must contain at least "name"
    if not reader.fieldnames or "name" not in reader.fieldnames:
        raise ValidationError(
            f"CSV is missing required headers. Found: {reader.fieldnames}"
        )

    created = 0
    skipped = 0
    errors = []
    with transaction.atomic():
        for i, row in enumerate(reader, start=2):  # header is row 1
            name = row.get("name", "").strip()
            if not name:
                errors.append({"row": i, "detail": "Missing required field: name"})
                continue

            # Skip duplicates within the same program (matches CLI behavior)
            if Germplasm.objects.filter(program=program, name=name).exists():
                skipped += 1
                continue

            try:
                germplasm = Germplasm(
                    name=name,
                    species=(
                        row.get("species", "").strip()
                        or get_default_species_for_crop(program.crop)
                    ),
                    program=program,
                    pedigree_string=row.get("pedigree_string", "").strip(),
                    cross_type=row.get("cross_type", "").strip() or "unknown",
                    year_developed=(
                        int(row["year_developed"])
                        if row.get("year_developed", "").strip()
                        else None
                    ),
                    notes=row.get("notes", "").strip(),
                )
                germplasm.full_clean()
                if not dry_run:
                    germplasm.save()
                created += 1
            except (ValidationError, KeyError, ValueError) as exc:
                errors.append({"row": i, "detail": str(exc)})

        if dry_run or errors:
            transaction.set_rollback(True)

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }


def get_family_group(germplasm):
    """Returns a stable family key based on shared parentage — full-sib
    if both parents match another germplasm, half-sib if one does.
    """
    f = germplasm.parent_female_id
    m = germplasm.parent_male_id
    if f and m:
        return f"full_f{f}_m{m}"
    elif f:
        return f"half_female_f{f}"
    elif m:
        return f"half_male_m{m}"
    return f"unrelated_{germplasm.id}"

def advance_generation(germplasm_list, method, ssd_count=1, user=None):
    """
    Advances a list of germplasm entries to the next generation.
    Supports 'bulk' (1 new entry per parent) and 'ssd' (N new entries per parent).
    """
    created_entries = []
    
    with transaction.atomic():
        for line in germplasm_list:
            if method == 'bulk':
                new_line = Germplasm(
                    name=f"{line.name}-B",
                    species=line.species,
                    program=line.program,
                    parent_female=line,
                    cross_type="self",
                    pedigree_string=f"{line.pedigree_string}-B" if line.pedigree_string else "",
                    created_by=user,
                    updated_by=user,
                )
                new_line.save()
                created_entries.append(new_line)
            
            elif method == 'ssd':
                for i in range(1, ssd_count + 1):
                    new_line = Germplasm(
                        name=f"{line.name}-{i}",
                        species=line.species,
                        program=line.program,
                        parent_female=line,
                        cross_type="self",
                        pedigree_string=f"{line.pedigree_string}-{i}" if line.pedigree_string else "",
                        created_by=user,
                        updated_by=user,
                    )
                    new_line.save()
                    created_entries.append(new_line)
                    
    return created_entries


def format_generation_label(generation):
    """Returns human-friendly generation label (e.g. F1, F2, or Founder/F0)."""
    if generation is None or generation == 0:
        return "F0"
    return f"F{generation}"


def build_pedigree_tree(germplasm_id, depth=3, direction="ancestors"):
    """
    Constructs a recursive genealogical pedigree tree for a given germplasm accession.
    
    Args:
        germplasm_id (int): Primary key of the root Germplasm.
        depth (int): Maximum levels of recursion (1 to 6).
        direction (str): 'ancestors', 'progeny', or 'both'.
    
    Returns:
        dict: Recursive tree node with ancestors and/or progeny.
    """
    depth = max(1, min(int(depth), 6))

    try:
        root = Germplasm.objects.select_related(
            "program", "parent_female__program", "parent_male__program"
        ).get(pk=germplasm_id)
    except Germplasm.DoesNotExist:
        return None

    def serialize_node(obj):
        if not obj:
            return None
        return {
            "id": obj.id,
            "name": obj.name,
            "germplasm_db_id": obj.germplasm_db_id,
            "species": obj.species,
            "program_id": obj.program_id,
            "program_name": obj.program.name if obj.program else "",
            "cross_type": obj.cross_type,
            "generation": obj.generation,
            "generation_label": format_generation_label(obj.generation),
            "pedigree_string": obj.pedigree_string,
            "year_developed": obj.year_developed,
            "parent_female": None,
            "parent_male": None,
            "progeny": [],
        }

    def fetch_ancestors(current_node_id, current_depth, visited):
        if current_depth > depth or current_node_id in visited:
            return None
        
        visited_branch = visited | {current_node_id}
        
        try:
            node = Germplasm.objects.select_related(
                "program", "parent_female__program", "parent_male__program"
            ).get(pk=current_node_id)
        except Germplasm.DoesNotExist:
            return None

        data = serialize_node(node)

        if current_depth < depth:
            if node.parent_female_id and node.parent_female_id not in visited_branch:
                data["parent_female"] = fetch_ancestors(
                    node.parent_female_id, current_depth + 1, visited_branch
                )
            elif node.parent_female_id:
                # Cycle detected
                data["parent_female"] = serialize_node(node.parent_female)
                if data["parent_female"]:
                    data["parent_female"]["has_cycle"] = True

            if node.parent_male_id and node.parent_male_id not in visited_branch:
                data["parent_male"] = fetch_ancestors(
                    node.parent_male_id, current_depth + 1, visited_branch
                )
            elif node.parent_male_id:
                # Cycle detected
                data["parent_male"] = serialize_node(node.parent_male)
                if data["parent_male"]:
                    data["parent_male"]["has_cycle"] = True

        return data

    def fetch_progeny(current_node_id, current_depth, visited):
        if current_depth > depth or current_node_id in visited:
            return []
        
        visited_branch = visited | {current_node_id}
        
        children = Germplasm.objects.filter(
            models.Q(parent_female_id=current_node_id) | models.Q(parent_male_id=current_node_id)
        ).select_related("program")[:20]

        result = []
        for child in children:
            child_data = serialize_node(child)
            if current_depth < depth and child.id not in visited_branch:
                child_data["progeny"] = fetch_progeny(
                    child.id, current_depth + 1, visited_branch
                )
            result.append(child_data)
        return result

    # Build tree according to direction
    root_data = serialize_node(root)
    
    if direction in ("ancestors", "both"):
        ancestor_tree = fetch_ancestors(root.id, 1, set())
        if ancestor_tree:
            root_data["parent_female"] = ancestor_tree.get("parent_female")
            root_data["parent_male"] = ancestor_tree.get("parent_male")

    if direction in ("progeny", "both"):
        root_data["progeny"] = fetch_progeny(root.id, 1, set())

    return root_data
