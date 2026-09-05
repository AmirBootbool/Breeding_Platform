from rest_framework.routers import DefaultRouter

from django.urls import path

from .views import EntityHistoryView, RecentChangesView
from .viewsets import LocationViewSet, ProgramViewSet, SeasonViewSet, UserProfileViewSet

router = DefaultRouter()
router.register(r"programs", ProgramViewSet, basename="program")
router.register(r"locations", LocationViewSet, basename="location")
router.register(r"seasons", SeasonViewSet, basename="season")
router.register(r"user-profiles", UserProfileViewSet, basename="userprofile")

urlpatterns = router.urls + [
    path("audit/recent_changes/", RecentChangesView.as_view(), name="recent-changes"),
    path("audit/entity_history/", EntityHistoryView.as_view(), name="entity-history"),
]
