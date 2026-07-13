from django import forms
from django.forms import BaseFormSet, formset_factory
from django.core.exceptions import ValidationError

from opt.models import OptimizationScenario
from resopt_utils.utils import (
    timedelta_to_hhmm,
)
from resopt_utils.parser import parse_timedelta


class MinuteDeltaField(forms.CharField):
    def prepare_value(self, value):
        if isinstance(value, str):
            return value
        if value is None:
            return ""
        return timedelta_to_hhmm(value)

    def clean(self, value):
        try:
            return parse_timedelta(value)
        except ValueError as e:
            raise ValidationError(f"Invalid time delta format: {e}.")


class PositiveMinuteDeltaField(MinuteDeltaField):
    pass


class KeyValueForm(forms.Form):
    key = forms.CharField(max_length=100, label="Key")
    value = forms.CharField(max_length=255, label="Value")


class BaseKeyValueFormSet(BaseFormSet):
    def clean(self):
        super().clean()

        seen_keys = set()

        for form in self.forms:
            # Skip deleted forms
            if self.can_delete and self._should_delete_form(form):
                continue

            # Skip invalid/incomplete forms
            if not hasattr(form, "cleaned_data"):
                continue

            key = form.cleaned_data.get("key")

            if not key:
                continue

            # Optional normalization
            normalized_key = key.strip().lower()

            if normalized_key in seen_keys:
                form.add_error("key", "Duplicate key.")

            seen_keys.add(normalized_key)


KeyValueFormSet = formset_factory(
    KeyValueForm,
    formset=BaseKeyValueFormSet,
    extra=1,
    can_delete=True,
)