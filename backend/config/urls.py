from rest_framework.authtoken.views import obtain_auth_token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from django.contrib import admin
from django.db import connection
from django.urls import include, path


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return Response({"status": "healthy", "database": "up"}, status=200)
    except Exception as e:
        return Response(
            {"status": "unhealthy", "database": "down", "error": str(e)},
            status=503,
        )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/token/", obtain_auth_token, name="api-token-auth"),
    path("api/health/", health_check, name="api-health"),
    path("api/", include("apps.core.urls")),
    path("api/", include("apps.germplasm.urls")),
    path("api/", include("apps.trials.urls")),
    path("brapi/v2/", include("apps.brapi.urls")),
]

