from django.contrib import admin
from .models import Program, Location, Season, UserProfile


@admin.register(Program)
class ProgramAdmin(admin.ModelAdmin):
    list_display = ['name', 'crop', 'created_at']
    search_fields = ['name']


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ['name', 'country', 'region', 'latitude', 'longitude']
    search_fields = ['name', 'country', 'region']
    list_filter = ['country']


@admin.register(Season)
class SeasonAdmin(admin.ModelAdmin):
    list_display = ['name', 'year', 'program']
    search_fields = ['name']
    list_filter = ['year', 'program']


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'role', 'program', 'created_at', 'updated_at']
    list_filter = ['role', 'program']
    search_fields = ['user__username', 'user__email']
