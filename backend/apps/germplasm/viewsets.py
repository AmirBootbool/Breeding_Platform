from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.core.mixins import ProgramScopedQuerySetMixin
from apps.core.permissions import RoleBasedPermission

from .models import Cross, Germplasm
from .serializers import CrossSerializer, GermplasmSerializer


class GermplasmViewSet(ProgramScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = Germplasm.objects.select_related(
        "program",
        "parent_female",
        "parent_male",
    ).all()
    serializer_class = GermplasmSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["name", "germplasm_db_id", "pedigree_string"]
    ordering_fields = ["name", "year_developed", "created_at"]
    filterset_fields = ["program", "cross_type", "species", "is_archived"]

    def get_queryset(self):
        qs = super().get_queryset()
        archived = self.request.query_params.get("archived")
        if not (archived and archived.lower() in ["true", "1", "yes"]):
            qs = qs.filter(is_archived=False)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser],
        url_path="bulk_import",
    )
    def bulk_import(self, request):
        file_obj = request.FILES.get("file")
        program_name = request.data.get("program")
        dry_run = request.data.get("dry_run") in ("true", "True", "1")

        if not file_obj or not program_name:
            return Response(
                {"errors": [{"row": 0, "detail": "file and program are required"}]},
                status=400,
            )

        from django.core.exceptions import ValidationError

        from apps.germplasm.services import import_germplasm_csv

        try:
            result = import_germplasm_csv(
                file_obj.file, program_name, filename=file_obj.name, dry_run=dry_run
            )
        except ValidationError as ve:
            detail = ve.messages[0] if hasattr(ve, "messages") else str(ve)
            return Response(
                {"errors": [{"row": 0, "detail": detail}]},
                status=400,
            )

        status_code = 201 if not result["errors"] else 400

        response_data = result.copy()
        if dry_run or result["errors"]:
            response_data["created"] = 0

        return Response(response_data, status=status_code)

    @action(detail=False, methods=["post"], url_path="advance")
    def advance(self, request):
        from apps.core.utils import safe_int

        germplasm_ids = request.data.get("germplasm_ids", [])
        method = request.data.get("method")
        ssd_count = safe_int(request.data.get("ssd_count", 1))

        if not germplasm_ids or method not in ["bulk", "ssd"]:
            return Response({"detail": "Invalid method or missing IDs."}, status=400)
        if ssd_count is None or ssd_count < 1:
            return Response({"detail": "ssd_count must be a positive integer."}, status=400)

        from apps.germplasm.services import advance_generation
        # Scope IDs to the requesting user's program to prevent cross-tenant manipulation.
        user = request.user
        if user.is_staff or user.is_superuser:
            germplasm_list = Germplasm.objects.filter(id__in=germplasm_ids)
        else:
            user_program_id = getattr(getattr(user, "profile", None), "program_id", None)
            if not user_program_id:
                return Response({"detail": "User is not associated with a program."}, status=403)
            germplasm_list = Germplasm.objects.filter(id__in=germplasm_ids, program_id=user_program_id)

        created = advance_generation(germplasm_list, method, ssd_count, request.user)
        return Response({
            "created_count": len(created),
            "created_ids": [g.id for g in created]
        })

    @action(detail=False, methods=["post"], url_path="bulk_archive")
    def bulk_archive(self, request):
        ids = request.data.get("ids", [])
        if not isinstance(ids, list) or not ids:
            return Response({"detail": "ids must be a non-empty list of integers."}, status=400)
        # Scope to the requesting user's program — no cross-tenant mutations.
        user = request.user
        qs = Germplasm.objects.filter(id__in=ids)
        if not (user.is_staff or user.is_superuser):
            user_program_id = getattr(getattr(user, "profile", None), "program_id", None)
            if user_program_id:
                qs = qs.filter(program_id=user_program_id)
            else:
                return Response({"detail": "User is not associated with a program."}, status=403)
        updated = qs.update(is_archived=True)
        return Response({"archived_count": updated})

    @action(detail=False, methods=["post"], url_path="bulk_delete")
    def bulk_delete(self, request):
        from django.db.models import ProtectedError

        ids = request.data.get("ids", [])
        if not isinstance(ids, list) or not ids:
            return Response({"detail": "ids must be a non-empty list of integers."}, status=400)

        # Scope to the requesting user's program — no cross-tenant deletion.
        user = request.user
        qs = Germplasm.objects.filter(id__in=ids)
        if not (user.is_staff or user.is_superuser):
            user_program_id = getattr(getattr(user, "profile", None), "program_id", None)
            if user_program_id:
                qs = qs.filter(program_id=user_program_id)
            else:
                return Response({"detail": "User is not associated with a program."}, status=403)

        # Delete one at a time: a bulk .delete() aborts entirely on the
        # first row protected by a Cross/SeedLot reference, so unprotected
        # rows in the same batch would otherwise never get removed either.
        deleted_ids = []
        skipped = []
        for germplasm in qs:
            germplasm_id = germplasm.id  # .delete() clears the instance's pk
            try:
                germplasm.delete()
                deleted_ids.append(germplasm_id)
            except ProtectedError:
                skipped.append(
                    {
                        "id": germplasm_id,
                        "detail": "Referenced by an existing cross or seed lot.",
                    }
                )

        status_code = 200 if not skipped else 409
        return Response(
            {"deleted_count": len(deleted_ids), "deleted_ids": deleted_ids, "skipped": skipped},
            status=status_code,
        )

    @action(detail=True, methods=["get"], url_path="pedigree_tree")
    def pedigree_tree(self, request, pk=None):
        from apps.germplasm.services import build_pedigree_tree

        depth = request.query_params.get("depth", 3)
        direction = request.query_params.get("direction", "ancestors")

        try:
            depth = int(depth)
        except (TypeError, ValueError):
            depth = 3

        tree = build_pedigree_tree(pk, depth=depth, direction=direction)
        if tree is None:
            return Response({"detail": "Germplasm not found."}, status=404)

        return Response(tree)

class CrossViewSet(ProgramScopedQuerySetMixin, viewsets.ModelViewSet):
    # Cross has no direct `program` field - it's derived from its parents.
    program_lookup = "female_parent__program_id"

    queryset = Cross.objects.select_related(
        "female_parent__program",
        "male_parent__program",
        "location",
    ).all()
    serializer_class = CrossSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["cross_code", "female_parent__name", "male_parent__name"]
    ordering_fields = ["cross_date", "cross_code"]
    filterset_fields = ["female_parent", "male_parent", "location"]
