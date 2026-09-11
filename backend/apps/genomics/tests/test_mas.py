import pytest
from apps.core.models import Program
from apps.germplasm.models import Germplasm
from apps.genomics.models import DiagnosticMarker, MarkerScore
from apps.genomics.services import (
    compute_mas_stacking_matrix,
    seed_default_wheat_markers,
)


@pytest.mark.django_db
def test_seed_default_wheat_markers():
    program = Program.objects.create(name="Winter Wheat Program", crop="wheat")
    seeded = seed_default_wheat_markers(program=program)

    assert len(seeded) >= 6
    marker_names = [m.name for m in seeded]
    assert "csLV34" in marker_names
    assert "Fhb1-SNP" in marker_names
    assert "Rht-B1_SNP" in marker_names


@pytest.mark.django_db
def test_mas_stacking_matrix():
    program = Program.objects.create(name="Spring Wheat", crop="wheat")
    seed_default_wheat_markers(program=program)

    g1 = Germplasm.objects.create(name="Elite_Line_A", program=program)
    g2 = Germplasm.objects.create(name="Susceptible_Line_B", program=program)

    m1 = DiagnosticMarker.objects.get(name="csLV34")
    m2 = DiagnosticMarker.objects.get(name="Fhb1-SNP")

    MarkerScore.objects.create(marker=m1, germplasm=g1, call_status="favorable")
    MarkerScore.objects.create(marker=m2, germplasm=g1, call_status="favorable")

    MarkerScore.objects.create(marker=m1, germplasm=g2, call_status="unfavorable")
    MarkerScore.objects.create(marker=m2, germplasm=g2, call_status="heterozygous")

    res = compute_mas_stacking_matrix(germplasm_ids=[g1.id, g2.id], program_id=program.id)

    assert res["total_markers"] >= 2
    assert len(res["lines"]) == 2

    # Elite line A should have higher stacking score
    line_a = next(l for l in res["lines"] if l["germplasm_id"] == g1.id)
    line_b = next(l for l in res["lines"] if l["germplasm_id"] == g2.id)

    assert line_a["favorable_count"] >= 2
    assert line_a["stacking_score"] > line_b["stacking_score"]
