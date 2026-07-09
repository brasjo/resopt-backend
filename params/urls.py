from django.urls import path

from .views import (
    ParameterSetListView,
    ParameterSetDetailView,
    CreateParameterSetView,
    DeleteParameterSetView,
)

app_name = 'params'


urlpatterns = [
    path('', ParameterSetListView.as_view(), name='list'),
    path('<int:pk>/', ParameterSetDetailView.as_view(), name='detail'),
    path('create/', CreateParameterSetView.as_view(), name='create'),
    path('<int:pk>/remove/', DeleteParameterSetView.as_view(), name='remove'),
]
