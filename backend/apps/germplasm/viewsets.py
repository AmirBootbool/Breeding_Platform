from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.core.permissions import RoleBasedPermission

from .models import Cross, Germplasm
from .serializers import CrossSerializer, GermplasmSerializer


class GermplasmViewSet(viewsets.ModelViewSet):
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
    filterset_fields = ["program", "cross_type", "species"]

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
            result = import_germplasm_csv(file_obj.file, program_name, dry_run=dry_run)
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


class CrossViewSet(viewsets.ModelViewSet):
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
