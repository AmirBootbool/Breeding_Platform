import pytest
from apps.core.models import Program, Location
from apps.germplasm.models import Germplasm
from apps.germplasm.services import advance_generation

@pytest.fixture
def base_germplasm(db):
    program = Program.objects.create(name="Test Program")
    g1 = Germplasm.objects.create(name="ParentA", program=program)
    g2 = Germplasm.objects.create(name="ParentB", program=program)
    return [g1, g2]

@pytest.mark.django_db
def test_advance_generation_bulk(base_germplasm):
    created = advance_generation(base_germplasm, method="bulk")
    assert len(created) == 2
    assert created[0].name == "ParentA-B"
    assert created[0].parent_female == base_germplasm[0]
    assert created[0].cross_type == "self"
    
    assert created[1].name == "ParentB-B"
    assert created[1].parent_female == base_germplasm[1]

@pytest.mark.django_db
def test_advance_generation_ssd(base_germplasm):
    created = advance_generation(base_germplasm, method="ssd", ssd_count=3)
    assert len(created) == 6
    names = [c.name for c in created]
    assert "ParentA-1" in names
    assert "ParentA-2" in names
    assert "ParentA-3" in names
    assert "ParentB-1" in names
    
    # Check parent linkage
    assert created[0].parent_female == base_germplasm[0]
