from .serializers import ParameterSetSerializer
from rest_framework import viewsets, permissions

from params.models import ParameterSet


class ParameterSetViewSet(viewsets.ModelViewSet):
    serializer_class = ParameterSetSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return ParameterSet.objects.all()
        return ParameterSet.objects.filter(
            organization=user.profile.organization
        )

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_superuser:
            # allow superuser to explicitly assign organization
            serializer.save()
        else:
            # force organization from the user's profile
            serializer.save(organization=user.profile.organization)
