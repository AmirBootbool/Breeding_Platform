import pytest

from apps.core.models import Program
from apps.germplasm.models import Cross, Germplasm


@pytest.fixture
def program(db):
    return Program.objects.create(name="Test Program")


@pytest.mark.django_db
def test_germplasm_str(program):
    germplasm = Germplasm.objects.create(
        name="KAUZ", germplasm_db_id="G001", program=program
    )
    assert "KAUZ" in str(germplasm)


@pytest.mark.django_db
def test_germplasm_pedigree_link(program):
    parent_female = Germplasm.objects.create(
        name="KAUZ", germplasm_db_id="G001", program=program
    )
    parent_male = Germplasm.objects.create(
        name="PASTOR", germplasm_db_id="G002", program=program
    )
    progeny = Germplasm.objects.create(
        name="KAUZ/PASTOR",
        germplasm_db_id="G003",
        parent_female=parent_female,
        parent_male=parent_male,
        program=program,
    )

    assert progeny.parent_female == parent_female
    assert progeny.parent_male == parent_male
    assert parent_female.female_progeny.count() == 1


@pytest.mark.django_db
def test_cross_str(program):
    female = Germplasm.objects.create(
        name="KAUZ", germplasm_db_id="G001", program=program
    )
    male = Germplasm.objects.create(
        name="PASTOR", germplasm_db_id="G002", program=program
    )
    cross = Cross.objects.create(
        cross_code="X001",
        female_parent=female,
        male_parent=male,
        cross_date="2026-01-01",
    )
    assert "X001" in str(cross)
    assert "KAUZ" in str(cross)
    assert "PASTOR" in str(cross)


@pytest.mark.django_db
def test_cross_code_unique(program):
    female = Germplasm.objects.create(
        name="KAUZ", germplasm_db_id="G001", program=program
    )
    male = Germplasm.objects.create(
        name="PASTOR", germplasm_db_id="G002", program=program
    )
    Cross.objects.create(
        cross_code="X001",
        female_parent=female,
        male_parent=male,
        cross_date="2026-01-01",
    )
    with pytest.raises(Exception):
        Cross.objects.create(
            cross_code="X001",
            female_parent=female,
            male_parent=male,
            cross_date="2026-01-02",
        )
