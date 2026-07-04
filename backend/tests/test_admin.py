from django.contrib import admin

from apps.core.models import Location, Program, Season, UserProfile
from apps.germplasm.models import Cross, Germplasm
from apps.trials.models import Observation, ObservationVariable, Plot, Trial


def test_domain_models_are_registered_in_admin():
    expected_models = [
        Program,
        Location,
        Season,
        UserProfile,
        Germplasm,
        Cross,
        Trial,
        Plot,
        ObservationVariable,
        Observation,
    ]

    for model in expected_models:
        assert model in admin.site._registry


def test_admin_readonly_generated_fields():
    readonly_expectations = {
        Program: {"created_at"},
        UserProfile: {"created_at", "updated_at"},
        Germplasm: {"created_at", "updated_at"},
        Cross: {"created_at", "updated_at"},
        Trial: {"created_at", "updated_at"},
        ObservationVariable: {"created_at"},
        Observation: {"created_at"},
    }

    for model, expected_fields in readonly_expectations.items():
        model_admin = admin.site._registry[model]

        assert expected_fields.issubset(set(model_admin.readonly_fields))


def test_admin_search_and_filter_fields_cover_main_workflows():
    program_admin = admin.site._registry[Program]
    germplasm_admin = admin.site._registry[Germplasm]
    trial_admin = admin.site._registry[Trial]
    observation_admin = admin.site._registry[Observation]

    assert "name" in program_admin.search_fields
    assert {"name", "germplasm_db_id"}.issubset(set(germplasm_admin.search_fields))
    assert {"program", "cross_type"}.issubset(set(germplasm_admin.list_filter))
    assert {"name", "trial_code"}.issubset(set(trial_admin.search_fields))
    assert {"design_type", "program", "location", "season"}.issubset(
        set(trial_admin.list_filter)
    )
    assert {
        "plot__trial__trial_code",
        "plot__germplasm__name",
        "variable__name",
    }.issubset(set(observation_admin.search_fields))


def test_admin_inlines_and_actions():
    trial_admin = admin.site._registry[Trial]
    plot_admin = admin.site._registry[Plot]
    germplasm_admin = admin.site._registry[Germplasm]

    # Verify Inlines
    inline_classes = [inline.__name__ for inline in trial_admin.inlines]
    assert "PlotInline" in inline_classes

    plot_inline_classes = [inline.__name__ for inline in plot_admin.inlines]
    assert "ObservationInline" in plot_inline_classes

    # Verify Actions
    assert "export_to_csv" in trial_admin.actions
    assert "export_to_csv" in germplasm_admin.actions
    assert "make_planted" in plot_admin.actions
    assert "make_harvested" in plot_admin.actions
    assert "make_discarded" in plot_admin.actions
