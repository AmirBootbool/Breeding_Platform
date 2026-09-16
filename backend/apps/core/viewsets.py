from rest_framework import viewsets

from .mixins import ProgramScopedQuerySetMixin
from .models import Location, Program, Season, UserProfile
from .permissions import RoleBasedPermission
from .serializers import (
    LocationSerializer,
    ProgramSerializer,
    SeasonSerializer,
    UserProfileSerializer,
)


class ProgramViewSet(ProgramScopedQuerySetMixin, viewsets.ModelViewSet):
    # Program is its own tenant boundary - a user should only see the
    # program(s) they belong to.
    program_lookup = "id"

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


class SeasonViewSet(ProgramScopedQuerySetMixin, viewsets.ModelViewSet):
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

    def get_queryset(self):
        # Emails and roles are sensitive: a user should see their own
        # profile, a program-level admin should see their own program's
        # team, and only platform staff/superusers see the full directory.
        qs = super().get_queryset()
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return qs

        profile = getattr(user, "profile", None)
        if profile and profile.role == "admin" and profile.program_id:
            return qs.filter(program_id=profile.program_id)
        return qs.filter(user=user)
