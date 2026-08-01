from rest_framework import serializers

from apps.core.models import Location, Program
from apps.germplasm.models import Germplasm
from apps.trials.models import Observation, ObservationVariable, Plot, Trial


class BrapiStudySerializer(serializers.ModelSerializer):
    studyDbId = serializers.SerializerMethodField()
    studyName = serializers.CharField(source="name", read_only=True)
    studyCode = serializers.CharField(source="trial_code", read_only=True)
    trialDbId = serializers.SerializerMethodField()
    trialName = serializers.CharField(source="program.name", read_only=True)
    programDbId = serializers.SerializerMethodField()
    programName = serializers.CharField(source="program.name", read_only=True)
    commonCropName = serializers.CharField(source="program.crop", read_only=True)
    active = serializers.BooleanField(default=True, read_only=True)
    experimentalDesign = serializers.SerializerMethodField()
    locationDbId = serializers.SerializerMethodField()
    locationName = serializers.CharField(source="location.name", read_only=True)
    seasons = serializers.SerializerMethodField()
    startDate = serializers.DateField(source="planting_date", read_only=True)
    endDate = serializers.DateField(source="harvest_date", read_only=True)
    additionalInfo = serializers.SerializerMethodField()

    class Meta:
        model = Trial
        fields = [
            "studyDbId",
            "studyName",
            "studyCode",
            "trialDbId",
            "trialName",
            "programDbId",
            "programName",
            "commonCropName",
            "active",
            "experimentalDesign",
            "locationDbId",
            "locationName",
            "seasons",
            "startDate",
            "endDate",
            "additionalInfo",
        ]

    def get_studyDbId(self, obj):
        return str(obj.id)

    def get_trialDbId(self, obj):
        return str(obj.program.id)

    def get_programDbId(self, obj):
        return str(obj.program.id)

    def get_locationDbId(self, obj):
        return str(obj.location.id)

    def get_experimentalDesign(self, obj):
        return {
            "description": obj.notes,
            "PUI": None,
            "type": obj.design_type,
        }

    def get_seasons(self, obj):
        return [str(obj.season.year)] if obj.season else []

    def get_additionalInfo(self, obj):
        return {
            "notes": obj.notes,
            "brapi_study_db_id": obj.brapi_study_db_id,
            "num_reps": obj.num_reps,
        }


class BrapiGermplasmSerializer(serializers.ModelSerializer):
    germplasmDbId = serializers.CharField(source="germplasm_db_id", read_only=True)
    germplasmName = serializers.CharField(source="name", read_only=True)
    defaultDisplayName = serializers.CharField(source="name", read_only=True)
    accessionNumber = serializers.CharField(source="germplasm_db_id", read_only=True)
    pedigree = serializers.CharField(source="pedigree_string", read_only=True)
    species = serializers.CharField(read_only=True)
    genus = serializers.SerializerMethodField()
    commonCropName = serializers.CharField(source="program.crop", read_only=True)
    breedingMethod = serializers.CharField(source="cross_type", read_only=True)
    yearOfDevelopment = serializers.IntegerField(
        source="year_developed", read_only=True
    )
    programDbId = serializers.SerializerMethodField()
    programName = serializers.CharField(source="program.name", read_only=True)
    additionalInfo = serializers.SerializerMethodField()

    class Meta:
        model = Germplasm
        fields = [
            "germplasmDbId",
            "germplasmName",
            "defaultDisplayName",
            "accessionNumber",
            "pedigree",
            "species",
            "genus",
            "commonCropName",
            "breedingMethod",
            "yearOfDevelopment",
            "programDbId",
            "programName",
            "additionalInfo",
        ]

    def get_genus(self, obj):
        return "Triticum"

    def get_programDbId(self, obj):
        return str(obj.program.id)

    def get_additionalInfo(self, obj):
        return {
            "notes": obj.notes,
        }


class BrapiObservationSerializer(serializers.ModelSerializer):
    observationDbId = serializers.SerializerMethodField()
    observationUnitDbId = serializers.SerializerMethodField()
    observationUnitName = serializers.SerializerMethodField()
    observationVariableDbId = serializers.SerializerMethodField()
    observationVariableName = serializers.CharField(
        source="variable.name", read_only=True
    )
    studyDbId = serializers.SerializerMethodField()
    studyName = serializers.CharField(source="plot.trial.name", read_only=True)
    germplasmDbId = serializers.CharField(
        source="plot.germplasm.germplasm_db_id", read_only=True
    )
    germplasmName = serializers.CharField(source="plot.germplasm.name", read_only=True)
    value = serializers.SerializerMethodField()
    observationTimeStamp = serializers.DateTimeField(
        source="observation_time", read_only=True
    )
    notes = serializers.CharField(read_only=True)
    additionalInfo = serializers.SerializerMethodField()

    class Meta:
        model = Observation
        fields = [
            "observationDbId",
            "observationUnitDbId",
            "observationUnitName",
            "observationVariableDbId",
            "observationVariableName",
            "studyDbId",
            "studyName",
            "germplasmDbId",
            "germplasmName",
            "value",
            "observationTimeStamp",
            "notes",
            "additionalInfo",
        ]

    def get_observationDbId(self, obj):
        return str(obj.id)

    def get_observationUnitDbId(self, obj):
        return str(obj.plot.id)

    def get_observationUnitName(self, obj):
        return f"Plot {obj.plot.plot_number}"

    def get_observationVariableDbId(self, obj):
        return str(obj.variable.id)

    def get_studyDbId(self, obj):
        return str(obj.plot.trial.id)

    def get_value(self, obj):
        if obj.value_numeric is not None:
            # If it's a whole number (for integer variables), format without decimals
            if obj.variable.data_type == "integer":
                return str(int(obj.value_numeric))
            return str(obj.value_numeric)
        elif obj.value_date is not None:
            return obj.value_date.isoformat()
        return obj.value_text

    def get_additionalInfo(self, obj):
        return {
            "plot_number": obj.plot.plot_number,
            "rep": obj.plot.rep,
            "block": obj.plot.block,
            "row": obj.plot.row,
            "column": obj.plot.column,
        }


class BrapiObservationVariableSerializer(serializers.ModelSerializer):
    observationVariableDbId = serializers.SerializerMethodField()
    observationVariableName = serializers.CharField(source="name", read_only=True)
    observationVariableCode = serializers.CharField(
        source="variable_code", read_only=True
    )
    description = serializers.CharField(read_only=True)
    defaultValue = serializers.SerializerMethodField()
    scale = serializers.SerializerMethodField()
    method = serializers.SerializerMethodField()
    trait = serializers.SerializerMethodField()

    class Meta:
        model = ObservationVariable
        fields = [
            "observationVariableDbId",
            "observationVariableName",
            "observationVariableCode",
            "description",
            "defaultValue",
            "scale",
            "method",
            "trait",
        ]

    def get_observationVariableDbId(self, obj):
        return str(obj.id)

    def get_defaultValue(self, obj):
        return None

    def get_scale(self, obj):
        return {
            "scaleDbId": f"scale_{obj.id}",
            "scaleName": obj.unit or "unitless",
            "dataType": obj.data_type,
            "validValues": {
                "min": obj.min_value,
                "max": obj.max_value,
            },
        }

    def get_method(self, obj):
        return {
            "methodDbId": f"method_{obj.id}",
            "methodName": obj.name,
            "description": obj.description,
        }

    def get_trait(self, obj):
        return {
            "traitDbId": f"trait_{obj.id}",
            "traitName": obj.name,
            "description": obj.description,
        }


class BrapiLocationSerializer(serializers.ModelSerializer):
    locationDbId = serializers.SerializerMethodField()
    locationName = serializers.CharField(source="name", read_only=True)
    latitude = serializers.FloatField(read_only=True)
    longitude = serializers.FloatField(read_only=True)
    countryName = serializers.CharField(source="country", read_only=True)
    countryCode = serializers.SerializerMethodField()
    additionalInfo = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = [
            "locationDbId",
            "locationName",
            "latitude",
            "longitude",
            "countryName",
            "countryCode",
            "additionalInfo",
        ]

    def get_locationDbId(self, obj):
        return str(obj.id)

    def get_countryCode(self, obj):
        if obj.country:
            return obj.country[:3].upper()
        return None

    def get_additionalInfo(self, obj):
        return {
            "region": obj.region,
        }


class BrapiProgramSerializer(serializers.ModelSerializer):
    programDbId = serializers.SerializerMethodField()
    programName = serializers.CharField(source="name", read_only=True)
    commonCropName = serializers.CharField(source="crop", read_only=True)
    objective = serializers.CharField(source="description", read_only=True)
    abbreviation = serializers.SerializerMethodField()
    additionalInfo = serializers.SerializerMethodField()

    class Meta:
        model = Program
        fields = [
            "programDbId",
            "programName",
            "commonCropName",
            "objective",
            "abbreviation",
            "additionalInfo",
        ]

    def get_programDbId(self, obj):
        return str(obj.id)

    def get_abbreviation(self, obj):
        if obj.name:
            return "".join([w[0].upper() for w in obj.name.split() if w])
        return None

    def get_additionalInfo(self, obj):
        return {}


class BrapiObservationUnitSerializer(serializers.ModelSerializer):
    observationUnitDbId = serializers.SerializerMethodField()
    observationUnitName = serializers.SerializerMethodField()
    studyDbId = serializers.SerializerMethodField()
    studyName = serializers.CharField(source="trial.name", read_only=True)
    germplasmDbId = serializers.CharField(
        source="germplasm.germplasm_db_id", read_only=True
    )
    germplasmName = serializers.CharField(source="germplasm.name", read_only=True)
    observationUnitPosition = serializers.SerializerMethodField()
    additionalInfo = serializers.SerializerMethodField()

    class Meta:
        model = Plot
        fields = [
            "observationUnitDbId",
            "observationUnitName",
            "studyDbId",
            "studyName",
            "germplasmDbId",
            "germplasmName",
            "observationUnitPosition",
            "additionalInfo",
        ]

    def get_observationUnitDbId(self, obj):
        return str(obj.id)

    def get_observationUnitName(self, obj):
        return f"Plot {obj.plot_number}"

    def get_studyDbId(self, obj):
        return str(obj.trial.id)

    def get_observationUnitPosition(self, obj):
        return {
            "replicate": str(obj.rep) if obj.rep else None,
            "blockNumber": str(obj.block) if obj.block else None,
            "rowNumber": str(obj.row) if obj.row else None,
            "columnNumber": str(obj.column) if obj.column else None,
            "entryType": "check" if obj.rep > 1 else "test",
            "observationLevel": {
                "levelName": "plot",
                "levelCode": str(obj.plot_number),
            },
        }

    def get_additionalInfo(self, obj):
        return {
            "status": obj.status,
        }


class BrapiObservationWriteSerializer(serializers.Serializer):
    observationUnitDbId = serializers.CharField(source="plot_id", required=False)
    observationVariableDbId = serializers.CharField(source="variable_id", required=False)
    value = serializers.CharField(required=False)
    observationTimeStamp = serializers.DateTimeField(
        source="observation_time", required=False, allow_null=True
    )

    def validate_observationUnitDbId(self, value):
        try:
            val_int = int(value)
        except ValueError:
            raise serializers.ValidationError("Must be an integer ID.")
        if not Plot.objects.filter(id=val_int).exists():
            raise serializers.ValidationError("Unknown plot.")
        return val_int

    def validate_observationVariableDbId(self, value):
        try:
            val_int = int(value)
        except ValueError:
            raise serializers.ValidationError("Must be an integer ID.")
        if not ObservationVariable.objects.filter(id=val_int).exists():
            raise serializers.ValidationError("Unknown variable.")
        return val_int

    def validate(self, attrs):
        if self.instance is None:
            if "plot_id" not in attrs:
                raise serializers.ValidationError({"observationUnitDbId": "This field is required."})
            if "variable_id" not in attrs:
                raise serializers.ValidationError({"observationVariableDbId": "This field is required."})
            if "value" not in attrs:
                raise serializers.ValidationError({"value": "This field is required."})

        var_id = attrs.get("variable_id")
        if var_id:
            variable = ObservationVariable.objects.get(id=var_id)
            attrs["_variable"] = variable
        elif self.instance:
            attrs["_variable"] = self.instance.variable

        return attrs

    def create(self, validated_data):
        from django.core.exceptions import ValidationError
        variable = validated_data.pop("_variable")
        obs = Observation(
            plot_id=validated_data["plot_id"],
            variable=variable,
            observation_time=validated_data.get("observation_time"),
        )
        obs.set_typed_value(validated_data["value"])
        try:
            obs.full_clean()
        except ValidationError as e:
            raise serializers.ValidationError(e.message_dict)
        obs.save()
        return obs

    def update(self, instance, validated_data):
        from django.core.exceptions import ValidationError
        if "value" in validated_data:
            instance.set_typed_value(validated_data["value"])
        if "observation_time" in validated_data:
            instance.observation_time = validated_data["observation_time"]
        try:
            instance.full_clean()
        except ValidationError as e:
            raise serializers.ValidationError(e.message_dict)
        instance.save()
        return instance


class BrapiObservationUnitWriteSerializer(serializers.Serializer):
    observationUnitState = serializers.CharField(required=False)
    additionalInfo = serializers.DictField(required=False)
    observationUnitPosition = serializers.DictField(required=False)

    def validate(self, attrs):
        if "observationUnitPosition" in attrs:
            raise serializers.ValidationError(
                "Plot layout (position/block/replication) cannot be "
                "modified via BrAPI. Update status only, or use "
                "the internal API for layout changes."
            )
        return attrs

    def update(self, instance, validated_data):
        from django.core.exceptions import ValidationError
        status_val = None
        if "observationUnitState" in validated_data:
            status_val = validated_data["observationUnitState"]
        elif "additionalInfo" in validated_data:
            status_val = validated_data["additionalInfo"].get("status")

        if status_val is not None:
            choices = [c[0] for c in Plot.STATUS_CHOICES]
            if status_val not in choices:
                raise serializers.ValidationError(
                    {"observationUnitState": f"Invalid status choice. Must be one of {choices}"}
                )
            instance.status = status_val

        try:
            instance.full_clean()
        except ValidationError as e:
            raise serializers.ValidationError(e.message_dict)
        instance.save()
        return instance


class BrapiGermplasmWriteSerializer(serializers.Serializer):
    germplasmName = serializers.CharField()
    accessionNumber = serializers.CharField(required=False)
    germplasmDbId = serializers.CharField(required=False)
    pedigree = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    breedingMethod = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    yearOfDevelopment = serializers.IntegerField(required=False, allow_null=True)
    programDbId = serializers.CharField()

    def validate_programDbId(self, value):
        try:
            val_int = int(value)
        except ValueError:
            raise serializers.ValidationError("Must be an integer ID.")
        if not Program.objects.filter(id=val_int).exists():
            raise serializers.ValidationError("Unknown program.")
        return val_int

    def create(self, validated_data):
        from django.core.exceptions import ValidationError
        germplasm_db_id = validated_data.get("germplasmDbId") or validated_data.get("accessionNumber")
        if not germplasm_db_id:
            import uuid
            germplasm_db_id = f"GERM-{uuid.uuid4().hex[:6].upper()}"

        program = Program.objects.get(id=int(validated_data["programDbId"]))
        germplasm_data = {
            "name": validated_data["germplasmName"],
            "germplasm_db_id": germplasm_db_id,
            "program": program,
            "pedigree_string": validated_data.get("pedigree", ""),
            "cross_type": validated_data.get("breedingMethod", ""),
            "year_developed": validated_data.get("yearOfDevelopment"),
        }

        try:
            germ = Germplasm(**germplasm_data)
            germ.full_clean()
            germ.save()
            return germ
        except ValidationError as e:
            raise serializers.ValidationError(e.message_dict)
