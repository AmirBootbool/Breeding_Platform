from rest_framework.routers import DefaultRouter

from .viewsets import ObservationVariableViewSet, ObservationViewSet, PlotViewSet, TrialViewSet

router = DefaultRouter()
router.register(r'trials', TrialViewSet, basename='trial')
router.register(r'plots', PlotViewSet, basename='plot')
router.register(r'observation-variables', ObservationVariableViewSet, basename='observationvariable')
router.register(r'observations', ObservationViewSet, basename='observation')

urlpatterns = router.urls
