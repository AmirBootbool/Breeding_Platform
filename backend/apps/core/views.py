from django_prometheus.exports import ExportToDjangoView
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.utils import timezone

from apps.core.models import Location, Program, Season
from apps.germplasm.models import Germplasm, SeedLot, SeedTransaction
from apps.trials.models import ObservationVariable, Trial

from .metrics import refresh_domain_gauges

AUDITED_MODELS = [
    Program,
    Location,
    Season,
    Germplasm,
    Trial,
    ObservationVariable,
    SeedLot,
    SeedTransaction,
]
MODEL_LOOKUP = {m.__name__.lower(): m for m in AUDITED_MODELS}


class AuditLogEntrySerializer(serializers.Serializer):
    model = serializers.CharField()
    id = serializers.IntegerField()
    label = serializers.CharField()
    action = serializers.CharField(allow_null=True)
    created_by = serializers.CharField(allow_null=True)
    updated_by = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField(allow_null=True)


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([AllowAny])
def metrics_view(request):
    refresh_domain_gauges()
    return ExportToDjangoView(request)


class RecentChangesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: AuditLogEntrySerializer(many=True)},
        description="Retrieve a consolidated audit trail of recent changes across core models with filtering.",
    )
    def get(self, request):
        # Enforce admin role check explicitly
        profile = getattr(request.user, "profile", None)
        is_admin = request.user.is_superuser or (profile and profile.role == "admin")
        if not is_admin:
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=403,
            )

        limit = int(request.query_params.get("limit", 50))
        model_param = request.query_params.get("model", "").strip().lower()
        user_param = request.query_params.get("user", "").strip().lower()
        search_param = request.query_params.get("search", "").strip().lower()

        models_to_check = AUDITED_MODELS
        if model_param and model_param in MODEL_LOOKUP:
            models_to_check = [MODEL_LOOKUP[model_param]]

        entries = []
        for model in models_to_check:
            fields = [f.name for f in model._meta.fields]
            order_field = None
            if "updated_at" in fields:
                order_field = "-updated_at"
            elif "created_at" in fields:
                order_field = "-created_at"
            elif "transaction_date" in fields:
                order_field = "-transaction_date"
            else:
                order_field = "-id"

            qs = model.objects.all()
            select_relations = []
            if "created_by" in fields:
                select_relations.append("created_by")
            if "updated_by" in fields:
                select_relations.append("updated_by")
            if "user" in fields:
                select_relations.append("user")
            if select_relations:
                qs = qs.select_related(*select_relations)

            qs = qs.order_by(order_field)[:limit]
            for obj in qs:
                created_at_val = getattr(obj, "created_at", None)
                updated_at_val = getattr(obj, "updated_at", None) or created_at_val
                if not created_at_val and hasattr(obj, "transaction_date"):
                    created_at_val = getattr(obj, "transaction_date", None)
                    updated_at_val = created_at_val

                c_user = None
                if "created_by" in fields:
                    c_user = getattr(obj.created_by, "username", None)
                elif "user" in fields:
                    c_user = getattr(obj.user, "username", None)

                u_user = None
                if "updated_by" in fields:
                    u_user = getattr(obj.updated_by, "username", None)
                elif not u_user:
                    u_user = c_user

                label_val = str(obj)

                # Filter by user if specified
                if user_param:
                    if not (
                        (c_user and user_param in c_user.lower())
                        or (u_user and user_param in u_user.lower())
                    ):
                        continue

                # Filter by search string if specified
                if search_param and search_param not in label_val.lower():
                    continue

                action_val = "created" if created_at_val == updated_at_val else "updated"

                entries.append(
                    {
                        "model": model.__name__,
                        "id": obj.pk,
                        "label": label_val,
                        "action": action_val,
                        "created_by": c_user,
                        "updated_by": u_user,
                        "created_at": created_at_val,
                        "updated_at": updated_at_val,
                    }
                )

        # Sort consolidated entries by updated_at descending
        entries.sort(
            key=lambda e: (
                e["updated_at"]
                if e["updated_at"] is not None
                else timezone.now().replace(year=1970)
            ),
            reverse=True,
        )
        return Response(entries[:limit])


class EntityHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: AuditLogEntrySerializer(many=True)},
        description="Retrieve history of changes for a specific entity.",
    )
    def get(self, request):
        profile = getattr(request.user, "profile", None)
        is_admin = request.user.is_superuser or (profile and profile.role == "admin")
        if not is_admin:
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=403,
            )

        model_name = request.query_params.get("model", "").strip().lower()
        object_id = request.query_params.get("id")

        if not model_name or model_name not in MODEL_LOOKUP:
            return Response(
                {"detail": f"Invalid model. Supported models: {list(MODEL_LOOKUP.keys())}"},
                status=400,
            )
        if not object_id:
            return Response({"detail": "id query parameter is required."}, status=400)

        model = MODEL_LOOKUP[model_name]
        try:
            obj = model.objects.get(pk=object_id)
        except model.DoesNotExist:
            return Response({"detail": f"{model.__name__} #{object_id} not found."}, status=404)

        fields = [f.name for f in model._meta.fields]
        c_user = getattr(obj.created_by, "username", None) if "created_by" in fields else None
        u_user = getattr(obj.updated_by, "username", None) if "updated_by" in fields else c_user
        created_at_val = getattr(obj, "created_at", None)
        updated_at_val = getattr(obj, "updated_at", None) or created_at_val

        history = [
            {
                "model": model.__name__,
                "id": obj.pk,
                "label": str(obj),
                "action": "current_state",
                "created_by": c_user,
                "updated_by": u_user,
                "created_at": created_at_val,
                "updated_at": updated_at_val,
            }
        ]
        return Response(history)
