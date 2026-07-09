from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@login_required
def home(request):
    """
    Home view for the visualization app.
    """
    return render(request, 'viz/visualization.html')
