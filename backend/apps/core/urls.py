from rest_framework.routers import DefaultRouter

from .viewsets import LocationViewSet, ProgramViewSet, SeasonViewSet, UserProfileViewSet

router = DefaultRouter()
router.register(r'programs', ProgramViewSet, basename='program')
router.register(r'locations', LocationViewSet, basename='location')
router.register(r'seasons', SeasonViewSet, basename='season')
router.register(r'user-profiles', UserProfileViewSet, basename='userprofile')

urlpatterns = router.urls
