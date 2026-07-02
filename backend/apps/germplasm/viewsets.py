from rest_framework import viewsets

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
