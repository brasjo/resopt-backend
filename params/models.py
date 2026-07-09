from pathlib import Path
import json

from django.db import models
from django.contrib.auth import get_user_model


User = get_user_model()


def file_upload_to(instance, filename) -> str:
    path = Path(instance.organization.name) / 'parameter_sets' / filename
    return str(path)


class ParameterSet(models.Model):
    """
    Model to store a set of parameters for an optimization run.
    """
    name = models.CharField(
        max_length=255,
        help_text="Name of the parameter set.",
    )
    description = models.TextField(
        blank=True,
        null=True,
        help_text="Description of the parameter set.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    organization = models.ForeignKey(
        'users.Organization',
        on_delete=models.CASCADE,
        related_name='parameter_sets',
        help_text="Organization this parameter set belongs to.",
    )
    params = models.FileField(
        upload_to=file_upload_to,
        blank=True,
        null=True,
        help_text="File containing the parameters in JSON format."
    )

    def __str__(self):
        return f"ParameterSet {self.id} {self.name} - Created at {self.created_at}"

    class Meta:
        verbose_name = "Parameter Set"
        verbose_name_plural = "Parameter Sets"
        ordering = ['organization', '-created_at']
        unique_together = ('name', 'organization')

    def read_data(self) -> dict:
        """
        Reads the parameters from the associated file and returns a Parameters object.
        """
        if not self.params:
            return {}
        with open(self.params.path, 'r') as f:
            return json.load(f)
