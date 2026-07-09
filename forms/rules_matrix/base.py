import re

from django import forms
from django.forms import formset_factory, BaseFormSet
import math

from schemas.rules.v1 import Operator, RelationalOperator
from parser import parse_value_by_prio
from utils import data_type_str, CustomFieldClass


EMPTY_CHOICE = "---------"
OPERATOR_CHOICES = tuple(
    (op.value, op.name.replace("_", " ").title()) for op in Operator
)
RELATIONAL_OPERATOR_CHOICES = tuple(
    (op.value, op.name.replace("_", " ").title()) for op in RelationalOperator
)


def is_valid_regex(pattern: str) -> bool:
    print('Validating regex pattern:', pattern)
    try:
        re.compile(pattern)
        return True
    except re.error:
        return False


class BaseConditionForm(forms.Form):
    def is_empty(self):
        return not any(self.cleaned_data.values())


class ActivityConditionForm(BaseConditionForm):
    activity_property = forms.CharField(required=True)
    activity_operator = forms.ChoiceField(choices=OPERATOR_CHOICES, required=True)
    activity_reference_value = forms.CharField(required=False, strip=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        initial = kwargs.get('initial', {})
        if "activity_property_type" not in initial:
            # If no type info provided or value is empty, default to str type with empty type string
            self.activity_property_type = type(None)
            self.activity_property_type_str = ""
        else:
            self.activity_property_type = initial.get('activity_property_type')
            self.activity_property_type_str = data_type_str(self.activity_property_type)
        self.activity_reference_value = initial.get('activity_reference_value')
        if "activity_reference_value_type" not in initial:
            self.activity_reference_value_type = type(None)
            self.activity_reference_value_type_str = ""
        else:
            self.activity_reference_value_type = initial.get('activity_reference_value_type')
            self.activity_reference_value_type_str = data_type_str(
                self.activity_reference_value_type,
            )

    def clean(self):
        cleaned = super().clean()
        if cleaned.get('DELETE'):
            return cleaned  # Skip validation for deleted forms
        op = cleaned.get("activity_operator")
        val = cleaned.get("activity_reference_value")

        if op != "none":
            if val is None or val == "":
                self.add_error("activity_reference_value", "Reference value is required when operator is not 'none'.")

        if op == "regex" and val and not is_valid_regex(val):
            self.add_error("activity_reference_value", "Invalid regex pattern.")

        return cleaned


class ResourceConditionForm(BaseConditionForm):
    resource_property = forms.CharField(required=True)
    resource_operator = forms.ChoiceField(choices=OPERATOR_CHOICES, required=True)
    resource_reference_value = forms.CharField(required=False, strip=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        initial = kwargs.get('initial', {})
        if "resource_property_type" not in initial:
            self.resource_property_type = type(None)
            self.resource_property_type_str = ""
        else:
            self.resource_property_type = initial.get('resource_property_type')
            self.resource_property_type_str = data_type_str(self.resource_property_type)

        if "resource_reference_value_type" not in initial:
            self.resource_reference_value_type = type(None)
            self.resource_reference_value_type_str = ""
        else:
            self.resource_reference_value_type = initial.get('resource_reference_value_type')
            self.resource_reference_value_type_str = data_type_str(
                self.resource_reference_value_type,
            )

    def clean(self):
        cleaned = super().clean()
        if cleaned.get('DELETE'):
            return cleaned  # Skip validation for deleted forms
        op = cleaned.get("resource_operator")
        val = cleaned.get("resource_reference_value")

        if op != "none":
            if val is None or val == "":
                self.add_error("resource_reference_value", "Reference value is required when operator is not 'none'.")

        if op == "regex" and val and not is_valid_regex(val):
            self.add_error("resource_reference_value", "Invalid regex pattern.")

        return cleaned


class RelationalConditionForm(BaseConditionForm):
    activity_property = forms.CharField(required=True)
    activity_operator = forms.ChoiceField(choices=OPERATOR_CHOICES, required=False)
    activity_reference_value = forms.CharField(required=False, strip=False)

    activity_resource_relation = forms.ChoiceField(
        choices=RELATIONAL_OPERATOR_CHOICES,
        required=True,
    )

    resource_property = forms.CharField(required=True)
    resource_operator = forms.ChoiceField(choices=OPERATOR_CHOICES, required=False)
    resource_reference_value = forms.CharField(required=False, strip=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        initial = kwargs.get('initial', {})
        if "activity_property_type" not in initial:
            # If no type info provided or value is empty, default to str type with empty type string
            self.activity_property_type = type(None)
            self.activity_property_type_str = ""
        else:
            self.activity_property_type = initial.get('activity_property_type')
            self.activity_property_type_str = data_type_str(self.activity_property_type)
        self.activity_reference_value = initial.get('activity_reference_value')
        if "activity_reference_value_type" not in initial:
            self.activity_reference_value_type = type(None)
            self.activity_reference_value_type_str = ""
        else:
            self.activity_reference_value_type = initial.get('activity_reference_value_type')
            self.activity_reference_value_type_str = data_type_str(
                self.activity_reference_value_type,
            )

        if "resource_property_type" not in initial:
            self.resource_property_type = type(None)
            self.resource_property_type_str = ""
        else:
            self.resource_property_type = initial.get('resource_property_type')
            self.resource_property_type_str = data_type_str(self.resource_property_type)

        if "resource_reference_value_type" not in initial:
            self.resource_reference_value_type = type(None)
            self.resource_reference_value_type_str = ""
        else:
            self.resource_reference_value_type = initial.get('resource_reference_value_type')
            self.resource_reference_value_type_str = data_type_str(
                self.resource_reference_value_type,
            )

    def _validate_side(self, prefix):
        op = self.cleaned_data.get(f"{prefix}_operator")
        val = self.cleaned_data.get(f"{prefix}_reference_value")

        if val and not op:
            self.add_error(f"{prefix}_operator", "Operator is required when a value is set.")

        if op == "regex" and val and not is_valid_regex(val):
            self.add_error(f"{prefix}_reference_value", "Invalid regex pattern.")

        relation = self.cleaned_data.get("activity_resource_relation")
        if relation == "match":
            if not self.cleaned_data.get(f"{prefix}_operator"):
                self.add_error(
                    f"{prefix}_operator",
                    "Operator is required when relation is 'match'."
                )
        if relation == "non_match":
            if not self.cleaned_data.get(f"{prefix}_operator"):
                self.add_error(
                    f"{prefix}_operator",
                    "Operator is required when relation is 'non_match'."
                )

    def clean(self):
        cleaned = super().clean()
        if cleaned.get('DELETE'):
            return cleaned  # Skip validation for deleted forms

        self._validate_side("activity")
        self._validate_side("resource")
        self.activity_reference_value_type = type(parse_value_by_prio(
            cleaned.get("activity_reference_value", "")
        ))
        self.resource_reference_value_type = type(parse_value_by_prio(
            cleaned.get("resource_reference_value", "")
        ))
        self.activity_reference_value_type_str = data_type_str(
            self.activity_reference_value_type,
        )
        self.resource_reference_value_type_str = data_type_str(
            self.resource_reference_value_type,
        ) if not self.resource_reference_value_type == type(None) else "None"
        self.activity_property_type_str = data_type_str(self.activity_property_type) if not self.activity_property_type == type(None) else ""
        self.resource_property_type_str = data_type_str(self.resource_property_type) if not self.resource_property_type == type(None) else ""

        return cleaned


class RuleForm(forms.Form):
    id = forms.CharField(required=True)
    description = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 1}),
    )
    penalty = forms.CharField(required=True)
    valid_from = forms.DateTimeField(required=True)
    valid_to = forms.DateTimeField(required=False)

    def clean_penalty(self):
        value = self.cleaned_data["penalty"]

        if isinstance(value, str):
            v = value.strip().upper()
            if v in {"INF", "INFINITY"}:
                return math.inf
            if v in {"-INF", "-INFINITY"}:
                return -math.inf

        try:
            return float(value)
        except ValueError:
            raise forms.ValidationError("Penalty must be a number or ±Infinity")

    def clean(self):
        cleaned = super().clean()
        vf = cleaned.get("valid_from")
        vt = cleaned.get("valid_to")

        if vf and vt and vt < vf:
            self.add_error("valid_to", "valid_to must be after valid_from")

        return cleaned


class BaseRuleFormSet(BaseFormSet):
    def clean(self):
        super().clean()

        seen_ids = set()
        form_errors = []

        for form in self.forms:
            # Skip empty or already invalid forms
            if not form.cleaned_data or form.errors:
                continue

            rule_id = form.cleaned_data.get("id")

            assert rule_id is not None, "Rule ID should not be None here."

            # Duplicate ID check
            if rule_id in seen_ids:
                form.add_error("id", "Duplicate rule ID.")
                form_errors.append(f"Duplicate rule ID: {rule_id}")
                continue
            seen_ids.add(rule_id)

        # If any form-level errors collected, raise a general formset-level error
        if form_errors:
            raise forms.ValidationError(
                "Some rules have errors: " + "; ".join(form_errors)
            )


RuleFormSet = formset_factory(
    RuleForm,
    formset=BaseRuleFormSet,
    extra=0,
    can_delete=True,
)


ActivityConditionFormSet = formset_factory(
    ActivityConditionForm,
    extra=0,
    can_delete=True,
)

ResourceConditionFormSet = formset_factory(
    ResourceConditionForm,
    extra=0,
    can_delete=True,
)

RelationalConditionFormSet = formset_factory(
    RelationalConditionForm,
    extra=0,
    can_delete=True,
)

