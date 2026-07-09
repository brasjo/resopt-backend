from .parameters.base import ParametersForm
from .parameters.v1 import ParametersFormV1
from schemas.parameters.base import Parameters
from schemas.parameters.v1 import ParametersV1


PARAMETER_FORM_MAP: dict[str, type[ParametersForm]] = {
    'v1': ParametersFormV1
}


def get_parameters_form_class(version: str) -> type[ParametersForm]:
    return PARAMETER_FORM_MAP[version]


FORM_PARAMETERS_MAP: dict[ParametersForm, Parameters] = {
    ParametersFormV1: ParametersV1,
}


def get_parameters_class_from_form(
    form: ParametersForm,
) -> Parameters:
    return FORM_PARAMETERS_MAP[form]


PARAMETERS_FORM_MAP: dict[Parameters, ParametersForm] = {
    ParametersV1: ParametersForm,
}


def get_form_class_from_parameters(
    parameters: Parameters,
) -> ParametersForm:
    return PARAMETERS_FORM_MAP[parameters]
