from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.mixins import ProgramScopedQuerySetMixin
from apps.core.models import Location, Program
from apps.core.permissions import RoleBasedPermission
from apps.core.utils import safe_int
from apps.germplasm.models import Germplasm
from apps.trials.models import Observation, ObservationVariable, Plot, Trial

from .pagination import BrapiPagination
from .serializers import (
    BrapiGermplasmSerializer,
    BrapiGermplasmWriteSerializer,
    BrapiLocationSerializer,
    BrapiObservationSerializer,
    BrapiObservationUnitSerializer,
    BrapiObservationUnitWriteSerializer,
    BrapiObservationVariableSerializer,
    BrapiObservationWriteSerializer,
    BrapiProgramSerializer,
    BrapiStudySerializer,
)


def _int_or_400(raw, param_name):
    """Parse a BrAPI *DbId query param as an int, or raise a clean 400.

    Malformed third-party input here used to raise inside queryset
    construction (an unhandled 500); silently ignoring it instead could
    return more data than the caller filtered for, so it's rejected.
    """
    value = safe_int(raw)
    if value is None:
        raise ValidationError({param_name: "Must be an integer."})
    return value


class BrapiModelViewSet(viewsets.ReadOnlyModelViewSet):
    pagination_class = BrapiPagination
    # Explicit permission requirement: every BrAPI endpoint requires authentication
    # and role-based authorization, not just the global DRF default.
    permission_classes = [RoleBasedPermission]

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(
            {
                "metadata": {
                    "pagination": None,
                    "status": [],
                    "datafiles": [],
                },
                "result": serializer.data,
            }
        )


class BrapiStudyViewSet(ProgramScopedQuerySetMixin, BrapiModelViewSet):
    queryset = Trial.objects.all()
    serializer_class = BrapiStudySerializer
    permission_classes = [RoleBasedPermission]

    def get_queryset(self):
        queryset = super().get_queryset().select_related("program", "location", "season")

        program_db_id = self.request.query_params.get("programDbId")
        if program_db_id:
            queryset = queryset.filter(program_id=_int_or_400(program_db_id, "programDbId"))

        location_db_id = self.request.query_params.get("locationDbId")
        if location_db_id:
            queryset = queryset.filter(location_id=_int_or_400(location_db_id, "locationDbId"))

        season_db_id = self.request.query_params.get("seasonDbId")
        if season_db_id:
            queryset = queryset.filter(season_id=_int_or_400(season_db_id, "seasonDbId"))

        study_code = self.request.query_params.get("studyCode")
        if study_code:
            queryset = queryset.filter(trial_code=study_code)

        return queryset


class BrapiGermplasmViewSet(ProgramScopedQuerySetMixin, mixins.CreateModelMixin, BrapiModelViewSet):
    queryset = Germplasm.objects.all()
    serializer_class = BrapiGermplasmSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}

    def get_serializer_class(self):
        if self.action in ("create",):
            return BrapiGermplasmWriteSerializer
        return BrapiGermplasmSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # L-2: Set audit trail fields — BrAPI creates bypassed perform_create().
        instance = serializer.save(
            created_by=request.user,
            updated_by=request.user,
        )
        read_serializer = BrapiGermplasmSerializer(
            instance, context=self.get_serializer_context()
        )
        return Response(
            {
                "metadata": {"pagination": None, "status": [], "datafiles": []},
                "result": read_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

    def get_queryset(self):
        queryset = super().get_queryset().select_related("program")

        germplasm_db_id = self.request.query_params.get("germplasmDbId")
        if germplasm_db_id:
            queryset = queryset.filter(germplasm_db_id=germplasm_db_id)

        germplasm_name = self.request.query_params.get("germplasmName")
        if germplasm_name:
            queryset = queryset.filter(name__icontains=germplasm_name)

        program_db_id = self.request.query_params.get("programDbId")
        if program_db_id:
            queryset = queryset.filter(program_id=_int_or_400(program_db_id, "programDbId"))

        return queryset


class BrapiObservationViewSet(
    ProgramScopedQuerySetMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, BrapiModelViewSet
):
    program_lookup = "plot__trial__program_id"

    queryset = Observation.objects.all()
    serializer_class = BrapiObservationSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder", "technician"}

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return BrapiObservationWriteSerializer
        return BrapiObservationSerializer

    def create(self, request, *args, **kwargs):
        many = isinstance(request.data, list)
        serializer = self.get_serializer(data=request.data, many=many)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        if many:
            read_serializer = BrapiObservationSerializer(
                instance, many=True, context=self.get_serializer_context()
            )
            result_data = {"data": read_serializer.data}
        else:
            read_serializer = BrapiObservationSerializer(
                instance, context=self.get_serializer_context()
            )
            result_data = read_serializer.data

        return Response(
            {
                "metadata": {"pagination": None, "status": [], "datafiles": []},
                "result": result_data,
            },
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        read_serializer = BrapiObservationSerializer(
            instance, context=self.get_serializer_context()
        )
        return Response(
            {
                "metadata": {"pagination": None, "status": [], "datafiles": []},
                "result": read_serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def get_queryset(self):
        queryset = super().get_queryset().select_related(
            "plot", "variable", "plot__trial", "plot__germplasm"
        )

        observation_unit_db_id = self.request.query_params.get("observationUnitDbId")
        if observation_unit_db_id:
            queryset = queryset.filter(
                plot_id=_int_or_400(observation_unit_db_id, "observationUnitDbId")
            )

        observation_variable_db_id = self.request.query_params.get(
            "observationVariableDbId"
        )
        if observation_variable_db_id:
            queryset = queryset.filter(
                variable_id=_int_or_400(observation_variable_db_id, "observationVariableDbId")
            )

        study_db_id = self.request.query_params.get("studyDbId")
        if study_db_id:
            queryset = queryset.filter(plot__trial_id=_int_or_400(study_db_id, "studyDbId"))

        germplasm_db_id = self.request.query_params.get("germplasmDbId")
        if germplasm_db_id:
            queryset = queryset.filter(plot__germplasm__germplasm_db_id=germplasm_db_id)

        return queryset


class BrapiObservationVariableViewSet(BrapiModelViewSet):
    serializer_class = BrapiObservationVariableSerializer

    def get_queryset(self):
        queryset = ObservationVariable.objects.all()

        observation_variable_db_id = self.request.query_params.get(
            "observationVariableDbId"
        )
        if observation_variable_db_id:
            queryset = queryset.filter(
                id=_int_or_400(observation_variable_db_id, "observationVariableDbId")
            )

        observation_variable_name = self.request.query_params.get(
            "observationVariableName"
        )
        if observation_variable_name:
            queryset = queryset.filter(name__icontains=observation_variable_name)

        return queryset


class BrapiServerInfoViewSet(viewsets.ViewSet):
    @extend_schema(responses=OpenApiTypes.OBJECT)
    def list(self, request):
        calls = [
            {
                "service": "serverinfo",
                "dataTypes": ["application/json"],
                "methods": ["GET"],
                "versions": ["2.0"],
            },
            {
                "service": "studies",
                "dataTypes": ["application/json"],
                "methods": ["GET"],
                "versions": ["2.0"],
            },
            {
                "service": "germplasm",
                "dataTypes": ["application/json"],
                "methods": ["GET"],
                "versions": ["2.0"],
            },
            {
                "service": "observations",
                "dataTypes": ["application/json"],
                "methods": ["GET"],
                "versions": ["2.0"],
            },
            {
                "service": "observationvariables",
                "dataTypes": ["application/json"],
                "methods": ["GET"],
                "versions": ["2.0"],
            },
            {
                "service": "variables",
                "dataTypes": ["application/json"],
                "methods": ["GET"],
                "versions": ["2.0"],
            },
            {
                "service": "locations",
                "dataTypes": ["application/json"],
                "methods": ["GET"],
                "versions": ["2.0"],
            },
            {
                "service": "programs",
                "dataTypes": ["application/json"],
                "methods": ["GET"],
                "versions": ["2.0"],
            },
            {
                "service": "observationunits",
                "dataTypes": ["application/json"],
                "methods": ["GET"],
                "versions": ["2.0"],
            },
        ]
        return Response(
            {
                "metadata": {
                    "pagination": None,
                    "status": [],
                    "datafiles": [],
                },
                "result": {"calls": calls},
            }
        )


class BrapiLocationViewSet(BrapiModelViewSet):
    serializer_class = BrapiLocationSerializer
    permission_classes = [RoleBasedPermission]

    def get_queryset(self):
        queryset = Location.objects.all()

        location_db_id = self.request.query_params.get("locationDbId")
        if location_db_id:
            queryset = queryset.filter(id=_int_or_400(location_db_id, "locationDbId"))

        location_name = self.request.query_params.get("locationName")
        if location_name:
            queryset = queryset.filter(name__icontains=location_name)

        country_name = self.request.query_params.get("countryName")
        if country_name:
            queryset = queryset.filter(country__icontains=country_name)

        return queryset


class BrapiProgramViewSet(ProgramScopedQuerySetMixin, BrapiModelViewSet):
    # Program is its own tenant boundary, same as core.ProgramViewSet.
    program_lookup = "id"

    queryset = Program.objects.all()
    serializer_class = BrapiProgramSerializer
    permission_classes = [RoleBasedPermission]

    def get_queryset(self):
        queryset = super().get_queryset()

        program_db_id = self.request.query_params.get("programDbId")
        if program_db_id:
            queryset = queryset.filter(id=_int_or_400(program_db_id, "programDbId"))

        program_name = self.request.query_params.get("programName")
        if program_name:
            queryset = queryset.filter(name__icontains=program_name)

        common_crop_name = self.request.query_params.get("commonCropName")
        if common_crop_name:
            queryset = queryset.filter(crop__icontains=common_crop_name)

        return queryset


class BrapiObservationUnitViewSet(ProgramScopedQuerySetMixin, mixins.UpdateModelMixin, BrapiModelViewSet):
    program_lookup = "trial__program_id"

    queryset = Plot.objects.all()
    serializer_class = BrapiObservationUnitSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}

    def get_serializer_class(self):
        if self.action in ("update", "partial_update"):
            return BrapiObservationUnitWriteSerializer
        return BrapiObservationUnitSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        read_serializer = BrapiObservationUnitSerializer(
            instance, context=self.get_serializer_context()
        )
        return Response(
            {
                "metadata": {"pagination": None, "status": [], "datafiles": []},
                "result": read_serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def get_queryset(self):
        queryset = super().get_queryset().select_related("trial", "germplasm").order_by(
            "trial_id", "plot_number"
        )

        observation_unit_db_id = self.request.query_params.get("observationUnitDbId")
        if observation_unit_db_id:
            queryset = queryset.filter(
                id=_int_or_400(observation_unit_db_id, "observationUnitDbId")
            )

        study_db_id = self.request.query_params.get("studyDbId")
        if study_db_id:
            queryset = queryset.filter(trial_id=_int_or_400(study_db_id, "studyDbId"))

        germplasm_db_id = self.request.query_params.get("germplasmDbId")
        if germplasm_db_id:
            queryset = queryset.filter(germplasm__germplasm_db_id=germplasm_db_id)

        return queryset
