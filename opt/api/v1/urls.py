from pathlib import Path

from rest_framework.routers import DefaultRouter
from opt.api.v1.views import (
    OutputFileViewSet,
    OptimizationScenarioViewSet,
)


SCRIPT_DIR = Path(__file__).resolve().parent
app_name = f'api-{SCRIPT_DIR.name}'


router = DefaultRouter()
router.register(r'output-files', OutputFileViewSet, basename='output-files')
router.register(r'runs', OptimizationScenarioViewSet, basename='runs')

urlpatterns = router.urls