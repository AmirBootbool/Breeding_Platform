from rest_framework.routers import DefaultRouter

from django.urls import path

from .views import EntityHistoryView, MyPreferencesView, RecentChangesView
from .public_views import public_season_summary
from .viewsets import (
    LocationViewSet,
    ProgramViewSet,
    SeasonViewSet,
    UserProfileViewSet,
    WeatherObservationViewSet,
)

router = DefaultRouter()
router.register(r"programs", ProgramViewSet, basename="program")
router.register(r"locations", LocationViewSet, basename="location")
router.register(r"seasons", SeasonViewSet, basename="season")
router.register(r"user-profiles", UserProfileViewSet, basename="userprofile")
router.register(r"weather", WeatherObservationViewSet, basename="weather")

urlpatterns = router.urls + [
    path("audit/recent_changes/", RecentChangesView.as_view(), name="recent-changes"),
    path("audit/entity_history/", EntityHistoryView.as_view(), name="entity-history"),
    path("me/preferences/", MyPreferencesView.as_view(), name="my-preferences"),
    path("public/shared/<str:token>/", public_season_summary, name="public-season-summary"),
]

