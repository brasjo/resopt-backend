from django.urls import path

from .views import home


app_name = 'dashboard'

urlpatterns = [
    # First arg must be unique for each path
    path('', home, name='home'),
]