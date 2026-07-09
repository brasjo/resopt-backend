import json
from django.http import JsonResponse
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView, Response
from django.urls import reverse
from django.core.exceptions import ObjectDoesNotExist

from opt.models import OptimizationScenario, OutputFile
from opt.api.v1.serializers import (
    OptimizationScenarioSerializer,
    OutputFileSerializer,
)
from opt.permissions import IsOwnerOrReadOnly  # You need to have this defined


class DataHomeView(APIView):
    def get(self, request):
        return Response({
            "message": "Welcome to the Auth API!",
            "available_endpoints": {
                "input-files": request.build_absolute_uri(reverse("data:input-files")),
                "output-files": request.build_absolute_uri(reverse("data:output-files")),
            }
        })


class OptimizationScenarioViewSet(viewsets.ModelViewSet):
    serializer_class = OptimizationScenarioSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrReadOnly]

    def get_queryset(self):
        return OptimizationScenario.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class OutputFileViewSet(viewsets.ModelViewSet):
    serializer_class = OutputFileSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrReadOnly]

    def get_queryset(self):
        return OutputFile.objects.filter(run__user=self.request.user)


class InputBuilderFileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrReadOnly]  # Add permissions here

    def get(self, request, run_id, *args, **kwargs):
        try:
            # Fetch the OptimizationScenario instance for the given `run_id`
            scenario = OptimizationScenario.objects.get(id=run_id)

            # Check if the request user is the owner of the scenario
            self.check_object_permissions(request, scenario)

            content = json.loads(scenario.input_builder.read())

            return JsonResponse(content, json_dumps_params={'indent': 4})
        except ObjectDoesNotExist:
            return JsonResponse({"error": "Optimization scenario not found."}, status=status.HTTP_404_NOT_FOUND)
