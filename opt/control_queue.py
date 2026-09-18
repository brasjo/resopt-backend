import json
from datetime import datetime, timezone as dt_timezone

from django.conf import settings

from aws import sqs

OPTIMIZER_CONTROL_QUEUE_URL = settings.OPTIMIZER_CONTROL_QUEUE_URL


def send_stop_command(job_id: str, response_queue: str):
    """Ask opt-server to kill an in-flight job. Multiple opt-server
    instances/workers all poll this same queue and filter by job_id, so no
    per-worker/per-queue routing is needed here - see
    resopt-optserver/opt_server.py.

    `issued_at` is an app-level TTL marker: opt-server drops (without
    acting on) any control message older than its own
    CONTROL_MESSAGE_TTL_SECONDS, since a stop command that's gone stale
    (job already finished, or never matched because a message got missed)
    shouldn't keep getting redelivered to every listener for the queue's
    full retention period.
    """
    sqs.send_message(
        QueueUrl=OPTIMIZER_CONTROL_QUEUE_URL,
        MessageBody=json.dumps({
            "command": "stop",
            "job_id": job_id,
            "response_queue": response_queue,
            # Explicit UTC-aware timestamp, not Django's timezone.now()
            # (naive under this app's USE_TZ=False) - opt_server.py is a
            # separate service that parses this with datetime.fromisoformat
            # and compares it against its own aware datetime.now(timezone.utc);
            # a naive value there raises "can't subtract offset-naive and
            # offset-aware datetimes" and crashes the whole worker thread.
            "issued_at": datetime.now(dt_timezone.utc).isoformat(),
        }),
    )
