from django.http import HttpResponse
from django.conf import settings


class MaxUploadSizeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.max_upload_size = settings.DATA_UPLOAD_MAX_MEMORY_SIZE

    def __call__(self, request):
        if request.method == 'POST' and request.META.get('CONTENT_LENGTH'):
            try:
                content_length = int(request.META['CONTENT_LENGTH'])
                if content_length > self.max_upload_size:
                    return HttpResponse(
                        f"File too large. Limit is {self.max_upload_size // (1024 * 1024)} MB.",
                        status=413
                    )
            except (ValueError, TypeError):
                pass
        return self.get_response(request)
