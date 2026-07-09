import json

from django.contrib import messages
from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import Http404
from django.shortcuts import (
    get_object_or_404,
    redirect,
    render,
)
from django.views import View
from django.views.generic import ListView
from django.core.files.base import ContentFile
from pydantic import ValidationError

from .forms import ParametersForm, KeyValueFormSet
from .models import ParameterSet
from schemas.parameters.base import Parameters
from schemas.loader import (
    get_parameters_class,
)
from schemas.base import PositiveTimedeltaEntry
from params.forms import ParameterSetForm


DEFAULT_PARAMETER_SET_CONTENT = settings.DEFAULT_PARAMETER_SET_CONTENT


class DeleteParameterSetView(LoginRequiredMixin, View):
    def post(self, request, pk):
        parameter_set = get_object_or_404(ParameterSet, pk=pk)
        user = request.user
        if not user.is_superuser:
            if not user.profile.organization or user.profile.organization != parameter_set.organization:
                raise Http404("Not found.")
            if parameter_set.name == 'default':
                messages.error(request, "The default parameter set cannot be removed.")
                return redirect('params:list')
        parameter_set.delete()
        messages.success(request, "Parameter set removed successfully.")
        return redirect('params:list')


class CreateParameterSetView(LoginRequiredMixin, View):
    def get(self, request):
        form = ParameterSetForm()
        if request.user.is_superuser:
             parameter_sets = ParameterSet.objects.all()
        else:
            parameter_sets = ParameterSet.objects.filter(
                organization=request.user.profile.organization
            )
        return render(request, 'params/parameter_set_create.html', {
            'form': form,
            'parameter_sets': parameter_sets,
        })
    def post(self, request):
        form = ParameterSetForm(request.POST)
        if not form.is_valid():
            messages.error(request, "Invalid form submission: " + str(form.errors))
            return redirect('params:list')
        from_id = request.POST.get('from_id')
        print(f'from_id: {from_id}')
        user_organization = request.user.profile.organization
        param_sets = ParameterSet.objects.filter(organization=user_organization)
        param_set_names = [param_set.name for param_set in param_sets]
        if form.cleaned_data['name'] in param_set_names:
            messages.error(request, "A parameter set with this name already exists. Please choose a different name.")
            return redirect('params:list')
        if from_id:
            existing_parameter_set = get_object_or_404(ParameterSet, pk=from_id)
            if not request.user.is_superuser:
                if not user_organization or user_organization != existing_parameter_set.organization:
                    raise Http404("You are not authorized to access this parameter set.")
            parameter_set = ParameterSet.objects.create(
                name=form.cleaned_data['name'],
                description=form.cleaned_data['description'],
                organization=request.user.profile.organization,
            )
            if existing_parameter_set.params:
                print("Copying parameters from existing parameter set", existing_parameter_set.name)
                with open(existing_parameter_set.params.path, 'r') as f:
                    params_content = f.read()
                parameter_set.params.save(f"{parameter_set.name}.json", ContentFile(params_content), save=True)
        else:
            parameter_set = ParameterSet.objects.create(
                name=form.cleaned_data['name'],
                description=form.cleaned_data['description'],
                organization=request.user.profile.organization,
            )
            parameter_set.params.save(
                f"{parameter_set.name}.json",
                ContentFile(DEFAULT_PARAMETER_SET_CONTENT), save=True
            )
        messages.success(request, "Parameter set created successfully.")
        return redirect('params:detail', pk=parameter_set.id)


class ParameterSetDetailView(LoginRequiredMixin, View):
    def get(self, request, pk):
        parameter_set = get_object_or_404(ParameterSet, pk=pk)
        context = {}
        if parameter_set.params:
            params_dict = parameter_set.read_data()
            params_cls = get_parameters_class()
            params = params_cls(**params_dict)
            params_form = ParametersForm(initial=params_dict, prefix='params')
            if params.custom_min_turn_times:
                custom_min_turn_times = params.custom_min_turn_times
                initial_data = [
                    {'key': time_delta.param, 'value': time_delta.to_str()} \
                        for time_delta in custom_min_turn_times
                ]
                min_turn_time_formset = KeyValueFormSet(
                    prefix="min_turn_time",
                    initial=initial_data)
                context['min_turn_time_formset'] = min_turn_time_formset
            else:
                context['min_turn_time_formset'] = KeyValueFormSet(
                    prefix="min_turn_time",
                )
        else:
            params_form = ParametersForm()
        user = request.user
        if user.is_superuser or parameter_set.organization == user.profile.organization:
            context['parameter_set'] = parameter_set
            context['params_form'] = params_form
            return render(request, 'params/parameter_set_detail.html', context)
        raise Http404("Not found.")

    def post(self, request, pk):
        params_form = ParametersForm(request.POST, prefix='params')
        min_turn_time_formset = KeyValueFormSet(
            request.POST,
            prefix="min_turn_time",
        )
        parameter_set = get_object_or_404(ParameterSet, pk=pk)
        user = request.user
        if not user.is_superuser:
            if not user.profile.organization or user.profile.organization != parameter_set.organization:
                raise Http404("Not found.")
        if not params_form.is_valid():
            messages.error(request, "Invalid form submission: " + str(params_form.errors))
            return render(request, 'params/parameter_set_detail.html', {
                'parameter_set': parameter_set,
                'params_form': params_form,
                'min_turn_time_formset': min_turn_time_formset
            })
        params_cls = get_parameters_class()
        try:
            parameters = params_cls(**params_form.cleaned_data)
        except ValidationError as e:
            params_form.add_error(None, "Invalid parameter values: " + str(e))
            return render(request, 'params/parameter_set_detail.html', {
                'parameter_set': parameter_set,
                'params_form': params_form,
                'min_turn_time_formset': min_turn_time_formset
            })
        if min_turn_time_formset.is_valid():
            print("Min turn time formset is valid")
            custom_min_turn_times = []
            for entry in min_turn_time_formset.cleaned_data:
                if entry and entry.get('key') and entry.get('value'):
                    if entry.get('DELETE'):
                        continue
                    try:
                        custom_min_turn_times.append(
                            PositiveTimedeltaEntry(
                                param=entry['key'],
                                time_delta=entry['value'],
                            )
                        )
                    except ValidationError as e:
                        messages.error(request, f"Invalid entry {entry}: {e}")
                        return render(request, 'params/parameter_set_detail.html', {
                            'parameter_set': parameter_set,
                            'params_form': params_form,
                            'min_turn_time_formset': min_turn_time_formset
                        })
            parameters.custom_min_turn_times = custom_min_turn_times
            try:
                params_cls.model_validate(parameters.model_dump())
            except ValidationError as e:
                messages.error(request, f"Invalid entry {entry}: {e}")
                return render(request, 'params/parameter_set_detail.html', {
                    'parameter_set': parameter_set,
                    'params_form': params_form,
                    'min_turn_time_formset': min_turn_time_formset
                })
        else:
            messages.error(request, "Invalid custom minimum turn time entries.")
            return render(request, 'params/parameter_set_detail.html', {
                'parameter_set': parameter_set,
                'params_form': params_form,
                'min_turn_time_formset': min_turn_time_formset
            })
        print('parameters.model_dump_json', parameters.model_dump_json(indent=4))
        current_file = ContentFile(parameters.model_dump_json(indent=4))
        parameter_set.params.save(f"{parameter_set.name}.json", current_file, save=True)
        messages.success(request, "Parameters saved successfully.")
        return self.get(request, pk=parameter_set.id)


class ParameterSetListView(LoginRequiredMixin, ListView):
    model = ParameterSet
    template_name = 'params/parameter_set_list.html'
    context_object_name = 'parameter_sets'
    paginate_by = 10

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            # If the user is a superuser, return all parameter sets
            return ParameterSet.objects.all()
        org = user.profile.organization
        if org:
            # If the user belongs to an organization, filter by organization
            return ParameterSet.objects.filter(
                organization=org
            )
        return []

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['form_new'] = ParameterSetForm()
        return context
