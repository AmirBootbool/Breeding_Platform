from django.contrib import admin
from .models import Germplasm, Cross


@admin.register(Germplasm)
class GermplasmAdmin(admin.ModelAdmin):
    list_display = ['name', 'germplasm_db_id', 'program', 'cross_type', 'year_developed']
    search_fields = ['name', 'germplasm_db_id', 'pedigree_string']
    list_filter = ['program', 'cross_type']
    raw_id_fields = ['parent_female', 'parent_male']
    fieldsets = [
        ('Identity', {'fields': ['name', 'germplasm_db_id', 'species', 'program']}),
        ('Pedigree', {'fields': ['parent_female', 'parent_male', 'pedigree_string', 'cross_type', 'year_developed']}),
        ('Notes', {'fields': ['notes']}),
    ]


@admin.register(Cross)
class CrossAdmin(admin.ModelAdmin):
    list_display = ['cross_code', 'female_parent', 'male_parent', 'cross_date', 'location']
    search_fields = ['cross_code', 'female_parent__name', 'male_parent__name']
    list_filter = ['location', 'cross_date']
    raw_id_fields = ['female_parent', 'male_parent']
