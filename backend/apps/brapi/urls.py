from rest_framework.routers import DefaultRouter

from django.urls import include, path

from .views import (
    BrapiGermplasmViewSet,
    BrapiObservationVariableViewSet,
    BrapiObservationViewSet,
    BrapiStudyViewSet,
)

router = DefaultRouter(trailing_slash=False)
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

urlpatterns = [
    path("", include(router.urls)),
]
