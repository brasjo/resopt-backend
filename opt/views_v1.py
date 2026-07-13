from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Iterable
import json
import logging
import os

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.views import View
from pydantic import ValidationError

from forms.loader import get_parameters_form_class
from forms.standalone import KeyValueFormSet
from forms.rules_matrix.base import (
    RuleFormSet,
    RelationalConditionFormSet,
    ActivityConditionFormSet,
    ResourceConditionFormSet,
)
from opt.forms import OptimizationScenarioNameForm
from opt.models import OptimizationScenario, OutputFile
from params.models import ParameterSet
from schemas.loader import (
    get_individual_validation_func,
    get_relational_validation_func,
    get_opt_input_builder_class,
    get_parameters_class,
    get_opt_output_file_class,
    LATEST_VERSION,
)
from schemas.base import (
    PositiveTimedeltaEntry,
)
from schemas.optinput.base import InputBuilder
from opt.preprocess import generate_input_file
from logify.log import log_info, log_error, logs_for_instance
from .kpi import (
    diff_kpis_from_output_file,
    kpi_table_from_output_files,
    kpi_table,
    SolutionKPIs,
    KPIs,
    diff_kpis,
)
from .postprocess import generate_output_file
import opt.reports as reports
from aws import s3, send_msg_to_optimizer_queue
from resopt_utils.parser import parse_value_by_prio
from resopt_utils.utils import (
    is_safe_path,
    diff_repr,
    data_type_str,
    get_model_field_type,
    CustomFieldClass,
)


User = get_user_model()
DATA_UPLOAD_MAX_MEMORY_SIZE = settings.DATA_UPLOAD_MAX_MEMORY_SIZE
AWS_STORAGE_BUCKET_NAME = settings.AWS_STORAGE_BUCKET_NAME
OUTPUT_DIR = settings.OUTPUT_DIR
OPTIMIZER_RESPONSE_QUEUE_URL = settings.OPTIMIZER_RESPONSE_QUEUE_URL
OPTIMIZER_REQUEST_QUEUE_URL = settings.OPTIMIZER_REQUEST_QUEUE_URL
SCENARIOS_DIR = settings.SCENARIOS_DIR
AWS_LOCATION = settings.AWS_LOCATION
MEDIA_ROOT = settings.MEDIA_ROOT
INPUT_FILENAME = settings.INPUT_FILENAME
OUTPUT_FILENAME = settings.OUTPUT_FILENAME
INPUT_BUILDER_FILENAME = settings.INPUT_BUILDER_FILENAME
USER_INPUT_FILENAME = settings.USER_INPUT_FILENAME
BASE_DIRS = {
    'output': OUTPUT_DIR.parent,
    'scenarios': SCENARIOS_DIR.parent,
}
AVAILABLE_REPORTS = reports.AVAILABLE_REPORTS
logger = logging.getLogger(__name__)


class OptView(LoginRequiredMixin, View):
    def get(self, request):
        opt_runs = OptimizationScenario.objects.filter(user=request.user).order_by('-created_at')
        return render(request, 'opt/opt_list.html', {'opt_runs': opt_runs})

    def post(self, request):
        opt_run = OptimizationScenario.objects.create(user=request.user)
        print(f"Created new optimization run with ID: {opt_run.id}")
        return redirect('opt:detail', run_id=opt_run.id)


class OptDetailView(LoginRequiredMixin, View):
    template_name = 'opt/opt_detail.html'

    @staticmethod
    def get_context(
        builder: InputBuilder,
        opt_run: OptimizationScenario
    ) -> dict:
        return {
            'opt_run': opt_run,
            'run_id': opt_run.id,
            'num_flights': len(builder.flights),
            'num_aircrafts': len(builder.aircrafts),
            'num_maintenances': len(builder.maintenances),
            'num_solutions': opt_run.output_files.count(),
            'parameter_sets': ParameterSet.objects.filter(
                organization=opt_run.user.profile.organization
            ),
            'relational_condition_formset_prototype': RelationalConditionFormSet(
                prefix="relational_conditions_prototype",
            ),
            'activity_condition_formset_prototype': ActivityConditionFormSet(
                prefix="activity_conditions_prototype",
            ),
            'resource_condition_formset_prototype': ResourceConditionFormSet(
                prefix="resource_conditions_prototype",
            ),
            'rule_formset_prototype': RuleFormSet(
                prefix="rules_prototype",
            ),
        }

    def generate_activity_condition_formsets(self, builder: InputBuilder) -> list:
        activity_cls = builder.flight_cls
        activity_condition_formsets = []
        for rule_ix, rule in enumerate(builder.rules):
            activity_condition_data = []
            for cond in rule.activity_conditions:
                activity_property_type = get_model_field_type(
                    cond.activity_property,
                    activity_cls,
                )
                condition_form_data = {
                    'activity_property': cond.activity_property,
                    'activity_property_type': activity_property_type,
                    'activity_operator': cond.activity_operator,
                    'activity_reference_value': cond.activity_reference_value,
                    'activity_reference_value_type': type(cond.activity_reference_value),
                }
                activity_condition_data.append(condition_form_data)
            activity_condition_formsets.append(
                ActivityConditionFormSet(
                    prefix=f"rules-{rule_ix}-activity-conditions",
                    initial=activity_condition_data,
                )
            )
        return activity_condition_formsets

    def generate_resource_condition_formsets(self, builder: InputBuilder) -> list:
        resource_cls = builder.aircraft_cls
        resource_condition_formsets = []
        for rule_ix, rule in enumerate(builder.rules):
            resource_condition_data = []
            for cond in rule.resource_conditions:
                resource_property_type = get_model_field_type(
                    cond.resource_property,
                    resource_cls,
                )
                condition_form_data = {
                    'resource_property': cond.resource_property,
                    'resource_property_type': resource_property_type,
                    'resource_operator': cond.resource_operator,
                    'resource_reference_value': cond.resource_reference_value,
                    'resource_reference_value_type': type(cond.resource_reference_value),
                }
                resource_condition_data.append(condition_form_data)
            resource_condition_formsets.append(
                ResourceConditionFormSet(
                    prefix=f"rules-{rule_ix}-resource-conditions",
                    initial=resource_condition_data,
                )
            )
        return resource_condition_formsets

    def generate_relational_condition_formsets(self, builder: InputBuilder) -> list:
        activity_cls = builder.flight_cls
        resource_cls = builder.aircraft_cls
        relational_condition_formsets = []
        for rule_ix, rule in enumerate(builder.rules):
            relational_condition_data = []
            for cond in rule.relational_conditions:
                activity_property_type = get_model_field_type(cond.activity_property, activity_cls)
                print("activity_property_type:", activity_property_type)
                print('activity_reference_value', cond.activity_reference_value)
                resource_property_type = get_model_field_type(cond.resource_property, resource_cls)
                print("resource_property_type:", resource_property_type)
                print('resource_reference_value', cond.resource_reference_value)
                condition_form_data = {
                    'activity_property': cond.activity_property,
                    'activity_property_type': activity_property_type,
                    'activity_operator': cond.activity_operator,
                    'activity_reference_value': cond.activity_reference_value,
                    'activity_reference_value_type': type(cond.activity_reference_value),
                    'activity_resource_relation': cond.activity_resource_relation,
                    'resource_property': cond.resource_property,
                    'resource_property_type': resource_property_type,
                    'resource_operator': cond.resource_operator,
                    'resource_reference_value': cond.resource_reference_value,
                    'resource_reference_value_type': type(cond.resource_reference_value),
                }
                print("Relational condition form data:", condition_form_data)
                relational_condition_data.append(condition_form_data)
            relational_condition_formsets.append(
                RelationalConditionFormSet(
                    prefix=f"rules-{rule_ix}-relational-conditions",
                    initial=relational_condition_data,
                )
            )
        return relational_condition_formsets

    def get(
        self,
        request,
        run_id,
    ):
        """
        Handle GET requests to the optimization detail page.
        """
        # Here you would retrieve the optimization run details using run_id
        # For now, we will just render a placeholder template
        print(f"Fetching details for run_id: {run_id}")
        opt_run = OptimizationScenario.objects.filter(
            id=run_id,
            user=request.user,
        ).first()
        if not opt_run:
            return render(request, 'opt/opt404.html', status=404)
        builder = opt_run.create_builder()
        context = self.get_context(builder, opt_run)

        opt_form = OptimizationScenarioNameForm(instance=opt_run, prefix='opt')
        context['opt_form'] = opt_form

        params_form_cls = get_parameters_form_class(opt_run.builder_version)
        params_form = params_form_cls(
            initial=builder.parameters.model_dump(), prefix='params'
        )
        context['params_form'] = params_form

        rule_formset_data = [
            {
                'id': rule.id,
                'description': rule.description,
                'penalty': rule.penalty,
                'valid_from': rule.valid_from,
                'valid_to': rule.valid_to,
            } for rule in builder.rules
        ]
        rule_formset = RuleFormSet(
            prefix="rules",
            initial=rule_formset_data,
        )
        context['rule_formset'] = rule_formset
        context['relational_condition_formsets'] = self.generate_relational_condition_formsets(builder)
        context['activity_condition_formsets'] = self.generate_activity_condition_formsets(builder)
        context['resource_condition_formsets'] = self.generate_resource_condition_formsets(builder)

        custom_min_turn_times = builder.parameters.custom_min_turn_times or []
        custom_min_turn_times_data = [
            {'key': time_delta.param, 'value': time_delta.to_str()}
                for time_delta in custom_min_turn_times
        ]
        min_turn_time_formset = KeyValueFormSet(
            prefix="min_turn_time",
            initial=custom_min_turn_times_data,
        )
        context['min_turn_time_formset'] = min_turn_time_formset

        parameter_sets = ParameterSet.objects.filter(
            organization=request.user.profile.organization
        )
        context['parameter_sets'] = parameter_sets

        context['log_entries'] = logs_for_instance(opt_run)
        return render(request, self.template_name, context)

    def post(self, request, run_id):
        """
        Handle POST requests to the optimization detail page.
        """
        # Here you would handle form submission or other POST logic
        opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
        if opt_run.is_locked:
            log_error(opt_run, "Attempted to modify locked optimization run.")
            messages.error(request, "This optimization run is locked and cannot be modified.")
            return redirect('opt:detail', run_id=run_id)
        original_builder = opt_run.create_builder()
        builder = original_builder.model_copy(deep=True)
        context = self.get_context(builder, opt_run)

        params_cls = get_parameters_class(opt_run.builder_version)
        params_form_cls = get_parameters_form_class(opt_run.builder_version)
        opt_form = OptimizationScenarioNameForm(
            request.POST,
            instance=opt_run,
            prefix='opt',
        )
        context['opt_form'] = opt_form
        if opt_form.is_valid():
            if opt_form.has_changed():
                opt_form.save()
                cleaned_changed_data = {
                    key: value for key, value in opt_form.cleaned_data.items()
                        if key in opt_form.changed_data
                }
                opt_form_diff_str = diff_repr(
                    opt_form.initial,
                    opt_form.cleaned_data,
                )

                print(f"Updated OptimizationScenario {opt_run.id} {cleaned_changed_data}")
                log_info(opt_run, f"Updated Optimization scenario: {opt_form_diff_str}")
                messages.info(request, 'Scenario saved successfully')
        else:
            messages.error(request, f"Form submission failed. Please correct the errors.")
            for field, errors in opt_form.errors.items():
                for error in errors:
                    log_error(opt_run, f"Error in field '{field}': {error}")
                    messages.error(request, f"{field}: {error}")

        params_form = params_form_cls(request.POST, prefix='params')
        context['params_form'] = params_form
        custom_min_turn_times = builder.parameters.custom_min_turn_times or []
        if params_form.is_valid():
            if params_form.has_changed():
                print('params_form is_valid')
                print('params_form.cleaned', params_form.cleaned_data)
                params = params_cls(**params_form.cleaned_data)
                params.custom_min_turn_times = custom_min_turn_times
                builder.parameters = params
        else:
            messages.error(request, f"Parameters form submission failed. Please correct the errors.")

        min_turn_time_formset = KeyValueFormSet(
            request.POST,
            prefix="min_turn_time",
        )
        context['min_turn_time_formset'] = min_turn_time_formset
        if min_turn_time_formset.is_valid():
            print('min_turn_time_formset is valid')
            custom_min_turn_times = []
            has_custom_min_turn_times_errors = False
            for form in min_turn_time_formset:
                if form.cleaned_data and not form.cleaned_data.get('DELETE', False):
                    key = form.cleaned_data.get('key')
                    value = form.cleaned_data.get('value')
                    if key and value:
                        try:
                            time_delta = PositiveTimedeltaEntry(param=key, time_delta=value)
                            custom_min_turn_times.append(time_delta)
                        except ValidationError as e:
                            log_error(opt_run, f"Error parsing minimum turn time '{key}': '{value}': {e}")
                            form.add_error('value', f"Invalid time delta: {e}")
                            has_custom_min_turn_times_errors = True
            print('custom_min_turn_times:', custom_min_turn_times)
            if custom_min_turn_times and not has_custom_min_turn_times_errors:
                builder.parameters.custom_min_turn_times = custom_min_turn_times
                print('Updated builder parameters with custom_min_turn_times')
            min_turn_time_formset = KeyValueFormSet(
                prefix="min_turn_time",
                initial=[
                    {'key': time_delta.param, 'value': time_delta.to_str()}
                        for time_delta in builder.parameters.custom_min_turn_times or []
                ],
            )
            context['min_turn_time_formset'] = min_turn_time_formset
        else:
            messages.error(request, f"Minimum turn time form submission failed. Please correct the errors.")

        rule_formset = RuleFormSet(
            request.POST,
            prefix="rules",
        )
        context['rule_formset'] = rule_formset

        activity_condition_formsets = [
            ActivityConditionFormSet(
                request.POST,
                prefix=f"rules-{i}-activity-conditions",
            )
            for i in range(rule_formset.total_form_count())
        ]
        context['activity_condition_formsets'] = activity_condition_formsets
        activity_condition_formsets_valid = all(fs.is_valid() for fs in activity_condition_formsets)
        print(f"Activity condition formsets valid: {activity_condition_formsets_valid}")
        print(f"Activity condition formsets errors: {[fs.errors for fs in activity_condition_formsets]}")
        print(f"Activity condition formsets non form errors: {[fs.management_form.errors for fs in activity_condition_formsets]}")

        resource_condition_formsets = [
            ResourceConditionFormSet(
                request.POST,
                prefix=f"rules-{i}-resource-conditions",
            )
            for i in range(rule_formset.total_form_count())
        ]
        context['resource_condition_formsets'] = resource_condition_formsets
        resource_condition_formsets_valid = all(fs.is_valid() for fs in resource_condition_formsets)
        print(f"Resource condition formsets valid: {resource_condition_formsets_valid}")
        print(f"Resource condition formsets errors: {[fs.errors for fs in resource_condition_formsets]}")
        print(f"Resource condition formsets non form errors: {[fs.management_form.errors for fs in resource_condition_formsets]}")
        relational_condition_formsets = [
            RelationalConditionFormSet(
                request.POST,
                prefix=f"rules-{i}-relational-conditions",
            )
            for i in range(rule_formset.total_form_count())
        ]
        context['relational_condition_formsets'] = relational_condition_formsets
        relational_condition_formsets_valid = all(fs.is_valid() for fs in relational_condition_formsets)
        print(f"Relational condition formsets valid: {relational_condition_formsets_valid}")
        print(f"Relational condition formsets errors: {[fs.errors for fs in relational_condition_formsets]}")
        print(f"Relational condition formsets non form errors: {[fs.management_form.errors for fs in relational_condition_formsets]}")

        if rule_formset.is_valid():
            print("rule_formset is valid")
            rules = []
            for i, rule_form in enumerate(rule_formset):
                if not rule_form.cleaned_data:
                    continue
                if rule_form.cleaned_data.get("DELETE", False):
                    print(f"Skipping rule {i} marked for deletion")
                    continue
                rule_dict = deepcopy(rule_form.cleaned_data)

                activity_conditions = []
                if activity_condition_formsets_valid:
                    activity_condition_formset = activity_condition_formsets[i]
                    activity_conditions_cleaned = []
                    for form in activity_condition_formset:
                        if form.cleaned_data.get("DELETE", False):
                            print("Skipping DELETE form in activity conditions")
                            continue
                        if not form.cleaned_data:
                            print("Skipping empty form in activity conditions")
                            continue
                        if form in activity_condition_formset.deleted_forms:
                            print("Skipping deleted form in activity conditions")
                            continue
                        activity_conditions_cleaned.append(form.cleaned_data)
                    print("Activity conditions cleaned data:", activity_conditions_cleaned)
                    for cond_data in activity_conditions_cleaned:
                        condition = builder.rule_cls.activity_condition_cls(
                            **cond_data
                        )
                        activity_conditions.append(condition)

                rule_dict["activity_conditions"] = activity_conditions

                relational_conditions = []
                if relational_condition_formsets_valid:
                    relational_condition_formset = relational_condition_formsets[i]
                    relational_conditions_cleaned = []
                    for form in relational_condition_formset:
                        if form.cleaned_data.get("DELETE", False):
                            print("Skipping DELETE form in relational conditions")
                            continue
                        if not form.cleaned_data:
                            print("Skipping empty form in relational conditions")
                            continue
                        if form in relational_condition_formset.deleted_forms:
                            print("Skipping deleted form in relational conditions")
                            continue
                        relational_conditions_cleaned.append(form.cleaned_data)
                    print("Relational conditions cleaned data:", relational_conditions_cleaned)
                    for cond_data in relational_conditions_cleaned:
                        condition = builder.rule_cls.relational_condition_cls(
                            **cond_data
                        )
                        relational_conditions.append(condition)
                rule_dict["relational_conditions"] = relational_conditions

                resource_conditions = []
                if resource_condition_formsets_valid:
                    resource_condition_formset = resource_condition_formsets[i]
                    resource_conditions_cleaned = []
                    for form in resource_condition_formset:
                        if form.cleaned_data.get("DELETE", False):
                            print("Skipping DELETE form in resource conditions")
                            continue
                        if not form.cleaned_data:
                            print("Skipping empty form in resource conditions")
                            continue
                        if form in resource_condition_formset.deleted_forms:
                            print("Skipping deleted form in resource conditions")
                            continue
                        resource_conditions_cleaned.append(form.cleaned_data)
                    print("Resource conditions cleaned data:", resource_conditions_cleaned)
                    for cond_data in resource_conditions_cleaned:
                        condition = builder.rule_cls.resource_condition_cls(
                            **cond_data
                        )
                        resource_conditions.append(condition)
                rule_dict["resource_conditions"] = resource_conditions
                print("Constructed rule dict:", rule_dict)
                try:
                    rule = builder.rule_cls(**rule_dict)
                    rules.append(rule)
                except ValidationError as e:
                    rule_form.add_error(None, f"Error in rule validation: {e}")
                    print(f"Validation error for rule {i}: {e}")
            if (activity_condition_formsets_valid
                and relational_condition_formsets_valid
                and resource_condition_formsets_valid):
                builder.rules = rules
                print("Updated builder rules with new rules and conditions")
            print('RULES:', builder.rules)
            # context['activity_condition_formsets'] = self.generate_activity_condition_formsets(builder)
            # context['relational_condition_formsets'] = self.generate_relational_condition_formsets(builder)
            # context['resource_condition_formsets'] = self.generate_resource_condition_formsets(builder)
        else:
            print('rule_formset is not valid or some relational_condition_formsets are not valid')
            print(request.POST)
            rule_error_str = "Rules form submission failed."
            if rule_formset.errors and rule_formset.errors != [{}]:
                rule_error_str += f" Errors: {rule_formset.errors}."
            if any(fs.errors for fs in relational_condition_formsets):
                condition_errors = [
                    (fs.errors, fs.non_form_errors()) for fs in relational_condition_formsets
                        if fs.errors or fs.non_form_errors()
                ]
                rule_error_str += f" Condition errors: {condition_errors}."
            if any(fs.non_form_errors() for fs in relational_condition_formsets):
                rule_error_str += f" Condition non-form errors: {
                    [fs.non_form_errors() for fs in relational_condition_formsets if fs.non_form_errors()]
                }."
            log_error(opt_run, rule_error_str)
        for formset in relational_condition_formsets:
            for form in formset:
                activity_property_value = form.cleaned_data.get('activity_property')
                if not activity_property_value:
                    form.activity_property_type = type(str)
                    form.activity_property_type_str = ""
                else:
                    form.activity_property_type = get_model_field_type(
                        activity_property_value,
                        builder.flight_cls,
                    )
                    form.activity_property_type_str = data_type_str(form.activity_property_type)
                print("form.activity_property_type:", form.activity_property_type)
                resource_property_value = form.cleaned_data.get("resource_property")
                if not resource_property_value:
                    form.resource_property_type = type(str)
                    form.resource_property_type_str = ""
                else:
                    form.resource_property_type = get_model_field_type(
                        resource_property_value,
                        builder.aircraft_cls,
                    )
                    print("form.resource_property_type:", form.resource_property_type)
                    form.resource_property_type_str = data_type_str(form.resource_property_type)

        if builder.model_dump() != original_builder.model_dump():
            print('Builder has changed, saving builder.')
            opt_run.save_builder(builder)
            diff_str = diff_repr(
                original_builder.model_dump(),
                builder.model_dump(),
                exclude={'flights', 'aircrafts', 'maintenances'}
            )
            messages.info(request, f'Updated builder:\n{diff_str}')
            log_info(opt_run, f"Updated input builder:\n{diff_str}")
        context['log_entries'] = logs_for_instance(opt_run)
        return render(request, self.template_name, context)


@login_required
def upload_file_view(request):
    if not (request.method == 'POST' and request.FILES.get('file')):
        return HttpResponse('Invalid request', status=400)
    user = request.user
    opt_run_id = request.GET.get('run_id')
    if not opt_run_id:
        return HttpResponse('Optimization run ID not provided', status=400)
    opt_run = get_object_or_404(OptimizationScenario, id=opt_run_id, user=user)
    if opt_run.is_locked:
        log_error(opt_run, f"Attempted to upload file '{request.FILES.get('file').name}' to locked optimization run.")
        return HttpResponse('This optimization run is locked and cannot be modified.', status=400)
    uploaded_file = request.FILES['file']
    if uploaded_file.size > DATA_UPLOAD_MAX_MEMORY_SIZE:
        return HttpResponse('File too large', status=400)
    data = uploaded_file.read().decode('utf-8')
    errors = opt_run.update_input(data)
    if errors:
        log_error(opt_run, f"Errors while uploading file '{uploaded_file.name}'")
        for error in errors:
            log_error(opt_run, error)
            messages.error(request, error)
        return HttpResponse('Errors occurred during file upload', status=400)
    log_info(opt_run, f"File '{uploaded_file.name}' uploaded and processed successfully.")
    return HttpResponse('ok')


def individual_validation(builder: InputBuilder) -> list[str]:
    individual_validation_func = get_individual_validation_func(
        builder.version
    )
    return individual_validation_func(builder)


@login_required
def individual_validation_view(request, run_id):
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    builder = opt_run.create_builder()
    errors = individual_validation(builder)
    if errors:
        print(f"Validation errors for run_id {run_id}: {errors}")
        for error in errors:
            log_error(opt_run, error)
            messages.error(request, error)
    else:
        messages.success(
            request,
            "Individual validation successful."
        )
        log_info(opt_run, "Individual validation successful.")
        print(f"Individual validation successful for run ID {run_id}")
    return redirect('opt:detail', run_id=run_id)


def relational_validation(builder: InputBuilder) -> list[str]:
    relational_validation_func = get_relational_validation_func(
        builder.version,
    )
    return relational_validation_func(builder)


def validation(builder: InputBuilder) -> list[str]:
    errors = []
    errors.extend(individual_validation(builder))
    errors.extend(relational_validation(builder))
    return errors


@login_required
def relational_validation_view(request, run_id):
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    input_builder_data = opt_run.read_builder_data()
    builder_cls = get_opt_input_builder_class(opt_run.builder_version)
    builder = builder_cls(**input_builder_data)
    errors = relational_validation(builder)
    if errors:
        print(f"Validation errors for run_id {run_id}: {errors}")
        for error in errors:
            log_error(opt_run, error)
            messages.error(request, error)
    else:
        messages.success(
            request,
            "Relational validation successful."
        )
        log_info(opt_run, "Relational validation successful.")
        print(f"Relational validation successful for run ID {run_id}")
    return redirect('opt:detail', run_id=run_id)


class OptCloneView(LoginRequiredMixin, View):
    def post(self, request, run_id):
        original_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
        original_name = original_run.name
        new_name = original_name
        if original_name.startswith("Clone"):
            words = original_name.split(' ')
            if len(words) > 2 and words[1].isdigit():
                number = int(words[1])
                new_words = words[:]
                new_words[1] = str(number + 1)
                new_name = ' '.join(new_words)
        else:
            new_name = f"Clone 1 of {original_name}"
        cloned_run = OptimizationScenario.objects.create(
            user=request.user,
            name=new_name,
            period_start=original_run.period_start,
            period_end=original_run.period_end,
        )
        user_data = original_run.read_user_input()
        cloned_run.update_user_input(user_data)
        input_builder_data = original_run.read_builder_data()
        input_builder_data_copy = deepcopy(input_builder_data)
        cloned_run.update_input_builder(input_builder_data_copy)
        print(f"Cloned optimization run {original_run.id} to new run {cloned_run.id}")
        log_info(cloned_run, f"Cloned from optimization run {original_run.id} '{original_run.name}'.")
        messages.success(request, f"Optimization run cloned successfully.")
        return redirect('opt:detail', run_id=cloned_run.id)


class OptChooseParamSetView(LoginRequiredMixin, View):
    def post(self, request, run_id, param_set_id):
        """
        Handle POST requests to choose a parameter set for the optimization run.
        """
        print('IN POST')
        opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
        print('opt_run', opt_run)
        print('usr org', request.user.profile.organization)
        param_set = get_object_or_404(ParameterSet, pk=param_set_id, organization=request.user.profile.organization)
        print('param_set', param_set)
        parameters_cls = get_parameters_class(opt_run.builder_version)
        with open(param_set.params.path) as f:
            params_data = json.load(f)
            params = parameters_cls(**params_data)
        params = {
            "parameters": json.loads(params.model_dump_json(indent=4))
        }
        print('params:', params)
        opt_run.update_input(json.dumps(params, indent=4))
        log_info(opt_run, f"Parameter set '{param_set.name}' chosen for the optimization run.")
        messages.success(request, f"Parameter set '{param_set.name}' has been chosen for the optimization run.")
        return redirect('opt:detail', run_id=run_id)


def generate_input_file_view(request, run_id):
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    builder = opt_run.create_builder()
    individual_validation_errors = individual_validation(builder)
    if individual_validation_errors:
        for error in individual_validation_errors:
            messages.error(request, f"Individual validation error: {error}")
            log_error(
                opt_run,
                f"Failed to generate input file: individual validation error: {error}"
            )
        return redirect('opt:detail', run_id=run_id)
    relational_validation_errors = relational_validation(builder)
    if relational_validation_errors:
        for error in relational_validation_errors:
            messages.error(request, f"Relational validation error: {error}")
            log_error(
                opt_run,
                f"Failed to generate input file: relational validation error: {error}"
            )
        return redirect('opt:detail', run_id=run_id)
    result = generate_input_file(
        builder,
        opt_run,
    )
    if result.error_messages:
        for error in result.error_messages:
            log_error(opt_run, f"Failed to generate input file: {error}")
            messages.error(request, error)
        return redirect('opt:detail', run_id=run_id)
    input_file = result.input_file
    response = HttpResponse(input_file.model_dump_json(indent=4), content_type='application/json')
    log_info(opt_run, "Input file generated successfully.")
    return response


@login_required
def delete_opt_logs_view(request, run_id):
    if request.method != 'POST':
        return HttpResponse('Invalid request method', status=405)
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    log_entries = logs_for_instance(opt_run)
    num_logs = log_entries.count()
    log_entries.delete()
    messages.success(request, f"Deleted {num_logs} log entries for this optimization run.")
    return redirect('opt:detail', run_id=run_id)


class OptSolutionListView(LoginRequiredMixin, View):
    def get(self, request, run_id):
        opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
        output_files = opt_run.output_files.all() or []
        context = {
            'opt_run': opt_run,
            'output_files': output_files,
        }
        return render(request, 'opt/solution_list.html', context)


class OptSolutionDetailView(LoginRequiredMixin, View):
    def get(self, request, run_id, output_id):
        opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
        output_file = get_object_or_404(OutputFile, id=output_id, run=opt_run)
        kpis = kpi_table_from_output_files([output_file])
        output_file_names = [str(output_file)]
        kpis_rows = [
            [name] + list(kpis[name].values()) for name in kpis.keys()
        ]
        print('=========================================')
        print('kpis_rows', kpis_rows)
        print('output_file_names', output_file_names)
        context = {
            'output_file_ids': [output_file.id],
            'output_file_names': output_file_names,
            'kpis_rows': kpis_rows,
        }
        return render(request, 'opt/solution_detail.html', context)


class OptSolutionCompareView(LoginRequiredMixin, View):
    def get(self, request, run_id):
        opt_scenario = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)

        output_files = opt_scenario.output_files.all()
        output_files_dict = {of.id: of for of in output_files}

        # Get comma-separated IDs from query params
        ids_str = request.GET.get('ids', '')
        try:
            ids = set(int(i) for i in ids_str.split(',') if i)
        except ValueError:
            ids = set()
        if not ids:
            return HttpResponse("No valid solution IDs provided for comparison.", status=400)
        for id_ in ids:
            if id_ not in output_files_dict:
                return HttpResponse(f"Solution ID {id_} not found for this optimization run.", status=404)
        if len(ids) < 2:
            return HttpResponse("At least two solution IDs are required for comparison.", status=400)

        # Query the solutions
        output_files = OutputFile.objects.filter(run_id=run_id, id__in=ids)
        output_file_names = [str(f) for f in output_files]
        diffs = diff_kpis_from_output_file(output_files)
        print('diffs', diffs)
        kpis_diff_rows = [
            [name] + list(diffs[name].values()) for name in diffs.keys()
        ]
        print('kpis_diff_rows', kpis_diff_rows)
        kpis = kpi_table_from_output_files(output_files)
        kpis_rows = [
            [name] + list(kpis[name].values()) for name in kpis.keys()
        ]
        print('=========================================')
        print('kpis_rows', kpis_rows)
        print('output_file_names', output_file_names)
        print('kpis_diff_rows', kpis_diff_rows)
        context = {
            'output_file_names': output_file_names,
            'kpis_diff_rows': kpis_diff_rows,
            'kpis_rows': kpis_rows,
        }
        return render(request, 'opt/solution_compare.html', context)


@login_required
def compare_solution_ids(request):
    solutions_query = request.GET.get('solution_ids', '')
    if not solutions_query:
        return HttpResponse('No solutions provided', status=400)
    solution_kpis_lst = []
    for solution in solutions_query.split(','):
        run_directory, solution_filename = solution.split(':')
        run_directory = f'/{run_directory.replace('-', '/')}'  # Convert back to original format
        base_dir = None
        relative_dir = None
        if run_directory.startswith(f'/{request.user.username}'):
            relative_dir = run_directory.lstrip('/')
            base_dir = MEDIA_ROOT
        elif request.user.is_superuser:
            if run_directory.startswith('/scenarios/'):
                relative_dir = run_directory.removeprefix('/scenarios/')
                base_dir = SCENARIOS_DIR
            elif run_directory.startswith('/output/'):
                relative_dir = run_directory.removeprefix('/output/')
                base_dir = OUTPUT_DIR
        if base_dir is None or relative_dir is None:
            return HttpResponse(f"Solution not found: {solution}", status=404)
        relative_path = f"{relative_dir}/{solution_filename}"
        if not is_safe_path(base_dir, relative_path):
            logger.error(f"Unsafe path detected for solution '{solution}' with base '{base_dir}'")
            return HttpResponse(f"Solution not found: {solution}", status=404)
        file_path = Path(base_dir) / relative_path
        if not file_path.is_file():
            return HttpResponse(f"File not found: {solution}", status=404)
        content = json.loads(file_path.read_text())
        if not content.get('kpis'):
            return HttpResponse(f"No KPIs found in: {relative_path}", status=400)
        folder = relative_dir.split('/')[-1]
        sol_filename = f'{folder}/{solution_filename}'
        kpis = KPIs(**content['kpis'])
        solution_kpis = SolutionKPIs(
            solution_name=sol_filename,
            kpis=kpis,
        )
        solution_kpis_lst.append(solution_kpis)
    if len(solution_kpis_lst) < 2:
        return HttpResponse("At least two solutions are required for comparison.", status=400)
    kpi_diffs = diff_kpis(solution_kpis_lst)
    kpi_tab = kpi_table(solution_kpis_lst)
    kpis_diff_rows = [
        [name] + list(kpi_diffs[name].values()) for name in kpi_diffs.keys()
    ]
    kpis_rows = [
        [name] + list(kpi_tab[name].values()) for name in kpi_tab.keys()
    ]
    context = {
        'output_file_names': [sk.solution_name for sk in solution_kpis_lst],
        'kpis_diff_rows': kpis_diff_rows,
        'kpis_rows': kpis_rows,
    }
    return render(request, 'opt/solution_compare.html', context)



def report_type_and_format(string: str) -> tuple[str, str]:
    report_words = string.split('_')
    assert len(report_words) >= 2, "Invalid report name format"
    report_type = '_'.join(report_words[:-1])
    report_format = report_words[-1]
    return report_type, report_format


def solution_reports_view(request, run_id, output_id):
    output_file = get_object_or_404(OutputFile, pk=output_id)
    run = output_file.run
    if run.user != request.user:
        return HttpResponse("You do not have permission to view this report.", status=403)
    opt_run = output_file.run
    version = run.builder_version
    output_dict = json.loads(output_file.read_content())
    builder = run.read_builder_data()
    if not builder.get('flights'):
        logger.error(f"No flights found in input file for optimization run ID {run_id}.")
        response = JsonResponse(output_dict, safe=False, json_dumps_params={'indent': 4})
        response['Content-Disposition'] = 'inline; filename="output.json"'
        return response
    print('output_dict', output_dict)
    output_file_py = get_opt_output_file_class(version)(**output_dict)
    builder_cls = get_opt_input_builder_class(version)
    builder = builder_cls(**opt_run.read_builder_data())
    output_file_new = generate_output_file(builder, output_file_py)
    print('output_file_new', output_file_new.model_dump_json(indent=4))
    response = JsonResponse(output_file_new.model_dump(exclude_none=True), safe=False)
    response['Content-Disposition'] = 'inline; filename="output.json"'
    return response


def solution_reports_old_view(request):
    run_dir = request.GET.get('run', '')
    run_dir = f'/{run_dir.replace("-", "/")}'  # Convert back to original format
    output_filename = request.GET.get('output')
    format_ = request.GET.get('format', 'json')
    report_type = request.GET.get('report_type')
    print(f"Requested report for run: {run_dir}, output: {output_filename}, format: {format_}, type: {report_type}")
    if run_dir.startswith('/scenarios/'):
        run_dir = run_dir.replace('/scenarios', '')
        file_path = Path(f"{SCENARIOS_DIR}{run_dir}/{output_filename}")
    elif run_dir.startswith('/outputs/'):
        run_dir = run_dir.replace('/outputs', '')
        file_path = Path(f"{OUTPUT_DIR}{run_dir}/{output_filename}")
    else:
        return HttpResponse("Invalid run directory.", status=400)
    content = file_path.read_text()
    output_dict = json.loads(content)
    return JsonResponse(output_dict, safe=False, json_dumps_params={'indent': 4})


@login_required
def output_file_view(request, output_file_id):
    output_file = get_object_or_404(OutputFile, pk=output_file_id)
    run = output_file.run
    if run.user != request.user:
        return HttpResponse("You do not have permission to view this file.", status=403)
    content_json = json.loads(output_file.read_content())
    return JsonResponse(content_json, safe=False, json_dumps_params={'indent': 4})


@login_required
def input_builder_view(request, run_id):
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    return JsonResponse(opt_run.read_builder_data(), safe=False, json_dumps_params={'indent': 4})


@login_required
def input_file_view(request, run_id):
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    output_folder = MEDIA_ROOT / opt_run.run_directory
    print(f"Looking for input file in: {output_folder}")
    if not output_folder.exists() or not output_folder.is_dir():
        return HttpResponse('Output folder not found', status=404)
    filepath = output_folder / INPUT_FILENAME
    if not filepath.exists() or not filepath.is_file():
        return HttpResponse('Input file not found', status=404)
    input_data = json.loads(filepath.read_text())

    return JsonResponse(input_data, safe=False, json_dumps_params={'indent': 4})


@login_required
def user_input_file_view(request, run_id):
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    user_input_dict = opt_run.read_user_input()
    return JsonResponse(user_input_dict, safe=False, json_dumps_params={'indent': 4})


@login_required
def run_summary_view(request, run_id):
    logger.info('Fetching run summary for run ID: %s', run_id)
    print('Fetching run summary for run ID:', run_id)
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    logger.info('Looking for run summary file at: %s', opt_run.run_summary_file.path)
    print('Looking for run summary file at:', settings.MEDIA_ROOT / opt_run.run_summary_file.path)
    print('opt_run.run_summary_file', opt_run.run_summary_file)
    if not opt_run.run_summary_file or not (settings.MEDIA_ROOT / opt_run.run_summary_file.path).exists():
        return HttpResponse('Run summary file not found', status=404)
    return JsonResponse(opt_run.read_run_summary(), safe=False, json_dumps_params={'indent': 4})


@login_required
def files_view(request, path):
    # TODO should be removed
    file_path = Path(MEDIA_ROOT) / path
    if not file_path.exists() or not file_path.is_file():
        return HttpResponse('File not found', status=404)
    with open(file_path, 'r') as f:
        content_dict = json.load(f)
    return JsonResponse(content_dict, safe=False, json_dumps_params={'indent': 4})


@login_required
def compare_solutions(request):
    output_ids_query = request.GET.get('output_ids', '')
    if not output_ids_query:
        return HttpResponse('No solutions provided', status=400)
    try:
        output_ids = set(int(i) for i in output_ids_query.split(',') if i)
    except ValueError:
        return HttpResponse('Invalid solution IDs provided', status=400)
    if len(output_ids) < 2:
        return HttpResponse("At least two solutions are required for comparison.", status=400)
    output_files = OutputFile.objects.filter(id__in=output_ids, run__user=request.user)
    found_ids = {of.id for of in output_files}
    missing_ids = output_ids - found_ids
    if missing_ids:
        return HttpResponse(f"Solution IDs not found or inaccessible: {', '.join(map(str, missing_ids))}", status=404)
    solution_kpis_lst = []
    for output_file in output_files:
        content = json.loads(output_file.read_content())
        if not content.get('kpis'):
            print(f"No KPIs found in: {output_file}")
            return HttpResponse(f"No KPIs found in: {output_file}", status=400)
        kpis = KPIs(**content['kpis'])
        solution_kpis = SolutionKPIs(
            solution_name=str(output_file),
            kpis=kpis,
        )
        print(f"Loaded solution KPIs: {solution_kpis.kpis}")
        solution_kpis_lst.append(solution_kpis)
    if len(solution_kpis_lst) < 2:
        return HttpResponse("At least two solutions are required for comparison.", status=400)
    kpi_diffs = diff_kpis(solution_kpis_lst)
    kpi_tab = kpi_table(solution_kpis_lst)
    kpis_diff_rows = [
        [name] + list(kpi_diffs[name].values()) for name in kpi_diffs.keys()
    ]
    kpis_rows = [
        [name] + list(kpi_tab[name].values()) for name in kpi_tab.keys()
    ]
    context = {
        'output_file_names': [sk.solution_name for sk in solution_kpis_lst],
        'kpis_diff_rows': kpis_diff_rows,
        'kpis_rows': kpis_rows,
    }
    return render(request, 'opt/solution_compare.html', context)


@login_required
def send_to_optimizer_view(request, run_id):
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    builder = opt_run.create_builder()
    errors = validation(builder)
    if errors:
        for error in errors:
            messages.error(request, error)
            log_error(opt_run, f"Failed to send to optimizer: {error}")
        return redirect('opt:detail', run_id=run_id)
    input_file_result = generate_input_file(builder, opt_run)
    if input_file_result.error_messages:
        for error in input_file_result.error_messages:
            messages.error(request, error)
            log_error(opt_run, f"Failed to send to optimizer: {error}")
        return redirect('opt:detail', run_id=run_id)
    input_file = input_file_result.input_file
    file_path = MEDIA_ROOT / opt_run.run_directory / 'input.json'
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(input_file.model_dump_json(indent=4))
    aws_path = Path(AWS_LOCATION) / f"{opt_run.run_directory}/input.json"
    try:
        s3.upload_file(str(file_path), AWS_STORAGE_BUCKET_NAME, str(aws_path))
        log_info(opt_run, f"Uploaded input file to S3 at {aws_path}")
        opt_run.status = OptimizationScenario.SENT
        opt_run.save()
        log_info(opt_run, "Input file uploaded to S3 and optimization run marked as SENT")
    except Exception as e:
        messages.error(request, f"Failed to upload input file to optimizer: {e}")
        log_error(opt_run, f"Failed to upload input file to S3: {e}")
        return redirect('opt:detail', run_id=run_id)
    try:
        logger.info(opt_run, "Sending message to optimizer queue...")
        send_msg_to_optimizer_queue(json.dumps({
            "opt_scenario_id": opt_run.id,
            "s3_bucket": AWS_STORAGE_BUCKET_NAME,
            "job_id": opt_run.run_directory.replace('/', '-') + '+' + datetime.now().strftime("%Y%m%d%H%M%S"),
            "s3_key": str(aws_path),
            'response_queue': OPTIMIZER_RESPONSE_QUEUE_URL,
        }))
        logger.info("Message sent to optimizer queue.")
    except Exception as e:
        print(f"Failed to send message to optimizer queue: {e}")
        messages.error(request, f"Failed to send message to optimizer queue: {e}")
        log_error(opt_run, f"Failed to send message to optimizer queue: {e}")
    return redirect('opt:detail', run_id=run_id)


@login_required
def deassign_all_flights_view(request, run_id):
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    if opt_run.is_locked:
        log_error(opt_run, "Attempted to deassign flights from aircraft in locked optimization run.")
        return redirect('opt:detail', run_id=run_id)
    input_builder_data = opt_run.read_builder_data()
    builder_cls = get_opt_input_builder_class(opt_run.builder_version)
    builder = builder_cls(**input_builder_data)
    for flight in builder.flights:
        flight.aircraft_id = None
    opt_run.update_input_builder(builder)
    log_info(opt_run, "All flights deassigned from aircraft.")
    messages.success(request, "All flights have been deassigned from aircraft.")
    return redirect('opt:detail', run_id=run_id)


@login_required
def delete_all_solutions_view(request, run_id):
    opt_run = get_object_or_404(OptimizationScenario, pk=run_id, user=request.user)
    num_solutions = opt_run.output_files.count()
    opt_run.output_files.all().delete()
    log_info(opt_run, f"Deleted all {num_solutions} solutions for this optimization run.")
    messages.success(request, f"Deleted all {num_solutions} solutions for this optimization run.")
    opt_run.run_summary_file.delete(save=False)
    return redirect('opt:detail', run_id=run_id)


@login_required
def directories_view(request):
    user = request.user
    opt_runs = OptimizationScenario.objects.filter(user=user).order_by('-created_at')
    run_directories = [
        opt_run.run_directory.strip('/') for opt_run in opt_runs
    ]
    if not user.is_superuser:
        return JsonResponse({'run_directories': run_directories})
    # Add all relative directories under settings.OUTPUT_DIR
    output_dir = settings.OUTPUT_DIR
    for dirpath, dirnames, _filenames in os.walk(output_dir):
        if not dirnames:
            relative_path = os.path.relpath(dirpath, output_dir.parent)
            run_directories.append(relative_path)
    # Add all relative directories under settings.SCENARIOS_DIR
    scenarios_dir = settings.SCENARIOS_DIR
    for dirpath, dirnames, _filenames in os.walk(scenarios_dir):
        if not dirnames:
            relative_path = os.path.relpath(dirpath, scenarios_dir.parent)
            run_directories.append(relative_path)
    return JsonResponse({'run_directories': run_directories})


@login_required
def directory_file_view(request, directory, filename):
    directory = directory
    print(f"Fetching file '{filename}' from directory '{directory}' for user '{request.user.username}'")
    user = request.user
    opt_run = OptimizationScenario.objects.filter(user=user, run_directory=directory).first()
    if not user.is_superuser:
        if not opt_run:
            return HttpResponse(f"Could not find {directory}", status=400)
        output_folder = MEDIA_ROOT / directory
        file_path = output_folder / filename
        if not file_path.exists() or not file_path.is_file():
            logger.error(f"File not found: {file_path}")
            return HttpResponse('File not found', status=404)
        with open(file_path, 'r', encoding='utf-8') as f:
            content_dict = json.load(f)
        return JsonResponse(content_dict, safe=False, json_dumps_params={'indent': 4})
    print('opt_run', opt_run)
    directories = set((opt_run.run_directory,)) if opt_run else set()
    # Add all relative directories under settings.OUTPUT_DIR
    output_dir = OUTPUT_DIR
    for dirpath, dirnames, _filenames in os.walk(output_dir):
        if not dirnames:
            relative_path = os.path.relpath(dirpath, output_dir.parent)
            directories.add(str(relative_path))
    # Add all relative directories under settings.SCENARIOS_DIR
    scenarios_dir = SCENARIOS_DIR
    for dirpath, dirnames, _filenames in os.walk(scenarios_dir):
        if not dirnames:
            relative_path = os.path.relpath(dirpath, scenarios_dir.parent)
            directories.add(str(relative_path))
    opt_dir = MEDIA_ROOT
    for dirpath, dirnames, _filenames in os.walk(opt_dir):
        if not dirnames:
            relative_path = os.path.relpath(dirpath, opt_dir)
            directories.add(str(relative_path))
    if directory not in directories:
        return HttpResponse(f"Could not find {directory}", status=400)
    if directory.startswith('output'):
        base_dir = OUTPUT_DIR.parent
    elif directory.startswith('scenarios'):
        base_dir = SCENARIOS_DIR.parent
    elif directory.startswith(user.username):
        base_dir = MEDIA_ROOT
    else:
        logger.error(f"Could not find directory: {directory}")
        return HttpResponse(f"Could not find {directory}", status=400)
    output_folder = Path(base_dir) / directory
    logger.info(f"Looking for file at: {output_folder / filename}")
    file_path = output_folder / filename
    if not file_path.exists() or not file_path.is_file():
        logger.error(f"File not found: {file_path}")
        return HttpResponse('File not found', status=404)
    with open(file_path, 'r', encoding='utf-8') as f:
        content_dict = json.load(f)
    return JsonResponse(content_dict, safe=False, json_dumps_params={'indent': 4})



@login_required
def directory_solutions_view(request, directory):
    print(f"Fetching solutions from directory '{directory}' for user '{request.user.username}'")
    user = request.user
    opt_run = OptimizationScenario.objects.filter(user=user, run_directory=directory).first()
    if not user.is_superuser:
        if not opt_run:
            return HttpResponse(f"Could not find {directory}", status=400)
        output_files = opt_run.output_files.all() or []
        context = {
            'opt_run': opt_run,
            'solutions': output_files,
        }
        return JsonResponse(context, safe=False, json_dumps_params={'indent': 4})
    print('opt_run', opt_run)
    directories = set((opt_run.run_directory,)) if opt_run else set()
    # Add all relative directories under settings.OUTPUT_DIR
    output_dir = OUTPUT_DIR
    for dirpath, dirnames, _filenames in os.walk(output_dir):
        if not dirnames:
            relative_path = os.path.relpath(dirpath, output_dir.parent)
            directories.add(str(relative_path))
    scenario_dir = SCENARIOS_DIR
    for dirpath, dirnames, _filenames in os.walk(scenario_dir):
        if not dirnames:
            relative_path = os.path.relpath(dirpath, scenario_dir.parent)
            directories.add(str(relative_path))
    opt_dir = MEDIA_ROOT
    for dirpath, dirnames, _filenames in os.walk(opt_dir):
        if not dirnames:
            relative_path = os.path.relpath(dirpath, opt_dir)
            directories.add(str(relative_path))
    print(f'directory "{directory}"')
    print(f'directories: {directories}')
    if directory not in directories:
        print(f'Could not find directory "{directory}"')
        return HttpResponse(f"Could not find {directory}", status=400)
    if directory.startswith('output'):
        base_dir = BASE_DIRS['output']
    elif directory.startswith('scenarios'):
        base_dir = BASE_DIRS['scenarios']
    elif directory.startswith(user.username):
        base_dir = MEDIA_ROOT
    else:
        return HttpResponse(f"Could not find {directory}", status=400)
    print('base_dir', base_dir)
    dir_path = Path(base_dir) / directory
    print('dir_path', dir_path)
    files = [str(Path(directory) / file.name) for file in dir_path.glob('step*.json') if file.is_file()]

    context = {
        'solutions': files,
    }
    return JsonResponse(context, safe=False, json_dumps_params={'indent': 4})


def locate_directory_abspath_safe(directory: str, user: User) -> Path | None:
    if not user.is_superuser:
        opt_run = OptimizationScenario.objects.filter(user=user, run_directory=directory).first()
        if not opt_run:
            logger.error(f"Could not find directory '{directory}' for user '{user.username}'")
            return None
        if not is_safe_path(MEDIA_ROOT, directory):
            logger.error(f"Unsafe path detected for directory '{directory}' for user '{user.username}' with base '{MEDIA_ROOT}'")
            return None
        path = Path(MEDIA_ROOT) / directory
        if not path.exists() or not path.is_dir():
            logger.error(f"Directory '{directory}' does not exist under MEDIA_ROOT for user '{user.username}'")
            return None
        return path
    base_dir = None
    dirs = BASE_DIRS.copy()
    dirs[user.username] = MEDIA_ROOT
    for key in dirs:
        if directory.startswith(key):
            base_dir = dirs[key]
            if not is_safe_path(base_dir, directory):
                logger.error(f"Unsafe path detected for directory '{directory}' with base '{base_dir}'")
                return None
    if not base_dir:
        logger.error(f"Could not determine base directory for '{directory}'")
        return None
    path = base_dir / directory
    if path.exists() and path.is_dir():
        return path
    logger.error(f"Directory '{directory}' does not exist under base '{base_dir}'")
    return None


@login_required
def directory_reports_view(request, directory, filename):
    opt_run = OptimizationScenario.objects.filter(user=request.user, run_directory=directory).first()
    version = opt_run.builder_version if opt_run else LATEST_VERSION
    dir_path = locate_directory_abspath_safe(directory, request.user)
    if not dir_path:
        return HttpResponse(f"Error finding directory '{directory}'", status=400)
    file_path = dir_path / filename
    if not file_path.exists() or not file_path.is_file():
        return HttpResponse(f"File '{filename}' not found in directory '{directory}'", status=404)
    report = request.GET.get('report')
    if not report in AVAILABLE_REPORTS:
        return HttpResponse(f"Report '{report}' not supported.", status=400)
    report_words = report.split('_')
    report_type = '_'.join(report_words[:-1])
    report_format = report_words[-1]
    if not report_type:
        report_type = 'output'
        logger.info(f"No report type specified, defaulting to 'output'")
    user_input_file = dir_path / USER_INPUT_FILENAME
    input_file = dir_path / INPUT_FILENAME
    output_file = dir_path / OUTPUT_FILENAME
    input_builder_file = dir_path / INPUT_BUILDER_FILENAME
    report_class = AVAILABLE_REPORTS[report]
    report = report_class(reports.ReportContext(
        directory=dir_path,
        input_builder_file=input_builder_file,
        file_path=file_path,
        input_file=input_file,
        output_file=output_file,
        user_input_file=user_input_file,
        version=version,
    ))
    try:
        report_content = report.generate()
    except Exception as e:
        logger.error(f"Error generating report: {e}")
        return HttpResponse(f"Error generating report.", status=500)
    content_type = reports.REPORT_FORMAT_TO_CONTENT_TYPE.get(report_format)
    return HttpResponse(report_content, content_type=content_type)