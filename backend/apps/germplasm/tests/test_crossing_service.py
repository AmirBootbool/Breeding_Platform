import pytest
from datetime import date

from apps.core.models import Location, Program
from apps.germplasm.models import Cross, CrossingBlock, Germplasm
from apps.germplasm.crossing_service import (
    auto_name_progeny,
    execute_all_crosses,
    execute_cross,
    generate_crossing_map,
    plan_crosses,
)


@pytest.fixture
def program(db):
    return Program.objects.create(name="Cross Test Program")


@pytest.fixture
def location(db):
    return Location.objects.create(name="Cross Test Station")


@pytest.fixture
def base_lines(program):
    lines = []
    for i, name in enumerate(["KAUZ", "PASTOR", "ATTILA", "SERI"], start=1):
        lines.append(
            Germplasm.objects.create(
                name=name, germplasm_db_id=f"CT{i:04d}", program=program
            )
        )
    return lines


@pytest.fixture
def crossing_block(program, location):
    return CrossingBlock.objects.create(
        name="Test Block",
        program=program,
        location=location,
        map_pattern="male_first",
        include_reciprocals=False,
    )


# ---- auto_name_progeny -------------------------------------------------------


def test_auto_name_progeny():
    assert auto_name_progeny("KAUZ", "PASTOR") == "KAUZ/PASTOR"
    assert auto_name_progeny("ATTILA", "BABAX") == "ATTILA/BABAX"


# ---- plan_crosses ------------------------------------------------------------


@pytest.mark.django_db
def test_plan_crosses_basic(crossing_block, base_lines):
    females = [base_lines[0], base_lines[1]]  # KAUZ, PASTOR
    males = [base_lines[2], base_lines[3]]  # ATTILA, SERI

    created = plan_crosses(
        crossing_block,
        female_ids=[f.id for f in females],
        male_ids=[m.id for m in males],
    )

    # 2 females × 2 males = 4 crosses
    assert len(created) == 4
    assert all(c.status == "planned" for c in created)
    assert all(c.crossing_block == crossing_block for c in created)
    assert all(c.map_position is not None for c in created)


@pytest.mark.django_db
def test_plan_crosses_with_reciprocals(program, location, base_lines):
    block = CrossingBlock.objects.create(
        name="Reciprocal Block",
        program=program,
        location=location,
        map_pattern="male_first",
        include_reciprocals=True,
    )
    females = [base_lines[0]]  # KAUZ
    males = [base_lines[1]]  # PASTOR

    created = plan_crosses(
        block,
        female_ids=[f.id for f in females],
        male_ids=[m.id for m in males],
    )

    # 1 × 1 = 1 + 1 reciprocal = 2
    assert len(created) == 2
    non_recip = [c for c in created if not c.is_reciprocal]
    recip = [c for c in created if c.is_reciprocal]
    assert len(non_recip) == 1
    assert len(recip) == 1
    # Reciprocal should have swapped parents
    assert non_recip[0].female_parent == base_lines[0]
    assert non_recip[0].male_parent == base_lines[1]
    assert recip[0].female_parent == base_lines[1]
    assert recip[0].male_parent == base_lines[0]


@pytest.mark.django_db
def test_plan_crosses_skips_self(crossing_block, base_lines):
    """If a germplasm appears in both female and male lists, the self-cross should be skipped."""
    kauz = base_lines[0]
    created = plan_crosses(
        crossing_block,
        female_ids=[kauz.id],
        male_ids=[kauz.id, base_lines[1].id],
    )
    # Only 1 valid cross (KAUZ × PASTOR), self-cross skipped
    assert len(created) == 1
    assert created[0].female_parent == kauz
    assert created[0].male_parent == base_lines[1]


@pytest.mark.django_db
def test_plan_crosses_empty_raises(crossing_block):
    with pytest.raises(ValueError, match="At least one female"):
        plan_crosses(crossing_block, female_ids=[], male_ids=[1])


# ---- execute_cross -----------------------------------------------------------


@pytest.mark.django_db
def test_execute_cross(crossing_block, base_lines):
    created = plan_crosses(
        crossing_block,
        female_ids=[base_lines[0].id],
        male_ids=[base_lines[1].id],
    )
    cross = created[0]

    progeny = execute_cross(cross)

    assert progeny.name == "KAUZ/PASTOR"
    assert progeny.pedigree_string == "KAUZ/PASTOR"
    assert progeny.parent_female == base_lines[0]
    assert progeny.parent_male == base_lines[1]
    assert progeny.cross_type == "biparental"
    assert progeny.program == crossing_block.program

    # Cross should be updated
    cross.refresh_from_db()
    assert cross.status == "pollinated"
    assert cross.progeny == progeny


@pytest.mark.django_db
def test_execute_cross_idempotent(crossing_block, base_lines):
    """Executing the same cross twice should return the same progeny."""
    created = plan_crosses(
        crossing_block,
        female_ids=[base_lines[0].id],
        male_ids=[base_lines[1].id],
    )
    cross = created[0]
    progeny1 = execute_cross(cross)
    progeny2 = execute_cross(cross)
    assert progeny1.id == progeny2.id


# ---- execute_all_crosses -----------------------------------------------------


@pytest.mark.django_db
def test_execute_all_crosses(crossing_block, base_lines):
    plan_crosses(
        crossing_block,
        female_ids=[base_lines[0].id, base_lines[1].id],
        male_ids=[base_lines[2].id],
    )
    created_progeny = execute_all_crosses(crossing_block)
    assert len(created_progeny) == 2
    assert {p.name for p in created_progeny} == {"KAUZ/ATTILA", "PASTOR/ATTILA"}


# ---- generate_crossing_map ---------------------------------------------------


@pytest.mark.django_db
def test_crossing_map_male_first(crossing_block, base_lines):
    plan_crosses(
        crossing_block,
        female_ids=[base_lines[0].id, base_lines[1].id],
        male_ids=[base_lines[2].id, base_lines[3].id],
    )
    map_data = generate_crossing_map(crossing_block)

    # Should have parent markers + crosses
    parent_entries = [e for e in map_data if e["type"] == "parent"]
    cross_entries = [e for e in map_data if e["type"] == "cross"]

    assert len(cross_entries) == 4  # 2×2
    assert len(parent_entries) >= 1  # At least one male marker
    # Positions should be sequential
    positions = [e["position"] for e in map_data]
    assert positions == list(range(1, len(map_data) + 1))


@pytest.mark.django_db
def test_crossing_map_female_first(program, location, base_lines):
    block = CrossingBlock.objects.create(
        name="Female First Block",
        program=program,
        location=location,
        map_pattern="female_first",
    )
    plan_crosses(
        block,
        female_ids=[base_lines[0].id],
        male_ids=[base_lines[1].id, base_lines[2].id],
    )
    map_data = generate_crossing_map(block)

    parent_entries = [e for e in map_data if e["type"] == "parent"]
    cross_entries = [e for e in map_data if e["type"] == "cross"]

    assert len(cross_entries) == 2
    assert len(parent_entries) >= 1
    # First parent marker should reference the female
    assert base_lines[0].name in parent_entries[0]["entry_name"]


# ---- cross code generation ---------------------------------------------------


@pytest.mark.django_db
def test_cross_codes_are_unique(crossing_block, base_lines):
    created = plan_crosses(
        crossing_block,
        female_ids=[base_lines[0].id, base_lines[1].id],
        male_ids=[base_lines[2].id, base_lines[3].id],
    )
    codes = [c.cross_code for c in created]
    assert len(codes) == len(set(codes))  # All unique
    assert all(c.startswith("X-") for c in codes)
