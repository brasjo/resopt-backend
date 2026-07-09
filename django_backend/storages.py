import gzip
import io
import os

from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from storages.backends.s3boto3 import S3Boto3Storage


class CompressedS3Boto3Storage(S3Boto3Storage):
    def _save(self, name, content):
        if not name.endswith('.gz'):
            compressed_buffer = io.BytesIO()
            with gzip.GzipFile(fileobj=compressed_buffer, mode='wb') as gz_file:
                gz_file.write(content.read())
            content = ContentFile(compressed_buffer.getvalue())
            name += '.gz'
        return super()._save(name, content)

class OverwriteFileSystemStorage(FileSystemStorage):
    def get_available_name(self, name, max_length=None):
        if self.exists(name):
            os.remove(os.path.join(self.location, name))
        return name
