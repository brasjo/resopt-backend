from rest_framework import permissions


class IsOwnerOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if hasattr(obj, 'user'):
            return obj.user == request.user
        elif hasattr(obj, 'run'):
            return obj.run.user == request.user
        return False


def has_admin_override(user) -> bool:
    """Superuser or org admin - bypasses ownership/status gates on a
    scenario (editing, stopping a run) that would otherwise apply."""
    if user.is_superuser:
        return True
    profile = getattr(user, 'profile', None)
    return bool(profile and profile.is_admin)


def is_scenario_locked(user, scenario) -> bool:
    """Whether `user` is blocked from editing `scenario` by its `locked`
    field (set while a run is actively in flight - see
    opt_msg_fetcher.py). Admins/superusers bypass it entirely - same
    precedence used for the stop-run permission check."""
    if has_admin_override(user):
        return False
    return scenario.locked
