from pathlib import Path
from django.urls import path
from users.api.v1.views import (
    LoginAPIView,
    LogoutAPIView,
    UserListAPIView,
)


SCRIPT_DIR = Path(__file__).resolve().parent
app_name = f'api-{SCRIPT_DIR.name}'

urlpatterns = [
    path('', UserListAPIView.as_view(), name='list'),
    path('login/', LoginAPIView.as_view(), name='login'),
    path('logout/', LogoutAPIView.as_view(), name='logout'),
]
