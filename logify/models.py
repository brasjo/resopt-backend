from django.db import models
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey

from resopt_utils.utils import truncate_str


class LogEntry(models.Model):
    LEVEL_CHOICES = [
        ("INFO", "Info"),
        ("WARNING", "Warning"),
        ("ERROR", "Error"),
    ]

    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name="log_entries",
    )
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")

    timestamp = models.DateTimeField(auto_now_add=True)
    level = models.CharField(
        max_length=10,
        choices=LEVEL_CHOICES,
        default="INFO",
    )
    msg = models.TextField()
    source = models.CharField(max_length=255, blank=True, null=True)
    extra = models.JSONField(blank=True, null=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["timestamp"]),
            models.Index(fields=["level"]),
        ]

    def __str__(self):
        return f"[{self.level}] {self.timestamp}: {truncate_str(self.msg, 50)}"
