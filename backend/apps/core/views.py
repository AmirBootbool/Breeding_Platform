from django.utils import timezone
from rest_framework import serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import api_view, permission_classes
from drf_spectacular.utils import extend_schema
from django_prometheus.exports import ExportToDjangoView

from apps.core.models import Program, Location, Season
from apps.germplasm.models import Germplasm
from apps.trials.models import Trial, ObservationVariable
from .metrics import refresh_domain_gauges

AUDITED_MODELS = [Program, Location, Season, Germplasm, Trial, ObservationVariable]


class AuditLogEntrySerializer(serializers.Serializer):
    model = serializers.CharField()
    id = serializers.IntegerField()
    label = serializers.CharField()
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
        description="Retrieve a consolidated audit trail of recent changes across core models."
    )
    def get(self, request):
        # Enforce admin role check explicitly
        profile = getattr(request.user, "profile", None)
        is_admin = request.user.is_superuser or (profile and profile.role == "admin")
        if not is_admin:
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=403
            )

        limit = int(request.query_params.get("limit", 50))
        entries = []
        for model in AUDITED_MODELS:
            fields = [f.name for f in model._meta.fields]
            order_field = None
            if "updated_at" in fields:
                order_field = "-updated_at"
            elif "created_at" in fields:
                order_field = "-created_at"
            else:
                order_field = "-id"

            qs = model.objects.all()
            select_relations = []
            if "created_by" in fields:
                select_relations.append("created_by")
            if "updated_by" in fields:
                select_relations.append("updated_by")
            if select_relations:
                qs = qs.select_related(*select_relations)

            qs = qs.order_by(order_field)[:limit]
            for obj in qs:
                created_at_val = getattr(obj, "created_at", None)
                updated_at_val = getattr(obj, "updated_at", None) or created_at_val
                entries.append({
                    "model": model.__name__,
                    "id": obj.pk,
                    "label": str(obj),
                    "created_by": getattr(obj.created_by, "username", None) if "created_by" in fields else None,
                    "updated_by": getattr(obj.updated_by, "username", None) if "updated_by" in fields else None,
                    "created_at": created_at_val,
                    "updated_at": updated_at_val,
                })

        # Sort the consolidated list across all models by updated_at descending, treating None as epoch start
        entries.sort(
            key=lambda e: e["updated_at"] if e["updated_at"] is not None else timezone.now().replace(year=1970),
            reverse=True
        )
        return Response(entries[:limit])
