import json
from datetime import timezone as dt_timezone
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from botocore.exceptions import ClientError

from opt.models import OptimizationRun, OptimizationScenario, OutputFile

from aws import sqs, s3
from logify.log import log_info, log_error
from resopt_utils.utils import get_logger
from schemas.run_events import RunEvent, TERMINAL_STATUSES


logger = get_logger(__name__)


User = get_user_model()
OPTIMIZER_RESPONSE_QUEUE_URL = settings.OPTIMIZER_RESPONSE_QUEUE_URL
AWS_LOCATION = settings.AWS_LOCATION
INPUT_FILENAME = settings.INPUT_FILENAME


class Command(BaseCommand):
    help = 'Poll the optimizer response queue and apply results to OptimizationScenario records'

    def add_arguments(self, parser):
        # Add the -p or --purge flag
        parser.add_argument(
            '-p', '--purge',
            action='store_true',
            help='Purge the queue before starting'
        )

    def process_message(self, message) -> bool:
        """Handle a single SQS message. Returns whether it should be deleted
        from the queue: True once it's been fully handled or is permanently
        unprocessable (malformed body, scenario that no longer exists) -
        retrying either of those can't help. False leaves it in place so
        SQS redelivers it after the visibility timeout, for errors that
        might just be transient (e.g. a network blip talking to S3).
        """
        try:
            body = json.loads(message['Body'])
            scenario_id = body['opt_scenario_id']
            scenario = OptimizationScenario.objects.get(id=scenario_id)
        except (json.JSONDecodeError, KeyError) as e:
            self.stderr.write(f"Malformed message, dropping it: {message}: {e}")
            return True
        except OptimizationScenario.DoesNotExist:
            self.stderr.write(f"No OptimizationScenario found for scenario_id: {scenario_id}; dropping message")
            return True

        try:
            s3_key = body.get('s3_key')
            if not s3_key:
                status = body['status']
                if status == RunEvent.STARTING.value:
                    job_id = body['job_id']
                    started_at = parse_datetime(body['started_at'])
                    if started_at and timezone.is_aware(started_at):
                        # settings.py runs USE_TZ=False on SQLite; opt-server
                        # sends a UTC-aware ISO timestamp, which SQLite can't
                        # store as-is. TIME_ZONE='UTC' means naive
                        # timezone.now() values elsewhere are already UTC
                        # wall-clock, so converting to naive UTC here keeps
                        # duration_seconds math consistent with mark_ended's
                        # timezone.now() (also naive UTC under this config).
                        started_at = timezone.make_naive(started_at, dt_timezone.utc)
                    run, _created = OptimizationRun.objects.get_or_create(
                        job_id=job_id,
                        defaults={
                            'scenario': scenario,
                            'response_queue': body.get('response_queue', ''),
                        },
                    )
                    run.mark_started(started_at)
                    scenario.locked = True
                    scenario.save(update_fields=['locked'])
                    log_info(run, f"Run started at {started_at}", source=run.job_id)
                    self.stdout.write(
                        f"OptimizationRun {run.job_id} marked started at {started_at}"
                    )
                    return True
                if status == RunEvent.STOP_RECEIVED.value:
                    job_id = body.get('job_id')
                    if scenario.status != OptimizationScenario.ERROR:
                        scenario.status = OptimizationScenario.STOPPING
                        scenario.save(update_fields=['status'])
                    if job_id:
                        run = OptimizationRun.objects.filter(job_id=job_id).first()
                        if run:
                            run.mark_stopping()
                            log_info(run, "Run acknowledged stop request", source=run.job_id)
                        else:
                            self.stderr.write(f"No OptimizationRun found for job_id={job_id}; skipping stop ack")
                    self.stdout.write(f"OptimizationScenario {scenario.id} acknowledged stop request (job_id={job_id})")
                    return True
                if scenario.status in OptimizationScenario.TERMINAL_STATUSES:
                    # Already ended - a duplicate/late terminal event (e.g. a
                    # stray timeout from a second, concurrent execution of
                    # the same job_id after an SQS redelivery) must not
                    # overwrite the first, correct outcome.
                    self.stdout.write(
                        f"OptimizationScenario {scenario.id} already in terminal state "
                        f"({scenario.status}); ignoring late status update to {status}"
                    )
                else:
                    scenario.status = status
                    # This branch (no s3_key) only ever carries starting/
                    # stop_received (handled above) or one of the terminal
                    # statuses below - any of those means no run is actively
                    # in flight anymore.
                    scenario.locked = False
                    self.stdout.write(f"Updated OptimizationScenario {scenario.id} status to {status}")
                    scenario.save()
                job_id = body.get('job_id')
                if job_id and status in TERMINAL_STATUSES:
                    try:
                        run = OptimizationRun.objects.get(job_id=job_id)
                        if run.mark_ended(status, timezone.now()):
                            log_fn = log_error if status in (RunEvent.ERROR.value, RunEvent.TIMEOUT.value) else log_info
                            log_fn(run, f"Run ended: {status}", source=run.job_id)
                            self.stdout.write(f"OptimizationRun {job_id} marked {status}")
                        else:
                            self.stdout.write(
                                f"OptimizationRun {job_id} already in terminal state "
                                f"({run.status}); ignoring late status update to {status}"
                            )
                    except OptimizationRun.DoesNotExist:
                        self.stderr.write(
                            f"No OptimizationRun found for job_id={job_id}; skipping timing stamp"
                        )
                return True

            s3_key_path = Path(s3_key)
            folder = s3_key_path.parent
            run_directory = folder.relative_to(AWS_LOCATION)
            self.stdout.write(f"Derived run directory: {run_directory}")
            if scenario.status == OptimizationScenario.ERROR:
                self.stdout.write(
                    f"OptimizationScenario {scenario.id} already in error state; "
                    f"not moving it back to processing for {s3_key_path.name}"
                )
            else:
                if s3_key_path.name == 'run_summary.json':
                    scenario.status = OptimizationScenario.PROCESSING
                    self.stdout.write(f"Marked OptimizationScenario {scenario.id} as PROCESSING due to run_summary.json update")
                if s3_key_path.name == INPUT_FILENAME:
                    scenario.status = OptimizationScenario.PROCESSING
                    self.stdout.write(f"Marked OptimizationScenario {scenario.id} as PROCESSING due to input file update")
            local_filepath = settings.MEDIA_ROOT / run_directory / s3_key_path.name
            s3.download_file(settings.AWS_STORAGE_BUCKET_NAME, s3_key, str(local_filepath))
            self.stdout.write(f"Downloaded {s3_key} to {local_filepath}")
            if s3_key_path.name == 'run_summary.json':
                try:
                    run_summary_dict = json.loads(local_filepath.read_text())
                except json.JSONDecodeError as e:
                    self.stderr.write(f"Error reading run_summary.json for OptimizationScenario {scenario.id}: {e}")
                    self.stderr.write(f"text:\n{local_filepath.read_text()}")
                    return True
                scenario.replace_run_summary(run_summary_dict)
                self.stdout.write(f"Replaced run_summary for OptimizationScenario {scenario.id}")
            if s3_key_path.name.startswith('step'):
                job_id = body.get('job_id')
                optimization_run = None
                if job_id:
                    optimization_run = OptimizationRun.objects.filter(job_id=job_id).first()
                    if not optimization_run:
                        self.stderr.write(f"No OptimizationRun found for job_id={job_id}; leaving OutputFile.optimization_run unset")
                output_file = OutputFile.objects.create(
                    scenario=scenario,
                    optimization_run=optimization_run,
                    file=str(run_directory / s3_key_path.name)
                )
                self.stdout.write(
                    f"Created OutputFile {output_file.id} for OptimizationScenario {scenario.id}"
                )
            scenario.save()
            return True
        except Exception as e:
            self.stderr.write(f"Unexpected error processing message for OptimizationScenario {scenario.id}, leaving it in the queue to retry: {e}")
            return False

    def run(self, *args, **kwargs):
        response = sqs.receive_message(
            QueueUrl=OPTIMIZER_RESPONSE_QUEUE_URL,
            MaxNumberOfMessages=1,  # Adjust as needed
            WaitTimeSeconds=10  # Long polling
        )
        messages = response.get('Messages', [])
        delete_messages = [m for m in messages if self.process_message(m)]
        for msg in delete_messages:
            try:
                sqs.delete_message(
                    QueueUrl=OPTIMIZER_RESPONSE_QUEUE_URL,
                    ReceiptHandle=msg['ReceiptHandle']
                )
                self.stdout.write("Message deleted from the queue.")
            except ClientError as e:
                self.stderr.write(f"Error deleting message: {e}")

    def purge_queue(self):
        try:
            sqs.purge_queue(QueueUrl=OPTIMIZER_RESPONSE_QUEUE_URL)
            self.stdout.write("Queue purged successfully.")
        except ClientError as e:
            self.stderr.write(f"Error purging queue: {e}")


    def handle(self, *args, **options):
        if options['purge']:
            self.stdout.write("Purging the queue...")
            self.purge_queue()
        try:
            self.stdout.write("Starting message processing loop...")
            while True:
                self.run(*args, **options)
        except KeyboardInterrupt:
            self.stdout.write("Shutdown requested.")
            self.stdout.write("Exiting message processing loop.")
