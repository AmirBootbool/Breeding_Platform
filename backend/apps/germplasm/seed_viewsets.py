from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.exceptions import ValidationError

from apps.core.permissions import RoleBasedPermission
from .models import SeedLot, SeedTransaction
from .seed_serializers import SeedLotSerializer, SeedTransactionSerializer
from .seed_services import record_seed_transaction, build_barcode_label_data


class SeedLotViewSet(viewsets.ModelViewSet):
    queryset = SeedLot.objects.select_related(
        "germplasm", "program", "source_plot"
    ).prefetch_related("transactions").all()
    serializer_class = SeedLotSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder", "technician"}
    search_fields = ["lot_code", "germplasm__name", "storage_location"]
    ordering_fields = ["lot_code", "quantity_grams", "created_at", "harvest_date"]
    filterset_fields = ["program", "germplasm", "status", "storage_location"]

    def perform_create(self, serializer):
        seed_lot = serializer.save(
            created_by=self.request.user, updated_by=self.request.user
        )
        if seed_lot.quantity_grams > 0:
            SeedTransaction.objects.create(
                seed_lot=seed_lot,
                transaction_type="initial_deposit",
                quantity_grams=seed_lot.quantity_grams,
                notes="Initial lot registration deposit",
                created_by=self.request.user,
            )

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="adjust")
    def adjust_inventory(self, request, pk=None):
        seed_lot = self.get_object()
        tx_type = request.data.get("transaction_type", "adjustment")
        quantity = request.data.get("quantity_grams")
        notes = request.data.get("notes", "")
        trial_id = request.data.get("destination_trial")

        if quantity is None:
            return Response(
                {"detail": "quantity_grams is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            quantity = float(quantity)
        except (ValueError, TypeError):
            return Response(
                {"detail": "quantity_grams must be a valid number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        destination_trial = None
        if trial_id:
            from apps.trials.models import Trial
            destination_trial = Trial.objects.filter(pk=trial_id).first()

        try:
            tx = record_seed_transaction(
                seed_lot=seed_lot,
                transaction_type=tx_type,
                quantity_grams=quantity,
                destination_trial=destination_trial,
                notes=notes,
                user=request.user,
            )
        except ValidationError as e:
            return Response(
                {"detail": str(e.message if hasattr(e, "message") else e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        seed_lot.refresh_from_db()
        return Response(
            {
                "status": "success",
                "transaction": SeedTransactionSerializer(tx).data,
                "seed_lot": SeedLotSerializer(seed_lot).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"], url_path="label")
    def label_data(self, request, pk=None):
        seed_lot = self.get_object()
        data = build_barcode_label_data(seed_lot)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="low_stock")
    def low_stock(self, request):
        threshold = float(request.query_params.get("threshold", 50.0))
        lots = self.get_queryset().filter(
            quantity_grams__lt=threshold, status="available"
        )
        serializer = self.get_serializer(lots, many=True)
        return Response(serializer.data)


class SeedTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SeedTransaction.objects.select_related(
        "seed_lot__germplasm", "destination_trial", "created_by"
    ).all()
    serializer_class = SeedTransactionSerializer
    permission_classes = [RoleBasedPermission]
    search_fields = ["seed_lot__lot_code", "seed_lot__germplasm__name", "notes"]
    ordering_fields = ["transaction_date", "created_at"]
    filterset_fields = ["seed_lot", "transaction_type", "destination_trial"]
