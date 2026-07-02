from rest_framework.permissions import SAFE_METHODS, BasePermission

from django.core.exceptions import ObjectDoesNotExist


class RoleBasedPermission(BasePermission):
    """Apply the small-team breeding roles exposed by UserProfile.role."""

    default_write_roles = {"admin"}

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.method in SAFE_METHODS:
            return True

        return self._user_role(request.user) in self._allowed_roles(view)

    def _allowed_roles(self, view):
        action_permissions = getattr(view, "role_action_permissions", {})
        action = getattr(view, "action", None)
        if action in action_permissions:
            return action_permissions[action]
        return getattr(view, "write_roles", self.default_write_roles)

    def _user_role(self, user):
        if user.is_superuser or user.is_staff:
            return "admin"

        try:
            return user.profile.role
        except ObjectDoesNotExist:
            return "viewer"
