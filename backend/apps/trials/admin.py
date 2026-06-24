from django.contrib import admin
from .models import Trial, Plot


@admin.register(Trial)
class TrialAdmin(admin.ModelAdmin):
    list_display = ('name', 'trial_code', 'program', 'location', 'season', 'design_type', 'num_reps')
    search_fields = ('name', 'trial_code')


@admin.register(Plot)
class PlotAdmin(admin.ModelAdmin):
    list_display = ('trial', 'plot_number', 'germplasm', 'rep', 'status')
    list_filter = ('trial', 'rep', 'status')
    search_fields = ('germplasm__name',)
