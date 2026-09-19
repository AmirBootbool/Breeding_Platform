from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import ShareLink


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_season_summary(request, token):
    try:
        link = ShareLink.objects.get(token=token)
    except ShareLink.DoesNotExist:
        return Response({"detail": "Link not found."}, status=404)
    if not link.is_valid():
        return Response({"detail": "This link has expired."}, status=410)
    if link.target_type != "season_summary":
        return Response({"detail": "Unsupported link type."}, status=400)

    from apps.trials.models import Trial
    from apps.germplasm.models import Cross
    from .models import Season

    try:
        season = Season.objects.get(pk=link.target_id)
    except Season.DoesNotExist:
        return Response({"detail": "Season no longer exists."}, status=404)

    trials_qs = Trial.objects.filter(season=season).select_related("location")
    trial_summary = [
        {"trial_code": t.trial_code, "name": t.name, "status": t.status, "plot_count": t.plots.count()}
        for t in trials_qs
    ]
    crosses_qs = Cross.objects.filter(crossing_block__season=season)

    return Response({
        "season_name": season.name,
        "year": season.year,
        "trial_count": trials_qs.count(),
        "trials": trial_summary,
        "cross_count": crosses_qs.count(),
    })
