from rest_framework.routers import DefaultRouter

from .viewsets import (
    DiagnosticMarkerViewSet,
    GenomicPredictionViewSet,
    GenotypeDatasetViewSet,
    MarkerScoreViewSet,
)

router = DefaultRouter()
router.register(r"genotype-datasets", GenotypeDatasetViewSet, basename="genotypedataset")
router.register(r"genomic-predictions", GenomicPredictionViewSet, basename="genomicprediction")
router.register(r"diagnostic-markers", DiagnosticMarkerViewSet, basename="diagnosticmarker")
router.register(r"marker-scores", MarkerScoreViewSet, basename="markerscore")

urlpatterns = router.urls
