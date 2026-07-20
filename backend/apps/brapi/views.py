from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.response import Response

from apps.core.models import Location, Program
from apps.germplasm.models import Germplasm
from apps.trials.models import Observation, ObservationVariable, Plot, Trial

from .pagination import BrapiPagination
from .serializers import (
    BrapiGermplasmSerializer,
    BrapiLocationSerializer,
    BrapiObservationSerializer,
    BrapiObservationUnitSerializer,
    BrapiObservationVariableSerializer,
    BrapiProgramSerializer,
    BrapiStudySerializer,
)


class BrapiModelViewSet(viewsets.ReadOnlyModelViewSet):
    pagination_class = BrapiPagination

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


class BrapiStudyViewSet(BrapiModelViewSet):
    serializer_class = BrapiStudySerializer

    def get_queryset(self):
        queryset = Trial.objects.select_related("program", "location", "season").all()

        program_db_id = self.request.query_params.get("programDbId")
        if program_db_id:
            queryset = queryset.filter(program_id=program_db_id)

        location_db_id = self.request.query_params.get("locationDbId")
        if location_db_id:
            queryset = queryset.filter(location_id=location_db_id)

        season_db_id = self.request.query_params.get("seasonDbId")
        if season_db_id:
            queryset = queryset.filter(season_id=season_db_id)

        study_code = self.request.query_params.get("studyCode")
        if study_code:
            queryset = queryset.filter(trial_code=study_code)

        return queryset


class BrapiGermplasmViewSet(BrapiModelViewSet):
    serializer_class = BrapiGermplasmSerializer

    def get_queryset(self):
        queryset = Germplasm.objects.select_related("program").all()

        germplasm_db_id = self.request.query_params.get("germplasmDbId")
        if germplasm_db_id:
            queryset = queryset.filter(germplasm_db_id=germplasm_db_id)

        germplasm_name = self.request.query_params.get("germplasmName")
        if germplasm_name:
            queryset = queryset.filter(name__icontains=germplasm_name)

        program_db_id = self.request.query_params.get("programDbId")
        if program_db_id:
            queryset = queryset.filter(program_id=program_db_id)

        return queryset


class BrapiObservationViewSet(BrapiModelViewSet):
    serializer_class = BrapiObservationSerializer

    def get_queryset(self):
        queryset = Observation.objects.select_related(
            "plot", "variable", "plot__trial", "plot__germplasm"
        ).all()

        observation_unit_db_id = self.request.query_params.get("observationUnitDbId")
        if observation_unit_db_id:
            queryset = queryset.filter(plot_id=observation_unit_db_id)

        observation_variable_db_id = self.request.query_params.get(
            "observationVariableDbId"
        )
        if observation_variable_db_id:
            queryset = queryset.filter(variable_id=observation_variable_db_id)

        study_db_id = self.request.query_params.get("studyDbId")
        if study_db_id:
            queryset = queryset.filter(plot__trial_id=study_db_id)

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
            queryset = queryset.filter(id=observation_variable_db_id)

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

    def get_queryset(self):
        queryset = Location.objects.all()

        location_db_id = self.request.query_params.get("locationDbId")
        if location_db_id:
            queryset = queryset.filter(id=location_db_id)

        location_name = self.request.query_params.get("locationName")
        if location_name:
            queryset = queryset.filter(name__icontains=location_name)

        country_name = self.request.query_params.get("countryName")
        if country_name:
            queryset = queryset.filter(country__icontains=country_name)

        return queryset


class BrapiProgramViewSet(BrapiModelViewSet):
    serializer_class = BrapiProgramSerializer

    def get_queryset(self):
        queryset = Program.objects.all()

        program_db_id = self.request.query_params.get("programDbId")
        if program_db_id:
            queryset = queryset.filter(id=program_db_id)

        program_name = self.request.query_params.get("programName")
        if program_name:
            queryset = queryset.filter(name__icontains=program_name)

        common_crop_name = self.request.query_params.get("commonCropName")
        if common_crop_name:
            queryset = queryset.filter(crop__icontains=common_crop_name)

        return queryset


class BrapiObservationUnitViewSet(BrapiModelViewSet):
    serializer_class = BrapiObservationUnitSerializer

    def get_queryset(self):
        queryset = Plot.objects.select_related("trial", "germplasm").order_by(
            "trial_id", "plot_number"
        )

        observation_unit_db_id = self.request.query_params.get("observationUnitDbId")
        if observation_unit_db_id:
            queryset = queryset.filter(id=observation_unit_db_id)

        study_db_id = self.request.query_params.get("studyDbId")
        if study_db_id:
            queryset = queryset.filter(trial_id=study_db_id)

        germplasm_db_id = self.request.query_params.get("germplasmDbId")
        if germplasm_db_id:
            queryset = queryset.filter(germplasm__germplasm_db_id=germplasm_db_id)

        return queryset
