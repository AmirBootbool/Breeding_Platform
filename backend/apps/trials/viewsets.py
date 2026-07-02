from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from django.core.exceptions import ValidationError
from django.db.models import Count

from apps.core.permissions import RoleBasedPermission

from .models import Observation, ObservationVariable, Plot, Trial
from .serializers import (
    ObservationSerializer,
    ObservationVariableSerializer,
    PlotSerializer,
    TrialSerializer,
)
from .services import create_plots_for_trial


class TrialViewSet(viewsets.ModelViewSet):
    serializer_class = TrialSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["name", "trial_code", "program__name"]
    ordering_fields = ["trial_code", "name", "created_at"]

    def get_queryset(self):
        return (
            Trial.objects.select_related("program", "location", "season")
            .annotate(plot_count=Count("plots"))
            .order_by("trial_code")
        )

    @action(detail=True, methods=["post"])
    def create_plots(self, request, pk=None):
        trial = self.get_object()
        germplasm_ids = request.data.get("germplasm_ids")
        seed = request.data.get("seed")

        if germplasm_ids is None:
            germplasm_qs = trial.program.germplasm.all().order_by("name")
        else:
            if not isinstance(germplasm_ids, (list, tuple)):
                germplasm_ids = [germplasm_ids]
            germplasm_qs = trial.program.germplasm.filter(
                id__in=germplasm_ids
            ).order_by("name")
            if germplasm_qs.count() != len(set(germplasm_ids)):
                return Response(
                    {
                        "germplasm_ids": (
                            "One or more germplasm IDs are invalid for this "
                            "trial program."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            created = create_plots_for_trial(trial, germplasm_qs, seed=seed)
        except ValidationError as exc:
            return Response(
                (
                    exc.message_dict
                    if hasattr(exc, "message_dict")
                    else {"detail": exc.messages}
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PlotSerializer(
            created, many=True, context=self.get_serializer_context()
        )
        return Response(
            {
                "trial": trial.trial_code,
                "created_count": len(created),
                "plots": serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


class PlotViewSet(viewsets.ModelViewSet):
    serializer_class = PlotSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    role_action_permissions = {
        "create": {"admin", "breeder"},
        "update": {"admin", "breeder", "technician"},
        "partial_update": {"admin", "breeder", "technician"},
        "destroy": {"admin", "breeder"},
    }
    search_fields = ["trial__trial_code", "germplasm__name"]
    ordering_fields = ["plot_number", "rep", "status"]

    def get_queryset(self):
        return Plot.objects.select_related("trial", "germplasm").all()


class ObservationVariableViewSet(viewsets.ModelViewSet):
    serializer_class = ObservationVariableSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["name", "variable_code", "description"]
    ordering_fields = ["name", "data_type", "created_at"]

    def get_queryset(self):
        return ObservationVariable.objects.all().order_by("name")


class ObservationViewSet(viewsets.ModelViewSet):
    serializer_class = ObservationSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder", "technician"}
    search_fields = [
        "plot__trial__trial_code",
        "plot__germplasm__name",
        "variable__name",
    ]
    ordering_fields = ["created_at", "observation_time"]

    def get_queryset(self):
        return Observation.objects.select_related(
            "plot__trial", "plot__germplasm", "variable"
        ).all()
