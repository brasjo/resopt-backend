import mimetypes
import os
from pathlib import Path

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.http import JsonResponse as JSONResponse
from django.http import Http404, FileResponse

from django.shortcuts import render
from django.urls import reverse
from rest_framework.response import Response
from rest_framework.views import APIView

from utils import list_leaf_directories, is_within_base
from opt.models import OptimizationScenario


def home(request):
    return render(request, "django_backend/homepage.html")


@login_required
def output_view(request, path):
    # Serve a specific output file
    if not request.user.is_superuser:
        raise Http404("You do not have permission to access this file.")
    if 'scenarios' in request.path:
        output_file = (settings.SCENARIOS_DIR / path).resolve()
        if not is_within_base(output_file, settings.SCENARIOS_DIR):
            return HttpResponse('Forbidden', status=403)
    elif 'outputs' in request.path:
        output_file = (settings.OUTPUT_DIR / path).resolve()
        if not is_within_base(output_file, settings.OUTPUT_DIR):
            return HttpResponse('Forbidden', status=403)
    else:
        run_directory = Path(path).parent
        opt_run = OptimizationScenario.objects.filter(run_directory=run_directory).first()
        if not opt_run:
            return HttpResponse('OptimizationScenario not found for this output', status=404)
        output_file = (settings.MEDIA_ROOT / path).resolve()
        if not output_file.exists() or not output_file.is_file():
            return HttpResponse('File not found', status=404)
    with open(output_file, 'rb') as f:
        return HttpResponse(f.read(), content_type='application/octet-stream')


@login_required
def outputs_view(request):
    # find all final dirs in BASE_DIR/tmp/outputs
    outputs = (Path(l).resolve() for l in list_leaf_directories(settings.OUTPUT_DIR))
    outputs = (d for d in outputs if d.is_dir())
    outputs = (d.as_posix().split('/output/')[1] for d in outputs)
    outputs = ['/outputs/' + d for d in outputs]
    scenarios = (Path(l).resolve() for l in list_leaf_directories(settings.SCENARIOS_DIR))
    scenarios = (d for d in scenarios if d.is_dir())
    scenarios = (d.as_posix().split('/scenarios/')[1] for d in scenarios)
    scenarios = ['/scenarios/' + d for d in scenarios]
    outputs.extend(scenarios)
    print(f"Outputs directory: {outputs}")
    return JSONResponse({
        'outputs': outputs,
    })


@login_required
def protected_media(request, path):
    # check org
    user_org = request.user.profile.organization
    if not user_org:
        raise Http404("You require an organization. Please contact admin.")
    org = path.split('/')[0]
    if user_org.name != org  and not request.user.is_superuser:
        raise Http404("Not allowed")

    file_path = os.path.join(settings.MEDIA_ROOT, path)
    print('file_path', file_path)

    if not os.path.exists(file_path):
        raise Http404("File not found")

    content_type, _ = mimetypes.guess_type(file_path)
    return FileResponse(open(file_path, "rb"), content_type=content_type)


@login_required
def protected_file(request, filename):
    """
    Serve a protected file from the private files directory.
    """
    print(f"Requesting protected file: {filename}")
    print(f'filename: {filename}')
    file_path = settings.PROTECTED_FILES_ROOT / filename
    if not file_path.exists() or not file_path.is_file():
        return HttpResponse('File not found', status=404)

    if filename.endswith('.js'):
        with open(file_path, 'r') as f:
            response = HttpResponse(f.read(), content_type='application/javascript')
            response['Content-Type'] = 'application/javascript'
    elif filename.endswith('.css'):
        with open(file_path, 'r') as f:
            response = HttpResponse(f.read(), content_type='text/css')
    elif filename.endswith('.png'):
        with open(file_path, 'rb') as f:
            response = HttpResponse(f.read(), content_type='image/png')
    else:
        with open(file_path, 'rb') as f:
            response = HttpResponse(f.read(), content_type='application/octet-stream')
    return response


class ApiHomeView(APIView):
    def get(self, request):
        return Response({
            "message": "Welcome to the API!",
            "available_scopes": {
                "users": request.build_absolute_uri(reverse('users-web:home')),
                # "outputs": request.build_absolute_uri(reverse('api_data:outputs')),
                # you can add other scopes here as you expand (like 'blog', 'shop', etc)
            }
        })

