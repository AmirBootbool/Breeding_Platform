from rest_framework import serializers
from .models import SeedLot, SeedTransaction


class SeedTransactionSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True, default=None
    )
    destination_trial_name = serializers.CharField(
        source="destination_trial.name", read_only=True, default=None
    )

    class Meta:
        model = SeedTransaction
        fields = [
            "id",
            "seed_lot",
            "transaction_type",
            "quantity_grams",
            "transaction_date",
            "destination_trial",
            "destination_trial_name",
            "notes",
            "created_by",
            "created_by_username",
            "created_at",
        ]
        read_only_fields = ["id", "created_by", "created_at"]


class SeedLotSerializer(serializers.ModelSerializer):
    germplasm_name = serializers.CharField(source="germplasm.name", read_only=True)
    germplasm_db_id = serializers.CharField(
        source="germplasm.germplasm_db_id", read_only=True
    )
    program_name = serializers.CharField(source="program.name", read_only=True)
    source_plot_number = serializers.IntegerField(
        source="source_plot.plot_number", read_only=True, default=None
    )
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True, default=None
    )
    is_low_stock = serializers.SerializerMethodField()
    recent_transactions = serializers.SerializerMethodField()

    class Meta:
        model = SeedLot
        fields = [
            "id",
            "germplasm",
            "germplasm_name",
            "germplasm_db_id",
            "program",
            "program_name",
            "lot_code",
            "quantity_grams",
            "seed_count",
            "storage_location",
            "harvest_date",
            "source_plot",
            "source_plot_number",
            "germination_rate",
            "status",
            "is_low_stock",
            "notes",
            "recent_transactions",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_username",
        ]
        read_only_fields = ["id", "lot_code", "created_at", "updated_at", "created_by"]

    def get_is_low_stock(self, obj):
        return obj.quantity_grams < 50.0 and obj.status == "available"

    def get_recent_transactions(self, obj):
        txs = obj.transactions.all().order_by("-created_at")[:5]
        return SeedTransactionSerializer(txs, many=True).data
