def safe_int(value, default=None):
    """Parse `value` as an int, returning `default` if it's missing or invalid."""
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_float(value, default=None):
    """Parse `value` as a float, returning `default` if it's missing or invalid."""
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
