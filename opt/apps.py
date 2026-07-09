# apps.py
from django.apps import AppConfig
import opt


class DataConfig(AppConfig):
    defaultauto_field = 'django.db.models.BigAutoField'
    name = 'opt'

    def ready(self):
        import opt.signals  # This will connect the signal handlers