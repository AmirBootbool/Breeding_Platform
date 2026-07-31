import csv
import io

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from django.db import transaction
from django.db.models import Count
from django.http import StreamingHttpResponse

from apps.core.permissions import RoleBasedPermission

from .models import Observation, ObservationVariable, Plot, Trial
from .serializers import (
    ObservationSerializer,
    ObservationVariableSerializer,
    PlotSerializer,
    TrialSerializer,
)
from .services import compute_trial_summary, create_plots_for_trial


class TrialViewSet(viewsets.ModelViewSet):
    serializer_class = TrialSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["name", "trial_code", "program__name"]
    ordering_fields = ["trial_code", "name", "created_at"]
    filterset_fields = ["program", "season", "location", "design_type"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

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
                from rest_framework.exceptions import (
                    ValidationError as DRFValidationError,
                )

                raise DRFValidationError(
                    {
                        "germplasm_ids": (
                            "One or more germplasm IDs are invalid for this "
                            "trial program."
                        )
                    }
                )

        created = create_plots_for_trial(trial, germplasm_qs, seed=seed)

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

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        trial = self.get_object()
        stats = compute_trial_summary(trial)
        return Response({"trial": trial.trial_code, "summary": stats})

    @action(detail=True, methods=["get"])
    def export_csv(self, request, pk=None):
        """Stream trial observations as a CSV download."""
        trial = self.get_object()
        observations = (
            Observation.objects.filter(plot__trial=trial)
            .select_related("plot__germplasm", "variable")
            .order_by("plot__plot_number", "variable__name")
        )

        headers = [
            "plot_number",
            "germplasm_name",
            "rep",
            "variable_name",
            "value_numeric",
            "value_text",
            "value_date",
            "observation_time",
            "notes",
        ]

        def generate():
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(headers)
            yield buf.getvalue()
            for obs in observations:
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(
                    [
                        obs.plot.plot_number,
                        obs.plot.germplasm.name,
                        obs.plot.rep,
                        obs.variable.name,
                        obs.value_numeric if obs.value_numeric is not None else "",
                        obs.value_text or "",
                        obs.value_date if obs.value_date is not None else "",
                        (
                            obs.observation_time.isoformat()
                            if obs.observation_time
                            else ""
                        ),
                        obs.notes or "",
                    ]
                )
                yield buf.getvalue()

        filename = f"{trial.trial_code}_observations.csv"
        response = StreamingHttpResponse(generate(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=["get"])
    def export_fieldbook(self, request, pk=None):
        """Stream a Field Book compatible CSV download for this trial."""
        trial = self.get_object()
        plots = (
            Plot.objects.filter(trial=trial)
            .select_related("germplasm")
            .order_by("plot_number")
        )
        variables = list(ObservationVariable.objects.all().order_by("name"))
        var_names = [v.name for v in variables]

        def generate():
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(["plot_id", "range", "plot", "entry"] + var_names)
            yield buf.getvalue()
            for plot in plots:
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(
                    [
                        plot.plot_number,
                        plot.rep,
                        plot.plot_number,
                        plot.germplasm.name,
                    ]
                    + [""] * len(variables)
                )
                yield buf.getvalue()

        filename = f"{trial.trial_code}_fieldbook.csv"
        response = StreamingHttpResponse(generate(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


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
    filterset_fields = ["trial", "germplasm", "rep", "status"]

    def get_queryset(self):
        return (
            Plot.objects.select_related("trial", "germplasm")
            .all()
            .order_by("trial", "plot_number")
        )


class ObservationVariableViewSet(viewsets.ModelViewSet):
    serializer_class = ObservationVariableSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["name", "variable_code", "description"]
    ordering_fields = ["name", "data_type", "created_at"]
    filterset_fields = ["data_type", "is_required"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

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
    filterset_fields = ["plot", "variable", "plot__trial"]

    def get_queryset(self):
        return Observation.objects.select_related(
            "plot__trial", "plot__germplasm", "variable"
        ).all()

    @action(detail=False, methods=["post"], url_path="bulk_create")
    def bulk_create(self, request):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError as DRFValidationError

        rows = request.data.get("observations", [])
        created = []
        errors = []

        with transaction.atomic():
            for i, row in enumerate(rows):
                serializer = self.get_serializer(data=row)
                if serializer.is_valid():
                    try:
                        serializer.save()
                        created.append(serializer.data)
                    except (DjangoValidationError, DRFValidationError) as exc:
                        detail = exc.message_dict if hasattr(exc, "message_dict") else str(exc)
                        errors.append({"index": i, "detail": detail})
                else:
                    errors.append({"index": i, "detail": serializer.errors})

            if errors:
                transaction.set_rollback(True)

        status_code = 201 if not errors else 400
        return Response({"created": created if not errors else [], "errors": errors}, status=status_code)
