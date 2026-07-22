from typing import Literal
import json
import logging

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Iterable

from pydantic import BaseModel, Field, field_validator

from resopt_utils.utils import (
    timedelta_to_hhmmss,
    format_number,
)
from resopt_utils.parser import parse_datetime, parse_timedelta
from opt.models import OutputFile


class IntKPI(BaseModel):
    name: str = Field(..., description="Name of the KPI")
    value: int = Field(..., description="Value of the KPI")

    def diff(self, other: 'IntKPI') -> int:
        if self.name != other.name:
            raise ValueError("Cannot compute difference between KPIs with different names")
        return self.value - other.value


class FloatKPI(BaseModel):
    name: str = Field(..., description="Name of the KPI")
    value: float = Field(..., description="Value of the KPI")

    def diff(self, other: 'FloatKPI') -> int:
        if self.name != other.name:
            raise ValueError("Cannot compute difference between KPIs with different names")
        return self.value - other.value


class DatetimeKPI(BaseModel):
    name: str = Field(..., description="Name of the KPI")
    value: datetime = Field(..., description="Value of the KPI in ISO 8601 format")

    def diff(self, other: 'DatetimeKPI') -> timedelta:
        if self.name != other.name:
            raise ValueError("Cannot compute difference between KPIs with different names")
        return self.value - other.value

    @field_validator("value", mode='before')
    def validate_datetime(cls, v):
        return parse_datetime(v)


class TimedeltaKPI(BaseModel):
    name: str = Field(..., description="Name of the KPI")
    value: timedelta = Field(..., description="Value of the KPI in ISO 8601 duration format")

    def diff(self, other: 'TimedeltaKPI') -> timedelta:
        if self.name != other.name:
            raise ValueError("Cannot compute difference between KPIs with different names")
        return self.value - other.value

    @field_validator("value", mode='before')
    def validate_timedelta(cls, v):
        return parse_timedelta(v)


KPI = IntKPI | FloatKPI | DatetimeKPI | TimedeltaKPI
KPIValue = int | float | str | timedelta

logger = logging.getLogger(__name__)


class KPIs(BaseModel):
    time: datetime = Field(..., description="Timestamp of the KPI")
    num_unassigned: int = Field(..., description="Number of unassigned activities")
    num_assigned: int = Field(..., description="Number of assigned activities")
    cost: int = Field(..., description="Total cost")
    fuel_cost: int = Field(..., description="Total fuel cost")


class SolutionKPIs(BaseModel):
    solution_name: str = Field(..., description="Name of the KPI")
    kpis: KPIs = Field(..., description="KPIs for the solution")


def diff_values(value1: Any, value2: Any) -> Any:
    if type(value1) != type(value2):
        raise ValueError("Cannot compute difference between values of different types")
    if isinstance(value1, (int, float)):
        return value2 - value1
    elif isinstance(value1, datetime):
        return value2 - value1
    elif isinstance(value1, timedelta):
        return value2 - value1
    else:
        raise ValueError(f"Unsupported type for diff: type(value1={value1}) = {type(value1)}")


def value_to_string(value: Any) -> str:
    if isinstance(value, timedelta):
        return timedelta_to_hhmmss(value)
    elif isinstance(value, datetime):
        return value.isoformat()
    elif isinstance(value, (int, float)):
        return format_number(value)
    return str(value)


def get_sign(value: Any) -> str:
    if isinstance(value, (int, float)):
        if value > 0:
            return '+'
        return ''
    elif isinstance(value, timedelta):
        seconds = value.total_seconds()
        if seconds > 0:
            return '+'
        return ''
    return ''


def kpi_table(lst: list[SolutionKPIs]) -> dict[str, dict[str, KPIValue]]:
    table = defaultdict(dict)
    for solution_kpi in lst:
        sol_kpis = solution_kpi.kpis
        for name, value in sol_kpis.model_dump().items():
            table[name][solution_kpi.solution_name] = value
    for name, values_dict in table.items():
        for solution_name, value in values_dict.items():
            values_dict[solution_name] = value_to_string(value)
    return table


def kpi_table_from_output_files(output_files: Iterable[OutputFile]) -> dict[str, dict[str, KPIValue]]:
    solution_kpis_lst: list[SolutionKPIs] = output_files_to_solution_kpis(output_files)
    return kpi_table(solution_kpis_lst)


def output_files_to_solution_kpis(
    output_files: Iterable[OutputFile],
) -> list[SolutionKPIs]:
    solution_kpis_lst: list[SolutionKPIs] = []
    for output in output_files:
        logger.debug(f"output: {output}")
        data = json.loads(output.read_content())
        file_name = output.file.name.split('/')[-1]
        kpis = {
            'solution_name': file_name,
            'kpis': data['kpis'],
        }
        logger.debug(f"kpis: {kpis}")
        solution_kpi = SolutionKPIs(**kpis)
        solution_kpis_lst.append(solution_kpi)
        logger.debug(f"solution_kpi: {solution_kpi}")
    return solution_kpis_lst


def diff_kpis(lst: list[SolutionKPIs]) -> dict[str, dict[str, KPIValue]]:
    if len(lst) < 2:
        raise ValueError("At least two SolutionKPIs are required to compute differences")
    diffs = defaultdict(dict)
    for solution_kpi in lst:
        sol_kpis = solution_kpi.kpis
        for name, value in sol_kpis.model_dump().items():
            diffs[name][solution_kpi.solution_name] = value
    max_values_dict = {}
    logger.debug(f"diffs: {diffs}")
    for name, values_dict in diffs.items():
        max_values_dict[name] = max(values_dict.items(), key=lambda x: x[1])
    logger.debug(f"max_values_dict: {max_values_dict}")
    diff_dict = {}
    for (name, values_dict), (name_solution, max_value) in zip(diffs.items(), max_values_dict.values()):
        logger.debug(f"Computing differences for KPI '{name}' (max: {max_value})")
        diff_dict[name] = {}
        for solution_name, value in values_dict.items():
            if solution_name == name_solution or value == max_value:
                diff_dict[name][solution_name] = max_value
                continue
            diff_dict[name][solution_name] = diff_values(max_value, value)
    logger.debug(f"diff_dict: {diff_dict}")
    for name, values_dict in diff_dict.items():
        max_value = max_values_dict[name][1]
        for solution_name, value in values_dict.items():
            max_value_sol_name = max_values_dict[name][0]
            sign = ''
            percentage_str = ''
            if solution_name != max_value_sol_name and value != max_value:
                sign = get_sign(value)
                if isinstance(value, (int, float)) and max_value != 0:
                    percentage = abs((value / max_value) * 100)
                    percentage_str = f" ({sign}{percentage:.1f}%)"
                elif isinstance(value, timedelta) and not isinstance(max_value, datetime) and max_value.total_seconds() != 0:
                    percentage = abs((value.total_seconds() / max_value.total_seconds()) * 100)
                    percentage_str = f" ({percentage:.1f}%)"
            if percentage_str:
                values_dict[solution_name] = sign + value_to_string(value) + percentage_str
            else:
                values_dict[solution_name] = sign + value_to_string(value)
    logger.debug(f"diff_dict: {diff_dict}")
    return diff_dict


def diff_kpis_from_output_file(output_files: Iterable[OutputFile]) -> dict[str, dict[str, KPIValue]]:
    solution_kpis_lst: list[SolutionKPIs] = []
    solution_kpis_lst = output_files_to_solution_kpis(output_files)
    return diff_kpis(solution_kpis_lst)


if __name__ == '__main__':
    kpi_example = SolutionKPIs('''{
        "name": "solution_1",
        "values": [
            {
                "name": "execution_time",
                "value": "2:25"
            },
            {
                "name": "cost",
                "value": 123456
            },
            {
                "name": "time",
                "value": "2023-10-01T12:00:00Z"
            }
        ]
    }''')
