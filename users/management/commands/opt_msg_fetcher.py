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
    help = 'Create db and admin and guest users for testing'

    def add_arguments(self, parser):
        # Add the -p or --purge flag
        parser.add_argument(
            '-p', '--purge',
            action='store_true',
            help='Purge the queue before starting'
        )

    def run(self, *args, **kwargs):
        response = sqs.receive_message(
            QueueUrl=OPTIMIZER_RESPONSE_QUEUE_URL,
            MaxNumberOfMessages=1,  # Adjust as needed
            WaitTimeSeconds=10  # Long polling
        )
        messages = response.get('Messages', [])
        delete_messages = []
        for message in messages:
            body = json.loads(message['Body'])
            run_id = body['opt_scenario_id']
            opt_run = OptimizationScenario.objects.get(id=run_id)
            if not opt_run:
                self.stderr.write(f"No OptimizationScenario found for run_id: {run_id}")
                delete_messages.append(message)
                continue
            s3_key = body.get('s3_key')
            if not s3_key:
                status = body['status']
                opt_run.status = status
                delete_messages.append(message)
                self.stdout.write(f"Updated OptimizationScenario {opt_run.id} status to {status}")
                opt_run.save()
                continue
            s3_key_path = Path(s3_key)
            folder = s3_key_path.parent
            run_directory = folder.relative_to(AWS_LOCATION)
            self.stdout.write(f"Derived run directory: {run_directory}")
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
                    delete_messages.append(message)
                    self.stderr.write(f"text:\n{local_filepath.read_text()}")
                    continue
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
            delete_messages.append(message)
        for msg in delete_messages:
            try:
                print('msg', msg)
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
