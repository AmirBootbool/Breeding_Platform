import csv
import io

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from django.db import transaction
from django.db.models import Count
from django.http import StreamingHttpResponse

from apps.core.permissions import RoleBasedPermission

from .models import AnalysisSet, Observation, ObservationVariable, Plot, TraitPanel, Trial
from .serializers import (
    AnalysisSetSerializer,
    ObservationSerializer,
    ObservationVariableSerializer,
    PlotSerializer,
    TraitPanelSerializer,
    TrialSerializer,
)
from .services import (
    compute_cross_environment_ranking,
    compute_heritability,
    compute_trial_summary,
    create_plots_for_trial,
)


class TrialViewSet(viewsets.ModelViewSet):
    serializer_class = TrialSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    role_action_permissions = {
        "create": {"admin", "breeder"},
        "update": {"admin", "breeder"},
        "partial_update": {"admin", "breeder"},
        "destroy": {"admin", "breeder"},
        "create_plots": {"admin", "breeder"},
        "advance_plots": {"admin", "breeder"},
        "harvest_plots": {"admin", "breeder"},
        "import_fieldbook": {"admin", "breeder", "technician"},
    }
    search_fields = ["name", "trial_code", "program__name"]
    ordering_fields = ["trial_code", "name", "created_at"]
    filterset_fields = ["program", "season", "location", "design_type", "status", "generation"]

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
        check_germplasm_ids = request.data.get("check_germplasm_ids")
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

        check_entries = None
        if check_germplasm_ids is not None:
            if not isinstance(check_germplasm_ids, (list, tuple)):
                check_germplasm_ids = [check_germplasm_ids]
            check_entries = list(
                trial.program.germplasm.filter(id__in=check_germplasm_ids)
            )

        created = create_plots_for_trial(
            trial, germplasm_qs, seed=seed, check_entries=check_entries
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

    @action(detail=True, methods=["post"])
    def harvest_plots(self, request, pk=None):
        trial = self.get_object()
        plot_ids = request.data.get("plot_ids", [])
        method = request.data.get("method")
        ssd_count = int(request.data.get("ssd_count", 1))

        if not plot_ids or method not in ["bulk", "ssd"]:
            return Response({"detail": "Invalid method or missing plot IDs."}, status=400)

        plots_qs = trial.plots.filter(id__in=plot_ids).select_related("germplasm")
        
        from apps.germplasm.models import Germplasm
        from django.db import transaction
        
        created_entries = []
        with transaction.atomic():
            for plot in plots_qs:
                line = plot.germplasm
                if method == 'bulk':
                    new_line = Germplasm(
                        name=f"{line.name}-P{plot.plot_number}",
                        species=line.species,
                        program=line.program,
                        parent_female=line,
                        cross_type="self",
                        pedigree_string=f"{line.pedigree_string}-B" if line.pedigree_string else "",
                        created_by=request.user,
                        updated_by=request.user,
                    )
                    new_line.save()
                    created_entries.append(new_line)
                elif method == 'ssd':
                    for i in range(1, ssd_count + 1):
                        new_line = Germplasm(
                            name=f"{line.name}-P{plot.plot_number}-{i}",
                            species=line.species,
                            program=line.program,
                            parent_female=line,
                            cross_type="self",
                            pedigree_string=f"{line.pedigree_string}-{i}" if line.pedigree_string else "",
                            created_by=request.user,
                            updated_by=request.user,
                        )
                        new_line.save()
                        created_entries.append(new_line)
                        
        return Response({
            "created_count": len(created_entries),
            "created_ids": [g.id for g in created_entries]
        })

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

    @action(detail=True, methods=["post"])
    def advance_plots(self, request, pk=None):
        """Bulk-advance selected plots to a new generation."""
        from .services import advance_plots
        trial = self.get_object()
        
        plot_ids = request.data.get("plot_ids", [])
        if not plot_ids or not isinstance(plot_ids, list):
            return Response(
                {"detail": "plot_ids must be a non-empty list of integers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        selections_per_plot = int(request.data.get("selections_per_plot", 1))
        selection_method = request.data.get("selection_method", "SSD")

        try:
            created_ids = advance_plots(plot_ids, selections_per_plot, selection_method)
            return Response(
                {
                    "detail": f"Successfully created {len(created_ids)} new Germplasm entries.",
                    "created_count": len(created_ids),
                    "created_ids": created_ids
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            return Response(
                {"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST
            )

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

    @action(
        detail=True,
        methods=["post"],
        parser_classes=[MultiPartParser],
        url_path="import_fieldbook",
    )
    def import_fieldbook(self, request, pk=None):
        """Import observations for this trial from an uploaded Field Book CSV."""
        from django.core.exceptions import ValidationError
        from apps.trials.services import import_fieldbook_csv

        trial = self.get_object()
        file_obj = request.FILES.get("file")
        dry_run = request.data.get("dry_run") in ("true", "True", "1", True)

        if not file_obj:
            return Response(
                {"errors": [{"row": 0, "detail": "CSV file is required (form key 'file')."}]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = import_fieldbook_csv(
                trial, file_obj.file, dry_run=dry_run, user=request.user
            )
            if result.get("errors"):
                return Response(result, status=status.HTTP_400_BAD_REQUEST)
            return Response(result, status=status.HTTP_200_OK)
        except ValidationError as e:
            msg = e.message_dict if hasattr(e, "message_dict") else str(e)
            return Response(
                {"errors": [{"row": 0, "detail": msg}]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {"errors": [{"row": 0, "detail": str(e)}]},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["get"], url_path="spatial_heatmap")
    def spatial_heatmap(self, request, pk=None):
        """Generate a 2D spatial heatmap matrix of plot observation values and margin gradients."""
        trial = self.get_object()
        variable_id = request.query_params.get("variable_id")
        if not variable_id:
            return Response(
                {"detail": "variable_id query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            variable = ObservationVariable.objects.get(pk=variable_id)
        except (ObservationVariable.DoesNotExist, ValueError):
            return Response(
                {"detail": f"ObservationVariable with id {variable_id} does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        plots = (
            Plot.objects.filter(trial=trial)
            .select_related("germplasm")
            .order_by("rep", "plot_number")
        )
        if not plots.exists():
            return Response(
                {
                    "trial_id": trial.id,
                    "trial_code": trial.trial_code,
                    "variable": {
                        "id": variable.id,
                        "name": variable.name,
                        "unit": variable.unit,
                        "data_type": variable.data_type,
                    },
                    "stats": {"min": None, "max": None, "mean": None, "count": 0},
                    "dimensions": {"rows": 0, "columns": 0, "coordinate_type": "none"},
                    "row_margins": [],
                    "col_margins": [],
                    "cells": [],
                }
            )

        obs_qs = Observation.objects.filter(
            plot__trial=trial, variable=variable
        ).select_related("plot")
        obs_map = {obs.plot_id: obs for obs in obs_qs}

        has_rc = any(p.row is not None and p.column is not None for p in plots)
        coordinate_type = "row_col" if has_rc else "rep_plot"

        numeric_values = []
        for p in plots:
            obs = obs_map.get(p.id)
            if obs and obs.value_numeric is not None:
                numeric_values.append(float(obs.value_numeric))

        min_val = min(numeric_values) if numeric_values else None
        max_val = max(numeric_values) if numeric_values else None
        mean_val = (sum(numeric_values) / len(numeric_values)) if numeric_values else None
        val_range = (
            (max_val - min_val)
            if (min_val is not None and max_val is not None and max_val > min_val)
            else 1.0
        )

        cells = []
        row_buckets = {}
        col_buckets = {}

        for p in plots:
            obs = obs_map.get(p.id)
            raw_val = (
                float(obs.value_numeric)
                if (obs and obs.value_numeric is not None)
                else None
            )
            norm_val = None
            if raw_val is not None:
                if max_val is not None and min_val is not None and max_val > min_val:
                    norm_val = round((raw_val - min_val) / val_range, 4)
                else:
                    norm_val = 0.5

            if coordinate_type == "row_col":
                r_idx = p.row if p.row is not None else p.rep
                c_idx = p.column if p.column is not None else p.plot_number
            else:
                r_idx = p.rep
                c_idx = p.plot_number

            cells.append(
                {
                    "plot_id": p.id,
                    "plot_number": p.plot_number,
                    "row": r_idx,
                    "column": c_idx,
                    "rep": p.rep,
                    "block": p.block,
                    "germplasm_id": p.germplasm.id,
                    "germplasm_name": p.germplasm.name,
                    "is_check": p.is_check,
                    "status": p.status,
                    "raw_value": raw_val,
                    "normalized_value": norm_val,
                    "notes": obs.notes if obs else "",
                }
            )

            if raw_val is not None:
                row_buckets.setdefault(r_idx, []).append(raw_val)
                col_buckets.setdefault(c_idx, []).append(raw_val)

        row_margins = [
            {"row": r, "mean": round(sum(vals) / len(vals), 2), "count": len(vals)}
            for r, vals in sorted(row_buckets.items())
        ]
        col_margins = [
            {"column": c, "mean": round(sum(vals) / len(vals), 2), "count": len(vals)}
            for c, vals in sorted(col_buckets.items())
        ]

        distinct_rows = sorted({c["row"] for c in cells if c["row"] is not None})
        distinct_cols = sorted({c["column"] for c in cells if c["column"] is not None})

        return Response(
            {
                "trial_id": trial.id,
                "trial_code": trial.trial_code,
                "variable": {
                    "id": variable.id,
                    "name": variable.name,
                    "unit": variable.unit,
                    "data_type": variable.data_type,
                },
                "stats": {
                    "min": min_val,
                    "max": max_val,
                    "mean": round(mean_val, 2) if mean_val is not None else None,
                    "count": len(numeric_values),
                },
                "dimensions": {
                    "rows": len(distinct_rows),
                    "columns": len(distinct_cols),
                    "coordinate_type": coordinate_type,
                },
                "row_margins": row_margins,
                "col_margins": col_margins,
                "cells": cells,
            }
        )

    @action(detail=True, methods=["get"])
    def export_map(self, request, pk=None):
        """Export trial plot map layout as CSV with walking order serpentine numbers."""
        from .services import compute_walking_orders
        trial = self.get_object()
        plots = (
            Plot.objects.filter(trial=trial)
            .select_related("germplasm")
            .order_by("plot_number")
        )

        field_rows = trial.field_rows or max([p.row or 1 for p in plots] + [1])
        field_cols = trial.field_cols or max([p.column or 1 for p in plots] + [1])
        corner = trial.starting_corner or "BL"

        headers = [
            "plot_number",
            "germplasm_name",
            "germplasm_id",
            "rep",
            "block",
            "incomplete_block",
            "row",
            "column",
            "is_check",
            "is_border",
            "status",
            "walking_order_h_serpentine",
            "walking_order_v_serpentine",
        ]

        def generate():
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(headers)
            yield buf.getvalue()
            for plot in plots:
                r = plot.row or 1
                c = plot.column or 1
                h_order, v_order = compute_walking_orders(r, c, field_rows, field_cols, corner)
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(
                    [
                        plot.plot_number,
                        plot.germplasm.name,
                        plot.germplasm.id,
                        plot.rep,
                        plot.block or "",
                        plot.incomplete_block or "",
                        plot.row or "",
                        plot.column or "",
                        "TRUE" if plot.is_check else "FALSE",
                        "TRUE" if plot.is_border else "FALSE",
                        plot.status,
                        h_order,
                        v_order,
                    ]
                )
                yield buf.getvalue()

        filename = f"{trial.trial_code}_field_map.csv"
        response = StreamingHttpResponse(generate(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=["patch"], url_path="batch_update_plots")
    def batch_update_plots(self, request, pk=None):
        """Batch update plots (germplasm, check, border, row, column, status) in one atomic transaction."""
        trial = self.get_object()
        plots_data = request.data.get("plots", [])
        if not isinstance(plots_data, list) or not plots_data:
            return Response(
                {"detail": "plots must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        plot_ids = [p.get("id") or p.get("plot_id") for p in plots_data if (p.get("id") or p.get("plot_id"))]
        existing_plots = {p.id: p for p in Plot.objects.filter(trial=trial, id__in=plot_ids)}

        updated_plots = []
        with transaction.atomic():
            for p_data in plots_data:
                p_id = p_data.get("id") or p_data.get("plot_id")
                plot = existing_plots.get(p_id)
                if not plot:
                    continue

                if "germplasm" in p_data or "germplasm_id" in p_data:
                    gid = p_data.get("germplasm") or p_data.get("germplasm_id")
                    if gid:
                        plot.germplasm_id = gid
                if "is_check" in p_data:
                    plot.is_check = bool(p_data["is_check"])
                if "is_border" in p_data:
                    plot.is_border = bool(p_data["is_border"])
                if "status" in p_data:
                    plot.status = p_data["status"]
                if "row" in p_data and p_data["row"] is not None:
                    plot.row = int(p_data["row"])
                if "column" in p_data and p_data["column"] is not None:
                    plot.column = int(p_data["column"])
                if "rep" in p_data and p_data["rep"] is not None:
                    plot.rep = int(p_data["rep"])

                plot.save()
                updated_plots.append(plot)

        return Response(
            {
                "detail": f"Successfully updated {len(updated_plots)} plots.",
                "updated_count": len(updated_plots),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="add_grid_cells")
    def add_grid_cells(self, request, pk=None):
        """Add rows or columns of grid plots (optionally filled with a border/filler germplasm)."""
        trial = self.get_object()
        grid_type = request.data.get("type", "row")  # 'row' or 'column'
        location = request.data.get("location", "top")  # 'top', 'bottom', 'left', 'right'
        count = int(request.data.get("count", 1))
        fill_germplasm_id = request.data.get("fill_germplasm_id")
        is_border = bool(request.data.get("is_border", True))

        if count < 1 or count > 20:
            return Response({"detail": "Count must be between 1 and 20."}, status=400)

        from apps.germplasm.models import Germplasm
        if fill_germplasm_id:
            germplasm = Germplasm.objects.filter(id=fill_germplasm_id).first()
            if not germplasm:
                return Response({"detail": "Specified fill germplasm does not exist."}, status=400)
        else:
            first_plot = trial.plots.first()
            germplasm = first_plot.germplasm if first_plot else Germplasm.objects.first()
            if not germplasm:
                return Response({"detail": "No germplasm available to populate plots."}, status=400)

        existing_plots = list(trial.plots.all())
        current_rows = trial.field_rows or max([p.row or 1 for p in existing_plots] + [1])
        current_cols = trial.field_cols or max([p.column or 1 for p in existing_plots] + [1])
        max_plot_num = max([p.plot_number for p in existing_plots] + [0])

        new_plots = []
        with transaction.atomic():
            if grid_type == "row":
                new_rows_count = current_rows + count
                if location == "top":
                    for r_offset in range(1, count + 1):
                        new_row_idx = current_rows + r_offset
                        for c_idx in range(1, current_cols + 1):
                            max_plot_num += 1
                            new_plots.append(
                                Plot(
                                    trial=trial,
                                    germplasm=germplasm,
                                    rep=1,
                                    plot_number=max_plot_num,
                                    row=new_row_idx,
                                    column=c_idx,
                                    is_border=is_border,
                                    is_check=False,
                                    status="planned",
                                )
                            )
                else:  # bottom
                    for p in existing_plots:
                        if p.row:
                            p.row += count
                            p.save(update_fields=["row"])
                    for r_idx in range(1, count + 1):
                        for c_idx in range(1, current_cols + 1):
                            max_plot_num += 1
                            new_plots.append(
                                Plot(
                                    trial=trial,
                                    germplasm=germplasm,
                                    rep=1,
                                    plot_number=max_plot_num,
                                    row=r_idx,
                                    column=c_idx,
                                    is_border=is_border,
                                    is_check=False,
                                    status="planned",
                                )
                            )
                trial.field_rows = new_rows_count
                trial.save(update_fields=["field_rows"])

            else:  # column
                new_cols_count = current_cols + count
                if location == "right":
                    for c_offset in range(1, count + 1):
                        new_col_idx = current_cols + c_offset
                        for r_idx in range(1, current_rows + 1):
                            max_plot_num += 1
                            new_plots.append(
                                Plot(
                                    trial=trial,
                                    germplasm=germplasm,
                                    rep=1,
                                    plot_number=max_plot_num,
                                    row=r_idx,
                                    column=new_col_idx,
                                    is_border=is_border,
                                    is_check=False,
                                    status="planned",
                                )
                            )
                else:  # left
                    for p in existing_plots:
                        if p.column:
                            p.column += count
                            p.save(update_fields=["column"])
                    for c_idx in range(1, count + 1):
                        for r_idx in range(1, current_rows + 1):
                            max_plot_num += 1
                            new_plots.append(
                                Plot(
                                    trial=trial,
                                    germplasm=germplasm,
                                    rep=1,
                                    plot_number=max_plot_num,
                                    row=r_idx,
                                    column=c_idx,
                                    is_border=is_border,
                                    is_check=False,
                                    status="planned",
                                )
                            )
                trial.field_cols = new_cols_count
                trial.save(update_fields=["field_cols"])

            if new_plots:
                Plot.objects.bulk_create(new_plots)

        return Response(
            {
                "detail": f"Successfully added {len(new_plots)} plots.",
                "created_count": len(new_plots),
                "field_rows": trial.field_rows,
                "field_cols": trial.field_cols,
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
    filterset_fields = ["crop", "data_type", "is_required", "category"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def get_queryset(self):
        from django.db.models import Count as C
        return ObservationVariable.objects.annotate(usage_count=C("observations")).order_by("name")


class TraitPanelViewSet(viewsets.ModelViewSet):
    serializer_class = TraitPanelSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["name", "description"]
    ordering_fields = ["name", "category", "created_at"]
    filterset_fields = ["category", "program"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        return (
            TraitPanel.objects
            .select_related("program", "created_by")
            .prefetch_related("variables")
            .order_by("name")
        )


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
        from rest_framework.exceptions import ValidationError as DRFValidationError

        from django.core.exceptions import ValidationError as DjangoValidationError

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
                        detail = (
                            exc.message_dict
                            if hasattr(exc, "message_dict")
                            else str(exc)
                        )
                        errors.append({"index": i, "detail": detail})
                else:
                    errors.append({"index": i, "detail": serializer.errors})

            if errors:
                transaction.set_rollback(True)

        status_code = 201 if not errors else 400
        return Response(
            {"created": created if not errors else [], "errors": errors},
            status=status_code,
        )


class AnalysisSetViewSet(viewsets.ModelViewSet):
    serializer_class = AnalysisSetSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save()

    def get_queryset(self):
        return (
            AnalysisSet.objects.select_related("program", "created_by")
            .prefetch_related("trials")
            .order_by("name")
        )

    @action(detail=True, methods=["get"], url_path="heritability")
    def heritability(self, request, pk=None):
        from django.shortcuts import get_object_or_404

        analysis_set = self.get_object()
        variable_id = request.query_params.get("variable")
        if not variable_id:
            return Response({"detail": "variable query param is required."}, status=400)
        variable = get_object_or_404(ObservationVariable, pk=variable_id)
        return Response(compute_heritability(analysis_set, variable))

    @action(detail=True, methods=["get"], url_path="ranking")
    def ranking(self, request, pk=None):
        from django.shortcuts import get_object_or_404

        analysis_set = self.get_object()
        variable_id = request.query_params.get("variable")
        if not variable_id:
            return Response({"detail": "variable query param is required."}, status=400)
        variable = get_object_or_404(ObservationVariable, pk=variable_id)
        return Response(compute_cross_environment_ranking(analysis_set, variable))
