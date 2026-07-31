from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from django.contrib.auth import get_user_model

from .models import Location, Program, Season, UserProfile


class AuditSerializerMixin(serializers.Serializer):
    created_by_username = serializers.SerializerMethodField()
    updated_by_username = serializers.SerializerMethodField()

    @extend_schema_field(str)
    def get_created_by_username(self, obj) -> str | None:
        return obj.created_by.username if getattr(obj, "created_by", None) else None

    @extend_schema_field(str)
    def get_updated_by_username(self, obj) -> str | None:
        return obj.updated_by.username if getattr(obj, "updated_by", None) else None


class ProgramSerializer(AuditSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ["id", "name", "crop", "description", "created_at", "created_by_username", "updated_by_username"]
        read_only_fields = ["id", "created_at", "created_by_username", "updated_by_username"]


class LocationSerializer(AuditSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "name", "latitude", "longitude", "country", "region", "created_at", "updated_at", "created_by_username", "updated_by_username"]
        read_only_fields = ["id", "created_at", "updated_at", "created_by_username", "updated_by_username"]


class SeasonSerializer(AuditSerializerMixin, serializers.ModelSerializer):
    program_name = serializers.CharField(source="program.name", read_only=True)

    class Meta:
        model = Season
        fields = ["id", "name", "year", "program", "program_name", "created_by_username", "updated_by_username"]
        read_only_fields = ["id", "program_name", "created_by_username", "updated_by_username"]


class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    user = serializers.PrimaryKeyRelatedField(queryset=get_user_model().objects.all())
    program_name = serializers.CharField(source="program.name", read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            "id",
            "user",
            "username",
            "email",
            "role",
            "program",
            "program_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "username",
            "email",
            "program_name",
            "created_at",
            "updated_at",
        ]
