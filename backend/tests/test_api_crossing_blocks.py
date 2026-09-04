import pytest
from apps.germplasm.models import CrossingBlock, Cross, Germplasm


@pytest.mark.django_db
def test_create_crossing_block(client_for_role, program, location, season):
    client = client_for_role("breeder")

    payload = {
        "name": "Wheat Crossing Block 2026",
        "program": program.id,
        "location": location.id,
        "season": season.id,
        "map_pattern": "alternating",
        "include_reciprocals": False,
        "notes": "Main spring wheat crosses",
    }

    response = client.post("/api/crossing-blocks/", payload)
    assert response.status_code == 201
    assert response.data["name"] == "Wheat Crossing Block 2026"
    assert response.data["map_pattern"] == "alternating"
    assert response.data["cross_count"] == 0


@pytest.mark.django_db
def test_plan_crosses_api(client_for_role, program, location, season, germplasm, second_germplasm):
    client = client_for_role("breeder")

    # Create crossing block
    block = CrossingBlock.objects.create(
        name="CB-2026",
        program=program,
        location=location,
        season=season,
        include_reciprocals=True,
    )

    third_germplasm = Germplasm.objects.create(
        name="Line C",
        germplasm_db_id="G003",
        program=program,
    )

    payload = {
        "female_ids": [germplasm.id],
        "male_ids": [second_germplasm.id, third_germplasm.id],
    }

    response = client.post(f"/api/crossing-blocks/{block.id}/plan_crosses/", payload)
    assert response.status_code == 201
    # 1 female * 2 males = 2 direct + 2 reciprocals = 4 crosses
    assert response.data["created_count"] == 4
    assert len(response.data["crosses"]) == 4

    # Verify database entries
    assert Cross.objects.filter(crossing_block=block).count() == 4
    direct_cross = Cross.objects.get(
        crossing_block=block, female_parent=germplasm, male_parent=second_germplasm, is_reciprocal=False
    )
    assert direct_cross.status == "planned"
    assert direct_cross.cross_code is not None


@pytest.mark.django_db
def test_execute_all_crosses_api(client_for_role, program, location, season, germplasm, second_germplasm):
    client = client_for_role("breeder")

    block = CrossingBlock.objects.create(
        name="CB-Execute-Test",
        program=program,
        location=location,
        season=season,
        include_reciprocals=False,
    )

    # Plan crosses
    client.post(
        f"/api/crossing-blocks/{block.id}/plan_crosses/",
        {"female_ids": [germplasm.id], "male_ids": [second_germplasm.id]},
    )

    # Execute all crosses
    response = client.post(f"/api/crossing-blocks/{block.id}/execute_all/")
    assert response.status_code == 200
    assert response.data["executed_count"] == 1
    assert len(response.data["progeny"]) == 1

    progeny_id = response.data["progeny"][0]["id"]
    progeny = Germplasm.objects.get(id=progeny_id)

    assert progeny.parent_female == germplasm
    assert progeny.parent_male == second_germplasm
    assert progeny.pedigree_string == f"{germplasm.name}/{second_germplasm.name}"
    assert progeny.cross_type == "biparental"
    assert progeny.generation == 1  # F1

    # Cross entry should now be marked harvested/pollinated/completed
    entry = Cross.objects.get(crossing_block=block, female_parent=germplasm, male_parent=second_germplasm)
    assert entry.progeny == progeny


@pytest.mark.django_db
def test_crossing_map_and_csv_export_api(client_for_role, program, location, season, germplasm, second_germplasm):
    client = client_for_role("breeder")

    block = CrossingBlock.objects.create(
        name="CB-Map-Test",
        program=program,
        location=location,
        season=season,
    )

    client.post(
        f"/api/crossing-blocks/{block.id}/plan_crosses/",
        {"female_ids": [germplasm.id], "male_ids": [second_germplasm.id]},
    )

    # Get crossing map JSON
    map_response = client.get(f"/api/crossing-blocks/{block.id}/crossing_map/")
    assert map_response.status_code == 200
    assert "map" in map_response.data
    assert len(map_response.data["map"]) > 0

    # Export crossing map CSV
    export_response = client.get(f"/api/crossing-blocks/{block.id}/export_map/")
    assert export_response.status_code == 200
    assert export_response["Content-Type"].startswith("text/csv")
    content = export_response.content.decode("utf-8")
    assert "Position,Type,Entry,Cross Code,Female,Male" in content
    assert germplasm.name in content


@pytest.mark.django_db
def test_crossing_block_rbac_viewer(client_for_role, program, location, season):
    viewer_client = client_for_role("viewer")

    payload = {
        "name": "Unauthorized Block",
        "program": program.id,
        "location": location.id,
        "season": season.id,
    }

    # Viewer cannot create crossing block
    create_response = viewer_client.post("/api/crossing-blocks/", payload)
    assert create_response.status_code == 403

    # Create block as breeder
    block = CrossingBlock.objects.create(
        name="Existing Block",
        program=program,
        location=location,
        season=season,
    )

    # Viewer can view crossing block
    detail_response = viewer_client.get(f"/api/crossing-blocks/{block.id}/")
    assert detail_response.status_code == 200

    # Viewer cannot execute crosses
    exec_response = viewer_client.post(f"/api/crossing-blocks/{block.id}/execute_all/")
    assert exec_response.status_code == 403
