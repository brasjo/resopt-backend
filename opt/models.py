import json
import logging
import os
import shutil
from pathlib import Path
from datetime import datetime, timedelta

from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django_backend.utils.aws import generate_presigned_url
from django.conf import settings

from resopt_utils.parser import parse_content, guess_content_type, DictResult
from resopt_utils.ssim import parse_ssim_text, expand_ssim_file, ssim_date_span
from resopt_utils.utils import check_period_span
from schemas.loader import get_opt_input_builder_class, InputBuilder
from logify.log import logs_for_instance


INPUT_BUILDER_TEMPLATE_CONTENT = settings.INPUT_BUILDER_TEMPLATE_CONTENT
INPUT_BUILDER_FILENAME = settings.INPUT_BUILDER_FILENAME
USER_INPUT_FILENAME = settings.USER_INPUT_FILENAME
AWS_LOCATION = settings.AWS_LOCATION
AWS_PRESIGNED_URL_EXPIRATION = settings.AWS_PRESIGNED_URL_EXPIRATION
RUN_SUMMARY_FILENAME = settings.RUN_SUMMARY_FILENAME
UNLOCK_SCENARIO_ON_STATUSES = set(('pending',))
SSIM_MAX_IMPORT_SPAN_DAYS = settings.SSIM_MAX_IMPORT_SPAN_DAYS
SCENARIO_MAX_PERIOD_DAYS = settings.SCENARIO_MAX_PERIOD_DAYS
SSIM_IMPORT_BUFFER_DAYS = settings.SSIM_IMPORT_BUFFER_DAYS

logger = logging.getLogger(__name__)
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
    STOPPED = 'stopped'

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
        (STOPPED, 'Stopped'),
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
        profile = getattr(self.user, 'profile', None)
        if profile and profile.is_admin:
            return False
        return self.status not in UNLOCK_SCENARIO_ON_STATUSES

    def save(self, *args, **kwargs):
        logger.debug(f"Creating new OptimizationScenario {self.id} for user {self.user.username}")
        if not self.run_directory:
            self.run_directory = generate_run_directory(self.user.username)
            logger.debug(f"Generated run directory: {self.run_directory}")
        old_input_builder = self.input_builder
        super().save(*args, **kwargs)
        if not self.input_builder:
            if old_input_builder:
                logger.debug(f"Deleting old input file: {old_input_builder.name}")
                old_input_builder.delete(save=False)
            content = INPUT_BUILDER_TEMPLATE_CONTENT.encode()
            self.input_builder.save(INPUT_BUILDER_FILENAME, ContentFile(content), save=True)
        if not self.user_input:
            logger.debug(f"Creating empty user input file for OptimizationScenario {self.id}")
            content = b"{}"
            self.user_input.save(USER_INPUT_FILENAME, ContentFile(content), save=True)

    def __str__(self):
        return f"OptimizationScenario {self.id} - Status: {self.status}"

    def delete(self, *args, **kwargs):
        # Django's cascade delete (on_delete=CASCADE on OutputFile.run) does
        # a bulk QuerySet.delete() for the related rows, which does NOT call
        # each instance's own overridden delete() - so OutputFile's own file
        # cleanup (self.file.delete(save=False)) would silently be skipped
        # and every solution file would be left orphaned in storage. Delete
        # each one explicitly here instead of leaving it to cascade.
        for output_file in self.output_files.all():
            output_file.delete()
        # This model's own FileFields aren't covered by cascade at all
        # (they're not related objects, just fields) - nothing deletes them
        # unless done explicitly.
        for field_file in (self.input_builder, self.user_input, self.run_summary_file):
            if field_file:
                field_file.delete(save=False)
        # LogEntry uses a GenericForeignKey (content_type + object_id), not
        # a real FK - Django has no on_delete behavior for those at all, so
        # without this these rows would reference a since-deleted scenario
        # forever.
        logs_for_instance(self).delete()
        # FileField.delete() above removes each file but leaves the now-
        # empty run_directory behind (found via real usage - deleting a
        # scenario left an empty media/<user>/<timestamp>/ directory).
        # Remove the whole directory tree, not just os.rmdir (which would
        # only succeed if it's already empty and there's no guarantee every
        # file under it was created via a tracked FileField). Local
        # filesystem storage only - default_storage.path() raises
        # NotImplementedError for S3, which has no real directories to
        # clean up in the first place (deleting every object under a
        # prefix already leaves nothing behind).
        if self.run_directory:
            try:
                dir_path = default_storage.path(self.run_directory)
            except NotImplementedError:
                dir_path = None
            if dir_path and os.path.isdir(dir_path):
                try:
                    shutil.rmtree(dir_path)
                except OSError as e:
                    logger.warning(
                        "Could not remove run directory %s for deleted scenario %s: %s",
                        dir_path, self.pk, e,
                    )
        super().delete(*args, **kwargs)

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
        if guess_content_type(content) == 'ssim':
            return self._parse_ssim_upload(content)
        return parse_content(content, self.builder_cls.model_classes())

    def _parse_ssim_upload(self, content: str) -> DictResult:
        """SSIM-specific: a large file can't be imported wholesale (see
        SSIM_MAX_IMPORT_SPAN_DAYS/CLAUDE.md's "SSIM import scoping"
        section) - it's the user's responsibility to scope the data down
        to something reasonable, by setting this scenario's period first,
        not this method's job to guess a sensible slice.
        """
        ssim_file = parse_ssim_text(content)
        span = ssim_date_span(ssim_file)
        if span is None:
            return DictResult(errors=["SSIM file contained no flight legs to import"])
        span_start, span_end = span
        span_days = (span_end - span_start).days

        if span_days <= SSIM_MAX_IMPORT_SPAN_DAYS:
            flights = list(expand_ssim_file(ssim_file))
            if not flights:
                return DictResult(errors=["SSIM file contained no flight legs to import"])
            return DictResult(items={'flights': flights})

        period_start = self.get_period_start()
        period_end = self.get_period_end()
        if not period_start or not period_end:
            return DictResult(errors=[
                f"SSIM file spans {span_days} days ({span_start} to {span_end}), "
                f"which exceeds the {SSIM_MAX_IMPORT_SPAN_DAYS}-day import limit. "
                "Set this scenario's period start/end first, then re-upload - "
                f"only flights within that period (plus a {SSIM_IMPORT_BUFFER_DAYS}-day "
                "buffer on each side) will be imported."
            ])

        period_error = check_period_span(
            period_start, period_end, SCENARIO_MAX_PERIOD_DAYS, label="Scenario period",
        )
        if period_error:
            return DictResult(errors=[period_error])

        buffer = timedelta(days=SSIM_IMPORT_BUFFER_DAYS)
        window = ((period_start - buffer).date(), (period_end + buffer).date())
        flights = list(expand_ssim_file(ssim_file, window=window))
        if not flights:
            return DictResult(errors=[
                f"SSIM file spans {span_days} days but none of it falls within "
                f"this scenario's period ({period_start} to {period_end}, plus a "
                f"{SSIM_IMPORT_BUFFER_DAYS}-day buffer on each side)."
            ])
        return DictResult(items={'flights': flights})

    def update_input(self, content: str) -> list[str]:
        result = self.parse_content(content)
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
        # By design: a top-level key present in `data` (e.g. "flights")
        # REPLACES that entire list on the scenario, it doesn't merge/append
        # into what's already there. If an uploaded file contains flights,
        # all existing flights are gone - the user is expected to combine/
        # curate their data into one file before uploading, not upload
        # incremental additions across multiple files. Same for aircrafts,
        # maintenances, etc. Don't "fix" this into a merge without checking
        # with the user first - it's intentional.
        current_data = self.read_builder_data()
        logger.debug(f"Updating input builder with data: {data}")
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


class OptimizationRun(models.Model):
    """
    One row per optimizer subprocess launch (i.e. per job_id), not per
    scenario - a scenario can be resubmitted multiple times (see
    send_to_optimizer_view). This is the source of truth for run
    wall-clock time, to be summed later for org billing minutes.

    started_at/ended_at bound only the time the optimizer subprocess was
    actually running - not SQS queue-wait or S3 download/setup time. That
    window is what billing should ultimately meter, so it's tracked
    separately from queued_at.
    """
    QUEUED = 'queued'
    RUNNING = 'running'
    COMPLETED = 'completed'
    ERROR = 'error'
    TIMEOUT = 'timeout'
    STOPPED = 'stopped'

    STATUS_CHOICES = [
        (QUEUED, 'Queued'),
        (RUNNING, 'Running'),
        (COMPLETED, 'Completed'),
        (ERROR, 'Error'),
        (TIMEOUT, 'Timeout'),
        (STOPPED, 'Stopped'),
    ]

    scenario = models.ForeignKey(
        OptimizationScenario,
        on_delete=models.CASCADE,
        related_name='optimization_runs',
    )
    job_id = models.CharField(max_length=255, unique=True, db_index=True)
    response_queue = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=20, default=QUEUED, choices=STATUS_CHOICES)
    # SQS request-receipt time - NOT the billing clock.
    queued_at = models.DateTimeField(auto_now_add=True)
    # opt-server's real subprocess.Popen() launch time - the billing clock start.
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    # Denormalized so future billing sums don't need to recompute from
    # started_at/ended_at repeatedly; populated when ended_at is set.
    duration_seconds = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ['-queued_at']

    def __str__(self):
        return f"OptimizationRun {self.job_id} ({self.status})"

    def mark_started(self, started_at):
        self.status = self.RUNNING
        self.started_at = started_at
        self.save(update_fields=['status', 'started_at'])

    def mark_ended(self, status: str, ended_at):
        self.status = status
        self.ended_at = ended_at
        if self.started_at:
            self.duration_seconds = (ended_at - self.started_at).total_seconds()
        self.save(update_fields=['status', 'ended_at', 'duration_seconds'])
