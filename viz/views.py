from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@login_required
def home(request):
    """
    Home view for the visualization app.
    """
    return render(request, 'viz/visualization.html')


@login_required
def gantt(request):
    """
    Gantt schedule/playback viewer, served in parallel to the visualizer above.
    """
    return render(request, 'viz/gantt_view.html')
