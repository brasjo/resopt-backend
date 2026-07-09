from django.conf import settings


def upload_limits(request):
    return {
        'MAX_UPLOAD_SIZE': settings.DATA_UPLOAD_MAX_MEMORY_SIZE
    }