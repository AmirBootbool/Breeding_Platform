from rest_framework.exceptions import PermissionDenied

from django.db.models import Q


class ProgramScopedQuerySetMixin:
    """Restrict a ModelViewSet's queryset (and creates) to the requesting
    user's program.

    Only Django staff/superusers (platform operators) see everything.
    ``UserProfile.role == "admin"`` is a *program*-level admin, not a
    platform admin, and stays scoped to their own program like everyone
    else. A user with no profile or no assigned program gets an empty
    queryset and cannot create records - fail closed, not fail open.
    """

    #: Queryset filter path to the Program FK, e.g. "program_id" (direct),
    #: "trial__program_id" (one hop), or "female_parent__program_id"
    #: (through a specific relation).
    program_lookup = "program_id"

    #: Set True on models where a null program means "available to all
    #: programs" by design (e.g. DiagnosticMarker, TraitPanel), so those
    #: rows aren't hidden from anyone.
    allow_global_rows = False

    def _user_program_id(self):
        profile = getattr(self.request.user, "profile", None)
        return profile.program_id if profile else None

    def _is_platform_admin(self):
        user = self.request.user
        return bool(user.is_staff or user.is_superuser)

    def get_queryset(self):
        qs = super().get_queryset()
        if self._is_platform_admin():
            return qs

        program_id = self._user_program_id()
        if program_id is None:
            return qs.none()

        own_program = Q(**{self.program_lookup: program_id})
        if self.allow_global_rows:
            own_program |= Q(**{f"{self.program_lookup}__isnull": True})
        return qs.filter(own_program)

    def create(self, request, *args, **kwargs):
        # get_queryset() protects every read/update/delete by ID, but a
        # create targets a record that doesn't exist yet, so there is
        # nothing to filter. Reject an explicit attempt to create a record
        # under a program other than the requester's own. Only meaningful
        # for viewsets whose model has a direct writable `program` field -
        # indirect relations (e.g. a Plot created against a `trial` id) are
        # already protected because that parent id had to be readable
        # through this same scoping to be selected in the first place.
        if self.program_lookup == "program_id" and not self._is_platform_admin():
            submitted = request.data.get("program")
            if submitted not in (None, ""):
                try:
                    submitted_id = int(submitted)
                except (TypeError, ValueError):
                    submitted_id = None  # let normal serializer validation reject it
                if submitted_id is not None and submitted_id != self._user_program_id():
                    raise PermissionDenied(
                        "You cannot create records under a different program."
                    )
        return super().create(request, *args, **kwargs)
