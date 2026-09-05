from rest_framework.routers import DefaultRouter

from .viewsets import (
    AnalysisSetViewSet,
    ObservationVariableViewSet,
    ObservationViewSet,
    PlotViewSet,
    TraitPanelViewSet,
    TrialViewSet,
)

router = DefaultRouter()
router.register(r"trials", TrialViewSet, basename="trial")
router.register(r"plots", PlotViewSet, basename="plot")
router.register(
    r"observation-variables", ObservationVariableViewSet, basename="observationvariable"
)
router.register(r"observations", ObservationViewSet, basename="observation")
router.register(r"analysis-sets", AnalysisSetViewSet, basename="analysisset")
router.register(r"trait-panels", TraitPanelViewSet, basename="traitpanel")

urlpatterns = router.urls
