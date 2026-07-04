import pytest
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView


@pytest.fixture(autouse=True)
def patch_django_test_client_copy_for_python314(monkeypatch):
    """
    Workaround for Python 3.14 template context copying bug in Django's test client.
    Captures AttributeError when context is copied and stores it without copying.
    """
    import django.test.client

    original = django.test.client.store_rendered_templates

    def patched_store(store, signal, sender, template, context, **kwargs):
        try:
            return original(store, signal, sender, template, context, **kwargs)
        except AttributeError:
            store["templates"].append(template)
            store["context"].append(context)

    monkeypatch.setattr(django.test.client, "store_rendered_templates", patched_store)


@pytest.mark.django_db
def test_api_schema_endpoint(api_client):
    response = api_client.get("/api/schema/")
    assert response.status_code == status.HTTP_200_OK
    assert b"openapi: 3." in response.content


@pytest.mark.django_db
def test_swagger_ui_endpoint(api_client):
    response = api_client.get("/api/schema/swagger-ui/")
    assert response.status_code == status.HTTP_200_OK
    assert b"swagger-ui" in response.content.lower()


@pytest.mark.django_db
def test_redoc_endpoint(api_client):
    response = api_client.get("/api/schema/redoc/")
    assert response.status_code == status.HTTP_200_OK
    assert b"redoc" in response.content.lower()


# Mock throttles with very low rates for testing to avoid global settings caching issues
class MockAnonThrottle(AnonRateThrottle):
    def get_rate(self):
        return "1/day"


class MockUserThrottle(UserRateThrottle):
    def get_rate(self):
        return "2/day"


class MockThrottledView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [MockAnonThrottle, MockUserThrottle]

    def get(self, request):
        return Response({"status": "ok"})


@pytest.mark.django_db
def test_rate_limiting_anon():
    from django.core.cache import cache

    cache.clear()
    factory = APIRequestFactory()
    view = MockThrottledView.as_view()

    # First request: allowed
    request1 = factory.get("/fake/")
    response1 = view(request1)
    assert response1.status_code == status.HTTP_200_OK

    # Second request: throttled
    request2 = factory.get("/fake/")
    response2 = view(request2)
    assert response2.status_code == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
def test_caching_configuration():
    from django.core.cache import cache

    cache.set("test_key", "test_value", 30)
    assert cache.get("test_key") == "test_value"
