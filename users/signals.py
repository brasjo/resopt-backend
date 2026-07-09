# signals.py
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import UserProfile, Organization
from params.models import ParameterSet


User = get_user_model()
DEFAULT_PARAMETER_SET_CONTENT = settings.DEFAULT_PARAMETER_SET_CONTENT


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        if not hasattr(instance, 'profile'):
            UserProfile.objects.create(user=instance)


@receiver(post_save, sender=Organization)
def create_default_parameter_set(sender, instance, created, **kwargs):
    if created:
        param_set = ParameterSet.objects.filter(
            name='default',
            organization=instance,
        ).first()
        if not param_set:
            param_set = ParameterSet.objects.create(
                name='default',
                organization=instance,
            )
            param_set.params.save(
                'default_parameters.json',
                ContentFile(DEFAULT_PARAMETER_SET_CONTENT.encode()),
            )
            param_set.save()
