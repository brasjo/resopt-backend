from django.conf import settings
from django.http import JsonResponse
import boto3
from botocore.config import Config
from functools import cache


config = Config(s3={"addressing_style": "virtual"})


@cache
def get_s3_client():
    """
    Create and return an S3 client with the specified configuration.
    """
    return boto3.client(
        's3',
        region_name=settings.AWS_S3_REGION_NAME,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        endpoint_url=settings.AWS_S3_ENDPOINT_URL,  # optional
        config=config,  # Use the custom config for virtual addressing
    )

def generate_presigned_url(key: str, expiration: int = 3600) -> str:
    """
    Generate a presigned URL for a file in S3.

    :param key: Full path to the file in the bucket (e.g., 'INPUT/myfile.pdf')
    :param expiration: Time in seconds for the presigned URL to remain valid
    :return: Presigned URL as a string
    """
    s3_client = get_s3_client()
    try:
        url = s3_client.generate_presigned_url(
            ClientMethod='get_object',
            Params={
                'Bucket': settings.AWS_STORAGE_BUCKET_NAME,
                'Key': key,
            },
            ExpiresIn=expiration,
        )
        return url
    except Exception as e:
        print(f"Error generating presigned URL: {e}")
        return None


def get_file_url(request, run_id, filename):
    key = f"OUTPUTS/{filename}"  # or wherever your files are
    url = generate_presigned_url(key)
    if url:
        return JsonResponse({'url': url})
    else:
        return JsonResponse({'error': 'Could not generate URL'}, status=500)
