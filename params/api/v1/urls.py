from pathlib import Path
from django.urls import path

from params.api.v1.views import (
    ParameterSetViewSet,
)


SCRIPT_DIR = Path(__file__).resolve().parent
app_name = f'api-{SCRIPT_DIR.name}'

urlpatterns = [
    path('', ParameterSetViewSet.as_view(
        {'get': 'list', 'post': 'create'}),
        name='list',
    ),
    path('<int:pk>/', ParameterSetViewSet.as_view(
        {'get': 'retrieve', 'put': 'update', 'delete': 'destroy'}),
        name='detail',
    ),
]