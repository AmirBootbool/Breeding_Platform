from rest_framework.routers import DefaultRouter

from .viewsets import CrossViewSet, GermplasmViewSet

router = DefaultRouter()
router.register(r'germplasm', GermplasmViewSet, basename='germplasm')
router.register(r'crosses', CrossViewSet, basename='cross')

urlpatterns = router.urls
