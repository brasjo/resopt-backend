from datetime import timedelta

from django import template

from resopt_utils.utils import timedelta_to_hhmmss

register = template.Library()


@register.filter
def hhmm(total_seconds):
    if total_seconds is None:
        return "—"
    return timedelta_to_hhmmss(timedelta(seconds=total_seconds))
