import json
from pathlib import Path
from datetime import datetime

from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.core.files.base import ContentFile
from django_backend.utils.aws import generate_presigned_url
from django.conf import settings

from parser import parse_content, DictResult
from schemas.loader import get_opt_input_builder_class, InputBuilder


INPUT_BUILDER_TEMPLATE_CONTENT = settings.INPUT_BUILDER_TEMPLATE_CONTENT
INPUT_BUILDER_FILENAME = settings.INPUT_BUILDER_FILENAME
USER_INPUT_FILENAME = settings.USER_INPUT_FILENAME
AWS_LOCATION = settings.AWS_LOCATION
AWS_PRESIGNED_URL_EXPIRATION = settings.AWS_PRESIGNED_URL_EXPIRATION
RUN_SUMMARY_FILENAME = settings.RUN_SUMMARY_FILENAME
UNLOCK_SCENARIO_ON_STATUSES = set(('pending',))


User = get_user_model()


def presigned_url_with_aws_location(relpath: str) -> str:
    aws_path = Path(AWS_LOCATION)
    relpath = Path(relpath)
    path = aws_path / relpath
    return generate_presigned_url(
        str(path),
        expiration=AWS_PRESIGNED_URL_EXPIRATION,
    )


def generate_run_directory(username: str, now: datetime = None) -> str:
    now = now or timezone.now()
    timestamp = now.strftime('%Y%m%d_%H%M%S')
    return f"{username}/{timestamp}"


def file_upload_to(instance, filename) -> str:
    if isinstance(instance, OptimizationScenario):
        path = Path(instance.run_directory) / filename
    else:
        path = Path(instance.run.run_directory) / filename
    return str(path)


class OptimizationScenario(models.Model):
    """
    Model to store the results of an optimization run.
    """
    PENDING = 'pending'
    SENT = 'sent'
    IN_QUEUE = 'in_queue'
    PROCESSING = 'processing'
    COMPLETED = 'completed'
    TIMEOUT = 'timeout'
    ERROR = 'error'

    V1 = 'v1'

    VERSION_CHOICES = [
        (V1, 'v1')
    ]

    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (SENT, 'Sent'),
        (IN_QUEUE, 'In Queue'),
        (PROCESSING, 'Processing'),
        (TIMEOUT, 'Timeout'),
        (COMPLETED, 'Completed'),
        (ERROR, 'Error'),
    ]
    builder_version = models.CharField(
        max_length=3,
        default=V1,
        choices=VERSION_CHOICES,
    )
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20,
        default=PENDING,
        choices=STATUS_CHOICES,
    )
    run_directory = models.CharField(
        max_length=500,
        blank=True,
        editable=False,
        db_index=True,
    )
    input_builder = models.FileField(
        upload_to=file_upload_to,
        null=True,
        blank=True,
    )
    user_input = models.FileField(
        upload_to=file_upload_to,
        null=True,
        blank=True,
    )
    period_start = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Start date of the period for which the optimization is run."
    )
    period_end = models.DateTimeField(
        null=True,
        blank=True,
        help_text="End date of the period for which the optimization is run."
    )
    run_summary_file = models.FileField(
        upload_to=file_upload_to,
        null=True,
        blank=True,
        help_text="Optional summary file associated with the optimization run."
    )

    # Result outputs
    # report_file = models.FileField(upload_to='reports/', null=True, blank=True)
    run_summary = models.JSONField(null=True, blank=True)

    @property
    def is_locked(self) -> bool:
        if self.user.is_superuser:
            return False
        return self.status not in UNLOCK_SCENARIO_ON_STATUSES

    def save(self, *args, **kwargs):
        print(f"Creating new OptimizationScenario {self.id} for user {self.user.username}")
        if not self.run_directory:
            self.run_directory = generate_run_directory(self.user.username)
            print(f"Generated run directory: {self.run_directory}")
        old_input_builder = self.input_builder
        super().save(*args, **kwargs)
        if not self.input_builder:
            if old_input_builder:
                print(f"Deleting old input file: {old_input_builder.name}")
                old_input_builder.delete(save=False)
            content = INPUT_BUILDER_TEMPLATE_CONTENT.encode()
            self.input_builder.save(INPUT_BUILDER_FILENAME, ContentFile(content), save=True)
        if not self.user_input:
            print(f"Creating empty user input file for OptimizationScenario {self.id}")
            content = b"{}"
            self.user_input.save(USER_INPUT_FILENAME, ContentFile(content), save=True)

    def __str__(self):
        return f"OptimizationScenario {self.id} - Status: {self.status}"

    def get_period_start(self) -> datetime | None:
        if self.period_start:
            return self.period_start
        with self.input_builder.open() as file:
            input_builder_data = json.load(file)
            # Assuming the input file is a JSON or similar format that contains period_start
        input_builder = self.builder_cls(**input_builder_data)
        meta= input_builder.meta
        return meta.period_start

    def get_period_end(self) -> datetime | None:
        if self.period_end:
            return self.period_end
        input_builder_data = self.read_builder_data()
        # Assuming the input file is a JSON or similar format that contains period_end
        input_builder = self.builder_cls(**input_builder_data)
        meta= input_builder.meta
        return meta.period_end

    def read_builder_data(self) -> dict:
        # TODO make S3 compatible
        with open(self.input_builder.path) as f:
            return json.load(f)

    def create_builder(self) -> InputBuilder:
        """Create an InputBuilder instance from the stored input builder data.
        """
        data = self.read_builder_data()
        return self.builder_cls(**data)

    @property
    def builder_cls(self) -> type[InputBuilder]:
        return get_opt_input_builder_class(self.builder_version)

    def get_builder_cls(self) -> type[InputBuilder]:
        return get_opt_input_builder_class(self.builder_version)

    def read_run_summary(self) -> dict:
        with open(self.run_summary_file.path) as f:
            return json.load(f)

    def read_user_input(self) -> dict:
        if not self.user_input:
            return {}
        with open(self.user_input.path) as f:
            return json.load(f)

    def replace_run_summary(self, data: dict) -> None:
        if not self.run_summary_file:
            self.run_summary_file.save(
                RUN_SUMMARY_FILENAME,
                ContentFile(json.dumps(data, indent=4)),
            )
            return
        with self.run_summary_file.open('w') as f:
            json.dump(data, f, indent=4)

    def parse_content(self, content: str) -> DictResult | None:
        return parse_content(content, self.builder_cls.model_classes())

    def update_input(self, content: str) -> list[str]:
        result = self.parse_content(content)
        # print("Update input parse result:", result)
        if result.errors:
            return result.errors
        new_data_parsed = result.items
        self.update_user_input(new_data_parsed)
        self.update_input_builder(new_data_parsed)
        return []

    def update_user_input(self, data: dict) -> None:
        current_data = self.read_user_input()
        current_data.update(data)
        # Last validation before save
        _builder = self.builder_cls(**current_data)
        current_file = ContentFile(json.dumps(current_data, indent=4))
        self.user_input.save(USER_INPUT_FILENAME, current_file, save=False)

    def update_input_builder(self, data: dict) -> None:
        current_data = self.read_builder_data()
        print("Updating input builder with data:", data)
        current_data.update(data)
        # Last validation before save
        builder = self.builder_cls(**current_data)
        current_file = ContentFile(builder.model_dump_json(indent=4))
        self.input_builder.save(INPUT_BUILDER_FILENAME, current_file, save=False)

    def save_builder(self, builder: InputBuilder) -> None:
        self.builder_cls.model_validate(builder.model_dump())
        content_file = ContentFile(builder.model_dump_json(indent=4))
        self.input_builder.save(
            INPUT_BUILDER_FILENAME,
            content_file,
            save=False,
        )


class OutputFile(models.Model):
    run = models.ForeignKey(
        OptimizationScenario,
        on_delete=models.CASCADE,
        related_name='output_files',
    )
    file = models.FileField(upload_to=file_upload_to)
    # file = models.FileField(upload_to=file_upload_to)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return Path(self.file.name).name

    def delete(self, *args, **kwargs):
        if self.file:
            self.file.delete(save=False)  # This deletes the file from storage (S3)
        super().delete(*args, **kwargs)

    def read_content(self) -> str:
        with self.file.open('r') as f:
            return f.read()

    @property
    def get_presigned_url(self):
        return presigned_url_with_aws_location(
            self.file.name,
        )
