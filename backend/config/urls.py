from django.contrib import admin
from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/token/', obtain_auth_token, name='api-token-auth'),
    path('api/', include('apps.core.urls')),
    path('api/', include('apps.germplasm.urls')),
    path('api/', include('apps.trials.urls')),
]
