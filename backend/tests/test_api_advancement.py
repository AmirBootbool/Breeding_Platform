import pytest
from apps.germplasm.models import Germplasm
from apps.trials.models import Plot, Trial
from apps.trials.services import advance_plots


@pytest.fixture
def advance_trial_setup(program, location, season):
    trial = Trial.objects.create(
        name="Advancement Test Trial",
        trial_code="TR-ADV-01",
        program=program,
        location=location,
        season=season,
        design_type="RCBD",
        num_reps=1,
    )

    g1 = Germplasm.objects.create(
        name="Parent-F2",
        pedigree_string="LineA/LineB-F2",
        program=program,
        generation=2,
    )
    g2 = Germplasm.objects.create(
        name="Parent-F4",
        pedigree_string="LineC/LineD-F4",
        program=program,
        generation=4,
    )

    p1 = Plot.objects.create(trial=trial, germplasm=g1, rep=1, plot_number=101)
    p2 = Plot.objects.create(trial=trial, germplasm=g2, rep=1, plot_number=102)

    return trial, [p1, p2], [g1, g2]


@pytest.mark.django_db
def test_advance_plots_ssd_service(advance_trial_setup):
    trial, plots, germplasms = advance_trial_setup

    created_ids = advance_plots(
        plot_ids=[plots[0].id],
        selections_per_plot=1,
        selection_method="SSD",
    )

    assert len(created_ids) == 1
    new_germ = Germplasm.objects.get(id=created_ids[0])

    assert new_germ.name == "Parent-F3-SSD"
    assert new_germ.pedigree_string == "LineA/LineB-F3-SSD"
    assert new_germ.generation == 3
    assert new_germ.parent_female == germplasms[0]
    assert new_germ.cross_type == "self"


@pytest.mark.django_db
def test_advance_plots_multi_selection_service(advance_trial_setup):
    trial, plots, germplasms = advance_trial_setup

    created_ids = advance_plots(
        plot_ids=[plots[0].id],
        selections_per_plot=3,
        selection_method="SSD",
    )

    assert len(created_ids) == 3
    new_germs = list(Germplasm.objects.filter(id__in=created_ids).order_by("name"))

    assert [g.name for g in new_germs] == [
        "Parent-F3-SSD1",
        "Parent-F3-SSD2",
        "Parent-F3-SSD3",
    ]
    for g in new_germs:
        assert g.generation == 3
        assert g.parent_female == germplasms[0]


@pytest.mark.django_db
def test_advance_plots_bulk_service(advance_trial_setup):
    trial, plots, germplasms = advance_trial_setup

    created_ids = advance_plots(
        plot_ids=[plots[1].id],
        selections_per_plot=1,
        selection_method="Bulk",
    )

    assert len(created_ids) == 1
    new_germ = Germplasm.objects.get(id=created_ids[0])

    assert new_germ.name == "Parent-F5-BLK"
    assert new_germ.pedigree_string == "LineC/LineD-F5-BLK"
    assert new_germ.generation == 5
    assert new_germ.parent_female == germplasms[1]


@pytest.mark.django_db
def test_advance_plots_api_endpoint(client_for_role, advance_trial_setup):
    client = client_for_role("breeder")
    trial, plots, _ = advance_trial_setup

    payload = {
        "plot_ids": [plots[0].id, plots[1].id],
        "selections_per_plot": 1,
        "selection_method": "Single Spike",
    }

    response = client.post(f"/api/trials/{trial.id}/advance_plots/", payload, format="json")
    assert response.status_code == 201
    assert response.data["created_count"] == 2
    assert len(response.data["created_ids"]) == 2

    # Verify lines created in DB
    created = Germplasm.objects.filter(id__in=response.data["created_ids"])
    assert created.count() == 2
    names = set(created.values_list("name", flat=True))
    assert "Parent-F3-SS" in names
    assert "Parent-F5-SS" in names


@pytest.mark.django_db
def test_advance_plots_api_rbac_viewer_forbidden(client_for_role, advance_trial_setup):
    viewer_client = client_for_role("viewer")
    trial, plots, _ = advance_trial_setup

    payload = {
        "plot_ids": [plots[0].id],
        "selections_per_plot": 1,
        "selection_method": "SSD",
    }

    response = viewer_client.post(f"/api/trials/{trial.id}/advance_plots/", payload, format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_advance_plots_invalid_payload(client_for_role, advance_trial_setup):
    client = client_for_role("breeder")
    trial, _, _ = advance_trial_setup

    # Empty plot_ids
    response = client.post(f"/api/trials/{trial.id}/advance_plots/", {"plot_ids": []}, format="json")
    assert response.status_code == 400
