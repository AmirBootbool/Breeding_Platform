from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Location, Program, Season, UserProfile


class ProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ['id', 'name', 'crop', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ['id', 'name', 'latitude', 'longitude', 'country', 'region']
        read_only_fields = ['id']


class SeasonSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source='program.name', read_only=True)

    class Meta:
        model = Season
        fields = ['id', 'name', 'year', 'program', 'program_name']
        read_only_fields = ['id', 'program_name']


class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.CharField(source='user.email', read_only=True)
    user = serializers.PrimaryKeyRelatedField(queryset=get_user_model().objects.all())
    program_name = serializers.CharField(source='program.name', read_only=True)

    class Meta:
        model = UserProfile
        fields = ['id', 'user', 'username', 'email', 'role', 'program', 'program_name']
        read_only_fields = ['id', 'username', 'email', 'program_name']
