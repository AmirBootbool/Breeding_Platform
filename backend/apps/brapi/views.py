from rest_framework import viewsets
from rest_framework.response import Response

from apps.germplasm.models import Germplasm
from apps.trials.models import Observation, ObservationVariable, Trial

from .pagination import BrapiPagination
from .serializers import (
    BrapiGermplasmSerializer,
    BrapiObservationSerializer,
    BrapiObservationVariableSerializer,
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

        observation_variable_db_id = self.request.query_params.get("observationVariableDbId")
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

        observation_variable_db_id = self.request.query_params.get("observationVariableDbId")
        if observation_variable_db_id:
            queryset = queryset.filter(id=observation_variable_db_id)

        observation_variable_name = self.request.query_params.get("observationVariableName")
        if observation_variable_name:
            queryset = queryset.filter(name__icontains=observation_variable_name)

        return queryset
