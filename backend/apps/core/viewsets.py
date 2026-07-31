from rest_framework import viewsets

from .models import Location, Program, Season, UserProfile
from .permissions import RoleBasedPermission
from .serializers import (
    LocationSerializer,
    ProgramSerializer,
    SeasonSerializer,
    UserProfileSerializer,
)


class ProgramViewSet(viewsets.ModelViewSet):
    queryset = Program.objects.all().order_by("name")
    serializer_class = ProgramSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["name"]
    ordering_fields = ["name", "created_at"]
    filterset_fields = ["crop"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.all().order_by("name")
    serializer_class = LocationSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["name", "country", "region"]
    ordering_fields = ["name", "country", "region"]
    filterset_fields = ["country", "region"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class SeasonViewSet(viewsets.ModelViewSet):
    queryset = Season.objects.select_related("program").all()
    serializer_class = SeasonSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    search_fields = ["name", "program__name"]
    ordering_fields = ["name", "year"]
    filterset_fields = ["year", "program"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class UserProfileViewSet(viewsets.ModelViewSet):
    queryset = UserProfile.objects.select_related("user", "program").all()
    serializer_class = UserProfileSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin"}
    search_fields = ["user__username", "user__email", "role"]
    ordering_fields = ["role"]
    filterset_fields = ["role", "program"]
