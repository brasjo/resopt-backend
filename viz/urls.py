from django.urls import path

from .views import home, gantt
from opt.views_v1 import upload_file_view


app_name = 'viz'


urlpatterns = [
    path('', home, name='home'),
    path('gantt/', gantt, name='gantt'),
    path('upload-file/', upload_file_view, name='upload-file'),
]
