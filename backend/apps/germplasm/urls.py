from rest_framework.routers import DefaultRouter

from .crossing_viewsets import CrossingBlockViewSet
from .viewsets import CrossViewSet, GermplasmViewSet

router = DefaultRouter()
router.register(r"germplasm", GermplasmViewSet, basename="germplasm")
router.register(r"crosses", CrossViewSet, basename="cross")
router.register(r"crossing-blocks", CrossingBlockViewSet, basename="crossing-block")

urlpatterns = router.urls

