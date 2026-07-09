import boto3
from django.conf import settings
from botocore.exceptions import ClientError

AWS_ACCESS_KEY_ID = settings.AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY = settings.AWS_SECRET_ACCESS_KEY
OPTIMIZER_REQUEST_QUEUE_URL = settings.OPTIMIZER_REQUEST_QUEUE_URL


# Initialize a session using Amazon SQS
sqs = boto3.client(
    'sqs',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name='eu-north-1'
)

s3 = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name='eu-north-1'
)

# The URL of the SQS queue
queue_url = 'https://sqs.eu-north-1.amazonaws.com/250533204381/ResOptQueue'

# The message you want to send
message_body = 'Hello, this is a test message from boto3!'


def send_message(msg: str):
    try:
        # Send the message to the queue
        response = sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=msg
        )

        # Print out the response message ID to confirm the message was sent
        print(f"Message ID: {response['MessageId']}")

    except ClientError as e:
        # Catch any client error (e.g., access denied or invalid queue URL)
        print(f"Error sending message: {e}")


def receive_messages():
    try:
        # Receive messages from the queue
        response = sqs.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=10,  # Adjust as needed
            WaitTimeSeconds=10  # Long polling
        )
        messages = response.get('Messages', [])
        for message in messages:
            print(f"Received message: {message['Body']}")

            # After processing the message, delete it from the queue
            sqs.delete_message(
                QueueUrl=queue_url,
                ReceiptHandle=message['ReceiptHandle']
            )
            print("Message deleted from the queue.")

    except ClientError as e:
        print(f"Error receiving messages: {e}")


def send_msg_to_optimizer_queue(msg: str) -> str:
    return sqs.send_message(
        QueueUrl=OPTIMIZER_REQUEST_QUEUE_URL,
        MessageBody=msg
    )


if __name__ == "__main__":
    # Example usage
    # send_message('Test message from boto3')
    receive_messages()