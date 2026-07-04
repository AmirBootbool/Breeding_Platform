from rest_framework.routers import DefaultRouter

from django.urls import include, path

from .views import (
    BrapiGermplasmViewSet,
    BrapiLocationViewSet,
    BrapiObservationUnitViewSet,
    BrapiObservationVariableViewSet,
    BrapiObservationViewSet,
    BrapiProgramViewSet,
    BrapiServerInfoViewSet,
    BrapiStudyViewSet,
)

router = DefaultRouter(trailing_slash=False)
router.register("serverinfo", BrapiServerInfoViewSet, basename="brapi-serverinfo")
router.register("studies", BrapiStudyViewSet, basename="brapi-studies")
router.register("germplasm", BrapiGermplasmViewSet, basename="brapi-germplasm")
router.register("observations", BrapiObservationViewSet, basename="brapi-observations")
router.register(
    "observationvariables",
    BrapiObservationVariableViewSet,
    basename="brapi-observationvariables",
)
router.register(
    "variables",
    BrapiObservationVariableViewSet,
    basename="brapi-variables",
)
router.register("locations", BrapiLocationViewSet, basename="brapi-locations")
router.register("programs", BrapiProgramViewSet, basename="brapi-programs")
router.register(
    "observationunits", BrapiObservationUnitViewSet, basename="brapi-observationunits"
)

urlpatterns = [
    path("", include(router.urls)),
]
