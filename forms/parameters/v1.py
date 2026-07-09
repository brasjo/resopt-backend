from django import forms

from forms.standalone import PositiveMinuteDeltaField
from .base import ParametersForm


class ParametersFormV1(ParametersForm):
    use_min_turn_time_rule = forms.BooleanField(
        required=False,
        initial=True,
        label="Use Minimum Turn Time Rule",
        help_text="If True, the minimum turn time rule is applied to flights."
    )
    default_min_turn_time = PositiveMinuteDeltaField(
        initial="01:00",
        label="Default Minimum Turn Time",
        help_text="The default minimum turn time between flights in hours and minutes. Format: HH:MM",
        widget=forms.TextInput(attrs={
            'placeholder': 'HH:MM',
            'class': 'time-input'
        })
    )
    use_max_turn_time_rule = forms.BooleanField(
        required=False,
        initial=True,
        label="Use Maximum Turn Time Rule",
        help_text="If True, the maximum turn time rule is applied to flights."
    )
    max_turn_time = PositiveMinuteDeltaField(
        initial="02:00",
        label="Maximum Turn Time",
        help_text="The maximum turn time between flights in hours and minutes. Format: HH:MM",
        widget=forms.TextInput(attrs={
            'placeholder': 'HH:MM',
            'class': 'time-input'
        })
    )
    max_turn_time_penalty_per_minute = forms.IntegerField(
        initial=0,
        min_value=0,
        label="Max Turn Time Penalty Per Minute",
        help_text="The penalty applied for each minute over the maximum turn time."
    )
    use_pax_penalty = forms.BooleanField(
        required=False,
        initial=True,
        label="Use Passenger Penalty",
        help_text="If True, the passenger penalty is applied to flights."
    )
    use_fuel_penalty = forms.BooleanField(
        required=False,
        initial=True,
        label="Use Fuel Penalty",
        help_text="If True, the fuel penalty is applied to flights."
    )
    fuel_penalty_per_kg = forms.IntegerField(
        initial=0,
        min_value=0,
        label="Fuel Penalty Per KG",
        help_text="The fuel penalty applied per kilogram of fuel."
    )
    pax_penalty_per_seat_difference = forms.IntegerField(
        initial=0,
        min_value=0,
        label="Pax Penalty Per Seat Difference",
        help_text="The penalty applied per seat difference for passengers."
    )
    allow_refleeting_with_penalty = forms.BooleanField(
        required=False,
        initial=True,
        label="Allow Refleeting With Penalty",
        help_text="If True, refleeting is allowed with a penalty."
    )
    penalty_per_refleet = forms.IntegerField(
        initial=0,
        min_value=0,
        label="Penalty Per Refleet",
        help_text="The penalty applied for each refleeting action."
    )
    reoptimize_solution = forms.BooleanField(
        required=False,
        initial=False,
        label="Reoptimize already assigned solution",
        help_text="If True, reoptimizing with least changes from the original."
    )
