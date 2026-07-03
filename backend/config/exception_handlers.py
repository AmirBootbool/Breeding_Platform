from rest_framework.views import exception_handler

from django.core.exceptions import ValidationError as DjangoValidationError


def api_exception_handler(exc, context):
    """Custom exception handler for REST Framework that structures error responses.

    Translates Django's ValidationError to DRF's ValidationError and wraps the
    response data in a dict containing status_code and errors keys.
    """
    if isinstance(exc, DjangoValidationError):
        from rest_framework.exceptions import ValidationError

        if hasattr(exc, "message_dict"):
            exc = ValidationError(detail=exc.message_dict)
        else:
            exc = ValidationError(detail=exc.messages)

    response = exception_handler(exc, context)

    if response is not None:
        response.data = {
            "status_code": response.status_code,
            "errors": response.data,
        }

    return response
