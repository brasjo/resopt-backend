"""
URL configuration for django_backend project.
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from django_backend.views import ApiHomeView
from django_backend.views import home
from django.http import HttpResponse

from .views import (
    protected_file,
    outputs_view,
    output_view,
    protected_media,
)


urlpatterns = [
    # First arg must be unique for each path
    path('', home, name='home'),
    path('ping', lambda x: HttpResponse('pong'), name='ping'),
    path('outputs/', outputs_view, name='outputs-view'),
    path('outputs/<path:path>', output_view, name='output-view'),
    path('scenarios/<path:path>', output_view, name='output-view'),
    path("favicon.ico", RedirectView.as_view(url=settings.STATIC_URL + "favicon.webp", permanent=True)),
    path('admin/', admin.site.urls),
    path('api/', ApiHomeView.as_view(), name='home-api'),
    path('api/v1/opt/', include('opt.api.v1.urls', namespace='opt-api-v1')),
    path('api/v1/users/', include('users.api.v1.urls', namespace='users-api-v1')),
    path('api/v1/params/', include('params.api.v1.urls', namespace='params-api-v1')),
    path("users/", include("users.urls", namespace="users-web")),
    path("dashboard/", include("dashboard.urls", namespace="dashboard")),
    path("viz/", include("viz.urls", namespace="viz")),
    path("opt/", include("opt.urls", namespace="opt")),
    path("params/", include("params.urls", namespace="params")),
    path('files/<str:filename>/', protected_file, name='protected-file'),
    path('media/<path:path>', protected_media, name='protected-media')
]

# Serving media files in development
if settings.DEBUG:
    # urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)