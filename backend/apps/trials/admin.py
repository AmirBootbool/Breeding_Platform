from django.contrib import admin
from .models import Observation, ObservationVariable, Plot, Trial


@admin.register(Trial)
class TrialAdmin(admin.ModelAdmin):
    list_display = ['name', 'trial_code', 'program', 'location', 'season', 'design_type', 'num_reps', 'created_at', 'updated_at']
    search_fields = ['name', 'trial_code']
    list_filter = ['design_type', 'program', 'location', 'season']
    raw_id_fields = ['program', 'location', 'season']


@admin.register(Plot)
class PlotAdmin(admin.ModelAdmin):
    list_display = ['trial', 'plot_number', 'germplasm', 'rep', 'status']
    list_filter = ['trial', 'rep', 'status']
    search_fields = ['germplasm__name']
    raw_id_fields = ['trial', 'germplasm']


@admin.register(ObservationVariable)
class ObservationVariableAdmin(admin.ModelAdmin):
    list_display = ['name', 'variable_code', 'data_type', 'unit', 'is_required', 'created_at']
    search_fields = ['name', 'variable_code']
    list_filter = ['data_type', 'is_required']


@admin.register(Observation)
class ObservationAdmin(admin.ModelAdmin):
    list_display = ['plot', 'variable', 'observation_time', 'value_numeric', 'value_text']
    list_filter = ['variable', 'observation_time']
    search_fields = ['plot__trial__trial_code', 'plot__germplasm__name', 'variable__name']
    raw_id_fields = ['plot', 'variable']
