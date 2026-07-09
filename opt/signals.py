# signals.py
import os

from django.conf import settings
from django.core.files.base import ContentFile
from django.db.models.signals import post_delete, pre_save, post_save
from django.dispatch import receiver
from django_backend.utils.aws import get_s3_client

from .models import OptimizationScenario, OutputFile
from logify.log import log_info


INPUT_BUILDER_FILENAME = settings.INPUT_BUILDER_FILENAME


@receiver(pre_save, sender=OptimizationScenario)
def delete_input_builder_if_removed(sender, instance, **kwargs):
    content = ContentFile(settings.INPUT_BUILDER_TEMPLATE_CONTENT.encode())
    if not instance.pk:
        print("Creating new OptimizationScenario instance, setting default input file content.")
        instance.input_builder.save(INPUT_BUILDER_FILENAME, content, save=False)
        return


@receiver(pre_save, sender=OptimizationScenario)
def log_scenario_status_change(sender, instance, **kwargs):
    if not instance.pk:
        return  # new object, nothing to compare

    try:
        old_instance = sender.objects.get(pk=instance.pk)
    except sender.DoesNotExist:
        return

    if instance.status != old_instance.status:
        log_info(
            instance,
            f"OptimizationScenario {instance.id} status changed "
            f"from {old_instance.status} to {instance.status}"
        )


@receiver(post_save, sender=OutputFile)
def log_output_file_creation(sender, instance, created, **kwargs):
    if created:
        log_info(
            instance.run,
            f"Created OutputFile {instance.id} with filename {instance.file.name}"
        )


@receiver(post_delete, sender=OutputFile)
def delete_file_on_model_delete(sender, instance, **kwargs):
    if instance.file:
        file_name = instance.file.name

        if settings.STORAGE == 'local':
            try:
                file_path = instance.file.path
                if os.path.isfile(file_path):
                    os.remove(file_path)
                return None
            except Exception as e:
                print(f"Error deleting local file: {e}")
            return None
        s3 = get_s3_client()
        bucket_name = settings.AWS_STORAGE_BUCKET_NAME
        try:
            s3.delete_object(Bucket=bucket_name, Key=file_name)
        except Exception as e:
            print(f"Error deleting file from S3: {e}")
