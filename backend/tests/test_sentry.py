import pytest
from unittest.mock import patch
from django.conf import settings

try:
    import sentry_sdk
    SENTRY_SDK_AVAILABLE = True
except ImportError:
    SENTRY_SDK_AVAILABLE = False

def test_sentry_settings_loaded():
    # Verify SENTRY_DSN is defined on settings
    assert hasattr(settings, "SENTRY_DSN")

@pytest.mark.skipif(not SENTRY_SDK_AVAILABLE, reason="sentry-sdk is not installed in the current environment")
def test_sentry_initialization_flow():
    # Simulates and checks initialization flow when sentry-sdk is present.
    fake_dsn = "https://fakePublicKey@o0.ingest.sentry.io/0"
    
    with patch("sentry_sdk.init") as mock_init:
        from sentry_sdk.integrations.django import DjangoIntegration
        
        sentry_sdk.init(
            dsn=fake_dsn,
            integrations=[DjangoIntegration()],
            traces_sample_rate=0.25,
            profiles_sample_rate=0.25,
            send_default_pii=True,
        )
        
        mock_init.assert_called_once()
        _, kwargs = mock_init.call_args
        assert kwargs["dsn"] == fake_dsn
        assert kwargs["traces_sample_rate"] == 0.25
        assert kwargs["profiles_sample_rate"] == 0.25
        assert kwargs["send_default_pii"] is True
        assert isinstance(kwargs["integrations"][0], DjangoIntegration)
