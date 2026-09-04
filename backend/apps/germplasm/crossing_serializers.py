from rest_framework import serializers

from apps.germplasm.models import Cross, CrossingBlock, Germplasm


class CrossingBlockListSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source="program.name", read_only=True)
    location_name = serializers.CharField(
        source="location.name", read_only=True, default=None
    )
    season_name = serializers.CharField(
        source="season.name", read_only=True, default=None
    )
    cross_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = CrossingBlock
        fields = [
            "id",
            "name",
            "program",
            "program_name",
            "location",
            "location_name",
            "season",
            "season_name",
            "map_pattern",
            "include_reciprocals",
            "cross_count",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "program_name",
            "location_name",
            "season_name",
            "cross_count",
            "created_at",
            "updated_at",
        ]


class CrossEntrySerializer(serializers.ModelSerializer):
    female_parent_name = serializers.CharField(
        source="female_parent.name", read_only=True
    )
    male_parent_name = serializers.CharField(
        source="male_parent.name", read_only=True
    )
    progeny_name = serializers.CharField(
        source="progeny.name", read_only=True, default=None
    )

    class Meta:
        model = Cross
        fields = [
            "id",
            "cross_code",
            "female_parent",
            "female_parent_name",
            "male_parent",
            "male_parent_name",
            "status",
            "is_reciprocal",
            "map_position",
            "progeny",
            "progeny_name",
            "cross_date",
            "notes",
        ]
        read_only_fields = [
            "id",
            "cross_code",
            "female_parent_name",
            "male_parent_name",
            "progeny_name",
        ]


class CrossingBlockDetailSerializer(CrossingBlockListSerializer):
    crosses = CrossEntrySerializer(many=True, read_only=True)

    class Meta(CrossingBlockListSerializer.Meta):
        fields = CrossingBlockListSerializer.Meta.fields + ["crosses"]


class PlanCrossesRequestSerializer(serializers.Serializer):
    female_ids = serializers.ListField(
        child=serializers.IntegerField(), min_length=1
    )
    male_ids = serializers.ListField(
        child=serializers.IntegerField(), min_length=1
    )

    def validate_female_ids(self, value):
        existing = set(
            Germplasm.objects.filter(id__in=value).values_list("id", flat=True)
        )
        missing = set(value) - existing
        if missing:
            raise serializers.ValidationError(
                f"Germplasm IDs not found: {missing}"
            )
        return value

    def validate_male_ids(self, value):
        existing = set(
            Germplasm.objects.filter(id__in=value).values_list("id", flat=True)
        )
        missing = set(value) - existing
        if missing:
            raise serializers.ValidationError(
                f"Germplasm IDs not found: {missing}"
            )
        return value
