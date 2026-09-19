import json
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView, Response
from django.urls import reverse
from django.core.exceptions import ObjectDoesNotExist

from opt.control_queue import send_stop_command
from opt.models import OptimizationRun, OptimizationScenario, OutputFile
from opt.api.v1.serializers import (
    OptimizationScenarioSerializer,
    OutputFileSerializer,
)
from opt.permissions import IsOwnerOrReadOnly, has_admin_override  # You need to have this defined
from logify.log import log_info
from schemas.run_events import RunEvent


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
        return OutputFile.objects.filter(scenario__user=self.request.user)


class StopOptimizationRunView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, scenario_id, *args, **kwargs):
        scenario = get_object_or_404(OptimizationScenario, pk=scenario_id)
        user = request.user
        can_stop = has_admin_override(user) or scenario.user_id == user.id
        if not can_stop:
            return Response(
                {"detail": "You do not have permission to stop this run."},
                status=status.HTTP_403_FORBIDDEN,
            )
        run = (
            OptimizationRun.objects
            .filter(scenario=scenario, status=OptimizationRun.RUNNING)
            .order_by('-queued_at')
            .first()
        )
        if run is None:
            return Response(
                {"detail": "No in-flight optimization run found for this scenario."},
                status=status.HTTP_404_NOT_FOUND,
            )
        send_stop_command(job_id=run.job_id, response_queue=run.response_queue)
        log_info(run, f"Stop requested for optimization run {run.job_id} (event: {RunEvent.STOP_SENT.value}).", source=run.job_id)
        return Response({"detail": "Stop requested.", "job_id": run.job_id})


class InputBuilderFileView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrReadOnly]  # Add permissions here

    def get(self, request, scenario_id, *args, **kwargs):
        try:
            # Fetch the OptimizationScenario instance for the given `scenario_id`
            scenario = OptimizationScenario.objects.get(id=scenario_id)

            # Check if the request user is the owner of the scenario
            self.check_object_permissions(request, scenario)

            content = json.loads(scenario.input_builder.read())

            return JsonResponse(content, json_dumps_params={'indent': 4})
        except ObjectDoesNotExist:
            return JsonResponse({"error": "Optimization scenario not found."}, status=status.HTTP_404_NOT_FOUND)
