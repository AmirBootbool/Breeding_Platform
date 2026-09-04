import csv
import io

from django.db.models import Count
from django.http import HttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import RoleBasedPermission
from apps.germplasm.crossing_serializers import (
    CrossingBlockDetailSerializer,
    CrossingBlockListSerializer,
    CrossEntrySerializer,
    PlanCrossesRequestSerializer,
)
from apps.germplasm.crossing_service import (
    execute_all_crosses,
    generate_crossing_map,
    plan_crosses,
)
from apps.germplasm.models import CrossingBlock


class CrossingBlockViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    filterset_fields = ["program"]

    def get_queryset(self):
        return (
            CrossingBlock.objects.select_related(
                "program", "location", "season"
            )
            .annotate(cross_count=Count("crosses"))
            .all()
        )

    def get_serializer_class(self):
        if self.action == "retrieve":
            return CrossingBlockDetailSerializer
        return CrossingBlockListSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    # ---------- Custom actions -------------------------------------------------

    @action(detail=True, methods=["post"], url_path="plan_crosses")
    def plan_crosses(self, request, pk=None):
        """Bulk-plan crosses from female/male ID lists."""
        block = self.get_object()

        ser = PlanCrossesRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        try:
            created = plan_crosses(
                block,
                female_ids=ser.validated_data["female_ids"],
                male_ids=ser.validated_data["male_ids"],
            )
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)

        return Response(
            {
                "created_count": len(created),
                "crosses": CrossEntrySerializer(created, many=True).data,
            },
            status=201,
        )

    @action(detail=True, methods=["post"], url_path="execute_all")
    def execute_all(self, request, pk=None):
        """Execute all planned crosses, creating progeny germplasm."""
        block = self.get_object()
        created = execute_all_crosses(block, user=request.user)
        return Response(
            {
                "executed_count": len(created),
                "progeny": [
                    {"id": g.id, "name": g.name, "germplasm_db_id": g.germplasm_db_id}
                    for g in created
                ],
            },
            status=200,
        )

    @action(detail=True, methods=["get"], url_path="crossing_map")
    def crossing_map(self, request, pk=None):
        """Return ordered crossing map for field layout."""
        block = self.get_object()
        map_data = generate_crossing_map(block)
        return Response({"map": map_data})

    @action(detail=True, methods=["get"], url_path="export_map")
    def export_map(self, request, pk=None):
        """Export crossing map as CSV for printing."""
        block = self.get_object()
        map_data = generate_crossing_map(block)

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response[
            "Content-Disposition"
        ] = f'attachment; filename="crossing_map_{block.name}.csv"'

        writer = csv.writer(response)
        writer.writerow(
            ["Position", "Type", "Entry", "Cross Code", "Female", "Male"]
        )
        for entry in map_data:
            writer.writerow(
                [
                    entry["position"],
                    entry["type"],
                    entry["entry_name"],
                    entry.get("cross_code", ""),
                    entry.get("female_name", ""),
                    entry.get("male_name", ""),
                ]
            )

        return response
