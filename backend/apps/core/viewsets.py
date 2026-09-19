from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from .mixins import ProgramScopedQuerySetMixin
from .models import Location, Program, Season, UserProfile, WeatherObservation
from .permissions import RoleBasedPermission
from .serializers import (
    LocationSerializer,
    ProgramSerializer,
    SeasonSerializer,
    UserProfileSerializer,
    WeatherObservationSerializer,
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

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        from apps.trials.models import Trial
        from apps.germplasm.models import Cross

        season = self.get_object()
        trials_qs = Trial.objects.filter(season=season).select_related("location")
        trial_summary = [
            {
                "trial_code": t.trial_code, "name": t.name,
                "location_name": t.location.name if t.location else None,
                "design_type": t.design_type, "status": t.status,
                "plot_count": t.plots.count(),
            }
            for t in trials_qs
        ]

        crosses_qs = Cross.objects.filter(crossing_block__season=season)
        cross_counts_by_status = {
            status_key: crosses_qs.filter(status=status_key).count()
            for status_key, _ in Cross.CROSS_STATUS_CHOICES
        }

        return Response({
            "season_id": season.id,
            "season_name": season.name,
            "year": season.year,
            "trial_count": trials_qs.count(),
            "trials": trial_summary,
            "cross_count": crosses_qs.count(),
            "cross_counts_by_status": cross_counts_by_status,
        })

    @action(detail=True, methods=["post"], url_path="create_share_link")
    def create_share_link(self, request, pk=None):
        import secrets
        from datetime import timedelta
        from django.utils import timezone
        from .models import ShareLink

        season = self.get_object()
        days_valid = int(request.data.get("days_valid", 30))
        link = ShareLink.objects.create(
            token=secrets.token_urlsafe(32),
            target_type="season_summary",
            target_id=season.id,
            expires_at=timezone.now() + timedelta(days=days_valid),
            created_by=request.user,
        )
        return Response({"token": link.token, "expires_at": link.expires_at})


class WeatherObservationViewSet(viewsets.ModelViewSet):
    queryset = WeatherObservation.objects.select_related("location").all()
    serializer_class = WeatherObservationSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder", "technician"}
    search_fields = ["location__name", "source"]
    ordering_fields = ["date", "temp_min_c", "temp_max_c", "precipitation_mm"]
    filterset_fields = ["location", "date", "source"]

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser], url_path="import_csv")
    def import_csv(self, request):
        from apps.core.spreadsheet import read_spreadsheet_rows, SpreadsheetReadError
        from datetime import datetime
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "File is required (form key 'file')."}, status=400)

        try:
            headers, rows = read_spreadsheet_rows(file_obj, file_obj.name)
        except SpreadsheetReadError as exc:
            return Response({"detail": str(exc)}, status=400)

        fallback_loc_id = request.data.get("location_id") or request.data.get("location")
        created_count = 0
        updated_count = 0
        errors = []

        for idx, row in enumerate(rows, start=2):
            loc_val = row.get("location") or row.get("location_id") or row.get("location_name") or fallback_loc_id
            date_str = row.get("date")
            if not loc_val or not date_str:
                errors.append({"row": idx, "detail": "Missing required 'location' or 'date' column."})
                continue

            # Resolve location by id or name
            loc_obj = None
            if str(loc_val).isdigit():
                loc_obj = Location.objects.filter(pk=int(loc_val)).first()
            if not loc_obj:
                loc_obj = Location.objects.filter(name__iexact=str(loc_val).strip()).first()
            if not loc_obj:
                errors.append({"row": idx, "detail": f"Location '{loc_val}' not found."})
                continue

            # Parse date
            parsed_date = None
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
                try:
                    parsed_date = datetime.strptime(str(date_str).strip(), fmt).date()
                    break
                except ValueError:
                    pass
            if not parsed_date:
                errors.append({"row": idx, "detail": f"Invalid date format '{date_str}'. Expected YYYY-MM-DD."})
                continue

            def parse_float(val):
                if val is None or str(val).strip() == "":
                    return None
                try:
                    return float(val)
                except ValueError:
                    return None

            temp_min = parse_float(row.get("temp_min_c") or row.get("temp_min"))
            temp_max = parse_float(row.get("temp_max_c") or row.get("temp_max"))
            precip = parse_float(
                row.get("precipitation_mm") or row.get("precipitation") or row.get("rainfall_mm") or row.get("rainfall")
            )
            src = row.get("source") or "csv import"

            obj, created = WeatherObservation.objects.update_or_create(
                location=loc_obj,
                date=parsed_date,
                defaults={
                    "temp_min_c": temp_min,
                    "temp_max_c": temp_max,
                    "precipitation_mm": precip,
                    "source": src,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        return Response({
            "created_count": created_count,
            "updated_count": updated_count,
            "errors": errors,
        })



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
