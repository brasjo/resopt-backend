import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from botocore.exceptions import ClientError

from opt.models import OptimizationScenario, OutputFile

from aws import sqs, s3
from logify.log import log_info
from resopt_utils.utils import get_logger


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
            run_id = body['opt_scenario_id']
            opt_run = OptimizationScenario.objects.get(id=run_id)
        except (json.JSONDecodeError, KeyError) as e:
            self.stderr.write(f"Malformed message, dropping it: {message}: {e}")
            return True
        except OptimizationScenario.DoesNotExist:
            self.stderr.write(f"No OptimizationScenario found for run_id: {run_id}; dropping message")
            return True

        try:
            s3_key = body.get('s3_key')
            if not s3_key:
                status = body['status']
                if opt_run.status == OptimizationScenario.ERROR:
                    self.stdout.write(
                        f"OptimizationScenario {opt_run.id} already in error state; "
                        f"ignoring late status update to {status}"
                    )
                    return True
                opt_run.status = status
                self.stdout.write(f"Updated OptimizationScenario {opt_run.id} status to {status}")
                opt_run.save()
                return True

            s3_key_path = Path(s3_key)
            folder = s3_key_path.parent
            run_directory = folder.relative_to(AWS_LOCATION)
            self.stdout.write(f"Derived run directory: {run_directory}")
            if opt_run.status == OptimizationScenario.ERROR:
                self.stdout.write(
                    f"OptimizationScenario {opt_run.id} already in error state; "
                    f"not moving it back to processing for {s3_key_path.name}"
                )
            else:
                if s3_key_path.name == 'run_summary.json':
                    opt_run.status = OptimizationScenario.PROCESSING
                    self.stdout.write(f"Marked OptimizationScenario {opt_run.id} as PROCESSING due to run_summary.json update")
                if s3_key_path.name == INPUT_FILENAME:
                    opt_run.status = OptimizationScenario.PROCESSING
                    self.stdout.write(f"Marked OptimizationScenario {opt_run.id} as PROCESSING due to input file update")
            local_filepath = settings.MEDIA_ROOT / run_directory / s3_key_path.name
            s3.download_file(settings.AWS_STORAGE_BUCKET_NAME, s3_key, str(local_filepath))
            self.stdout.write(f"Downloaded {s3_key} to {local_filepath}")
            if s3_key_path.name == 'run_summary.json':
                try:
                    run_summary_dict = json.loads(local_filepath.read_text())
                except json.JSONDecodeError as e:
                    self.stderr.write(f"Error reading run_summary.json for OptimizationScenario {opt_run.id}: {e}")
                    self.stderr.write(f"text:\n{local_filepath.read_text()}")
                    return True
                opt_run.replace_run_summary(run_summary_dict)
                self.stdout.write(f"Replaced run_summary for OptimizationScenario {opt_run.id}")
            if s3_key_path.name.startswith('step'):
                output_file = OutputFile.objects.create(
                    run=opt_run,
                    file=str(run_directory / s3_key_path.name)
                )
                self.stdout.write(
                    f"Created OutputFile {output_file.id} for OptimizationScenario {opt_run.id}"
                )
            opt_run.save()
            return True
        except Exception as e:
            self.stderr.write(f"Unexpected error processing message for OptimizationScenario {opt_run.id}, leaving it in the queue to retry: {e}")
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
