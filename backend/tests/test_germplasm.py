import pytest

from apps.core.models import Program
from apps.germplasm.models import Cross, Germplasm


@pytest.mark.django_db
def test_germplasm_parents_and_cross():
    program = Program.objects.create(name="GP")

    female = Germplasm.objects.create(name="F1", germplasm_db_id="F1", program=program)
    male = Germplasm.objects.create(name="M1", germplasm_db_id="M1", program=program)

    cross = Cross.objects.create(
        cross_code="C001",
        female_parent=female,
        male_parent=male,
        cross_date="2026-01-01",
    )

    # progeny referencing parents
    progeny = Germplasm.objects.create(
        name="P1",
        germplasm_db_id="P1",
        parent_female=female,
        parent_male=male,
        program=program,
    )

    assert cross.female_parent == female
    assert cross.male_parent == male
    assert progeny.parent_female == female
    assert progeny.parent_male == male
    assert cross.created_at is not None
    assert cross.updated_at is not None

    # unique constraint on germplasm_db_id
    with pytest.raises(Exception):
        Germplasm.objects.create(name="Dup", germplasm_db_id="F1", program=program)
