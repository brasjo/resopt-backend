from django import forms

from .models import OptimizationScenario


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

    def clean(self):
        cleaned_data = super().clean()

        instance = self.instance
        if instance and instance.pk and instance.is_locked:
            raise forms.ValidationError("This opt run is locked and cannot be modified.")
        return cleaned_data
