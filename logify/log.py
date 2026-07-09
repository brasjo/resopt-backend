from django.contrib.contenttypes.models import ContentType
from django.db.models import QuerySet

from .models import LogEntry


def _log_event(instance, level, msg, source=None, extra=None) -> LogEntry:
    content_type = ContentType.objects.get_for_model(instance)
    return LogEntry.objects.create(
        content_type=content_type,
        object_id=instance.pk,
        level=level,
        msg=msg,
        source=source,
        extra=extra or {},
    )


def log_info(instance, msg, source=None, extra=None) -> LogEntry:
    return _log_event(instance, "INFO", msg, source, extra)



def log_warning(instance, msg, source=None, extra=None) -> LogEntry:
    return _log_event(instance, "WARNING", msg, source, extra)


def log_error(instance, msg, source=None, extra=None) -> LogEntry:
    return _log_event(instance, "ERROR", msg, source, extra)


def logs_for_instance(instance) -> QuerySet[LogEntry]:
    """
    Return all LogEntry objects for a given model instance,
    ordered by most recent first.
    """
    content_type = ContentType.objects.get_for_model(
        instance,
        for_concrete_model=False,
    )
    return LogEntry.objects.filter(
        content_type=content_type,
        object_id=instance.pk,
    ).order_by("timestamp")