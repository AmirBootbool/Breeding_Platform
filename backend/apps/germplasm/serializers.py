from rest_framework import serializers

from .models import Cross, Germplasm


class GermplasmSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source='program.name', read_only=True)
    parent_female_name = serializers.CharField(source='parent_female.name', read_only=True)
    parent_male_name = serializers.CharField(source='parent_male.name', read_only=True)

    class Meta:
        model = Germplasm
        fields = [
            'id',
            'name',
            'germplasm_db_id',
            'species',
            'program',
            'program_name',
            'parent_female',
            'parent_female_name',
            'parent_male',
            'parent_male_name',
            'pedigree_string',
            'cross_type',
            'year_developed',
            'notes',
            'created_at',
        ]
        read_only_fields = ['id', 'program_name', 'parent_female_name', 'parent_male_name', 'created_at']


class CrossSerializer(serializers.ModelSerializer):
    female_parent_name = serializers.CharField(source='female_parent.name', read_only=True)
    male_parent_name = serializers.CharField(source='male_parent.name', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)

    class Meta:
        model = Cross
        fields = [
            'id',
            'cross_code',
            'female_parent',
            'female_parent_name',
            'male_parent',
            'male_parent_name',
            'cross_date',
            'location',
            'location_name',
            'notes',
        ]
        read_only_fields = ['id', 'female_parent_name', 'male_parent_name', 'location_name']
