from django import forms

from .models import OptimizationScenario
from .permissions import is_scenario_locked


class OptimizationScenarioNameForm(forms.ModelForm):
    class Meta:
        model = OptimizationScenario
        fields = [
            'name',
            'period_start',
            'period_end',
        ]
        widgets = {
            'period_start': forms.DateTimeInput(
                attrs={'type': 'date'}, format='%Y-%m-%d'
            ),
            'period_end': forms.DateTimeInput(
                attrs={'type': 'date'}, format='%Y-%m-%d'
            ),
        }

    def __init__(self, *args, user=None, **kwargs):
        self.user = user
        super().__init__(*args, **kwargs)

    def clean(self):
        cleaned_data = super().clean()

        instance = self.instance
        if instance and instance.pk and is_scenario_locked(self.user, instance):
            raise forms.ValidationError("This opt run is locked and cannot be modified.")
        return cleaned_data
