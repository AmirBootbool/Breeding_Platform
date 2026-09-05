from rest_framework.routers import DefaultRouter

from .crossing_viewsets import CrossingBlockViewSet
from .seed_viewsets import SeedLotViewSet, SeedTransactionViewSet
from .viewsets import CrossViewSet, GermplasmViewSet

router = DefaultRouter()
router.register(r"germplasm", GermplasmViewSet, basename="germplasm")
router.register(r"crosses", CrossViewSet, basename="cross")
router.register(r"crossing-blocks", CrossingBlockViewSet, basename="crossing-block")
router.register(r"seed-lots", SeedLotViewSet, basename="seed-lot")
router.register(r"seed-transactions", SeedTransactionViewSet, basename="seed-transaction")

urlpatterns = router.urls

