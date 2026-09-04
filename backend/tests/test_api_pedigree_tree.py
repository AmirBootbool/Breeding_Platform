import pytest
from apps.germplasm.models import Germplasm
from apps.germplasm.services import build_pedigree_tree


@pytest.mark.django_db
def test_build_pedigree_tree_single_node(program):
    """Line with no parents should return single node with generation F0 and None parents."""
    g = Germplasm.objects.create(
        name="FOUNDER_A",
        species="Triticum aestivum",
        program=program,
        generation=0,
        cross_type="unknown",
    )

    tree = build_pedigree_tree(g.id, depth=3)
    assert tree is not None
    assert tree["id"] == g.id
    assert tree["name"] == "FOUNDER_A"
    assert tree["generation_label"] == "F0"
    assert tree["parent_female"] is None
    assert tree["parent_male"] is None


@pytest.mark.django_db
def test_build_pedigree_tree_multi_generational(program):
    """3-generation pedigree should resolve parents and grandparents correctly."""
    # Grandparents
    gm_f = Germplasm.objects.create(name="GM_FEMALE", program=program, generation=0)
    gm_m = Germplasm.objects.create(name="GM_MALE", program=program, generation=0)
    gf_f = Germplasm.objects.create(name="GF_FEMALE", program=program, generation=0)
    gf_m = Germplasm.objects.create(name="GF_MALE", program=program, generation=0)

    # Parents (F1)
    mom = Germplasm.objects.create(
        name="MOTHER_LINE",
        program=program,
        generation=1,
        parent_female=gm_f,
        parent_male=gm_m,
        pedigree_string="GM_FEMALE / GM_MALE",
        cross_type="biparental",
    )
    dad = Germplasm.objects.create(
        name="FATHER_LINE",
        program=program,
        generation=1,
        parent_female=gf_f,
        parent_male=gf_m,
        pedigree_string="GF_FEMALE / GF_MALE",
        cross_type="biparental",
    )

    # Progeny (F2)
    child = Germplasm.objects.create(
        name="CHILD_F2",
        program=program,
        generation=2,
        parent_female=mom,
        parent_male=dad,
        pedigree_string="MOTHER_LINE / FATHER_LINE",
        cross_type="biparental",
    )

    # Depth 1: child with no parents expanded
    tree_d1 = build_pedigree_tree(child.id, depth=1)
    assert tree_d1["id"] == child.id
    assert tree_d1["parent_female"] is None
    assert tree_d1["parent_male"] is None

    # Depth 2: child with mother and father
    tree_d2 = build_pedigree_tree(child.id, depth=2)
    assert tree_d2["parent_female"]["name"] == "MOTHER_LINE"
    assert tree_d2["parent_female"]["generation_label"] == "F1"
    assert tree_d2["parent_female"]["parent_female"] is None
    assert tree_d2["parent_male"]["name"] == "FATHER_LINE"

    # Depth 3: child with mother, father, and all 4 grandparents
    tree_d3 = build_pedigree_tree(child.id, depth=3)
    assert tree_d3["parent_female"]["name"] == "MOTHER_LINE"
    assert tree_d3["parent_female"]["parent_female"]["name"] == "GM_FEMALE"
    assert tree_d3["parent_female"]["parent_male"]["name"] == "GM_MALE"
    assert tree_d3["parent_male"]["parent_female"]["name"] == "GF_FEMALE"
    assert tree_d3["parent_male"]["parent_male"]["name"] == "GF_MALE"


@pytest.mark.django_db
def test_build_pedigree_tree_progeny_direction(program):
    """Progeny direction should return direct and indirect offspring."""
    founder = Germplasm.objects.create(name="PARENT_ROOT", program=program, generation=0)
    f1_a = Germplasm.objects.create(name="F1_PROGENY_A", program=program, generation=1, parent_female=founder)
    f1_b = Germplasm.objects.create(name="F1_PROGENY_B", program=program, generation=1, parent_male=founder)
    f2_c = Germplasm.objects.create(name="F2_PROGENY_C", program=program, generation=2, parent_female=f1_a)

    tree = build_pedigree_tree(founder.id, depth=3, direction="progeny")
    assert tree["name"] == "PARENT_ROOT"
    assert len(tree["progeny"]) == 2
    progeny_names = [p["name"] for p in tree["progeny"]]
    assert "F1_PROGENY_A" in progeny_names
    assert "F1_PROGENY_B" in progeny_names

    f1_a_node = next(p for p in tree["progeny"] if p["name"] == "F1_PROGENY_A")
    assert len(f1_a_node["progeny"]) == 1
    assert f1_a_node["progeny"][0]["name"] == "F2_PROGENY_C"


@pytest.mark.django_db
def test_pedigree_tree_cycle_detection(program):
    """Circular parent relationships should be safely handled without recursion errors."""
    line_a = Germplasm.objects.create(name="LINE_A", program=program, generation=1)
    line_b = Germplasm.objects.create(name="LINE_B", program=program, generation=1, parent_female=line_a)
    
    # Introduce circular reference manually (simulate historical malformed data)
    line_a.parent_female = line_b
    line_a.save()

    # Should terminate safely without infinite recursion
    tree = build_pedigree_tree(line_a.id, depth=5)
    assert tree is not None
    assert tree["parent_female"]["name"] == "LINE_B"


@pytest.mark.django_db
def test_pedigree_tree_api_endpoint(client_for_role, program):
    """GET /api/germplasm/{id}/pedigree_tree/ should be accessible by breeder and viewer."""
    mom = Germplasm.objects.create(name="MOM_LINE", program=program, generation=0)
    dad = Germplasm.objects.create(name="DAD_LINE", program=program, generation=0)
    progeny = Germplasm.objects.create(
        name="OFFSPRING_LINE",
        program=program,
        generation=1,
        parent_female=mom,
        parent_male=dad,
        cross_type="biparental",
    )

    # 1. Breeder request
    breeder_client = client_for_role("breeder")
    response = breeder_client.get(f"/api/germplasm/{progeny.id}/pedigree_tree/?depth=2")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "OFFSPRING_LINE"
    assert data["generation_label"] == "F1"
    assert data["parent_female"]["name"] == "MOM_LINE"
    assert data["parent_male"]["name"] == "DAD_LINE"

    # 2. Viewer request (read-only allowed)
    viewer_client = client_for_role("viewer")
    viewer_resp = viewer_client.get(f"/api/germplasm/{progeny.id}/pedigree_tree/")
    assert viewer_resp.status_code == 200
    assert viewer_resp.json()["name"] == "OFFSPRING_LINE"

    # 3. Non-existent ID returns 404
    missing_resp = viewer_client.get("/api/germplasm/999999/pedigree_tree/")
    assert missing_resp.status_code == 404
