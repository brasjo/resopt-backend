from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Iterable, Literal
import json
import logging

from resopt_utils.utils import (
    timedelta_to_hhmmss,
    format_number,
)
from schemas.loader import get_kpis_class, get_solutionkpis_class, LATEST_VERSION
from schemas.kpi.base import SolutionKPIs
from opt.models import OutputFile


logger = logging.getLogger(__name__)

KPIValue = int | float | datetime | timedelta
Classification = Literal["good", "bad", "neutral"]


# KPIsV1 (and every other version) inherits `version` from the base `KPIs`
# model - it's schema metadata, not a KPI value, so it never becomes a row.
NON_KPI_FIELDS = {"version"}


def value_to_string(value: Any) -> str:
    if isinstance(value, timedelta):
        return timedelta_to_hhmmss(value)
    elif isinstance(value, datetime):
        return value.isoformat()
    elif isinstance(value, (int, float)):
        return format_number(value)
    return str(value)


@dataclass(frozen=True)
class KpiSpec:
    """Presentation metadata for one KPI field.

    Lives here rather than in resopt-schemas because it's a backend-only
    display concern (label, direction to color by) - the wire format
    (KPIsV1) itself is unchanged. `more_is_good=None` marks a field as
    non-directional (e.g. a timestamp), which excludes it from comparison
    and coloring.
    """
    name: str
    label: str
    more_is_good: bool | None


# One entry per KPIsV1 field. A field with no entry here (e.g. a future
# optimizer-added KPI on a newer version) falls back to a neutral,
# non-directional spec via get_kpi_spec() rather than raising.
KPI_SPECS: dict[str, KpiSpec] = {
    "time": KpiSpec("time", "Time", more_is_good=None),
    "num_unassigned": KpiSpec("num_unassigned", "Unassigned", more_is_good=False),
    "num_assigned": KpiSpec("num_assigned", "Assigned", more_is_good=True),
    "cost": KpiSpec("cost", "Cost", more_is_good=False),
    "fuel_cost": KpiSpec("fuel_cost", "Fuel Cost", more_is_good=False),
}


def get_kpi_spec(name: str) -> KpiSpec:
    return KPI_SPECS.get(name, KpiSpec(name, name, more_is_good=None))


@dataclass(frozen=True)
class KpiCell:
    """One table cell. Carries the server-computed absolute value/coloring,
    plus the raw fields the client-side diff toggle
    (opt/static/opt/js/kpis_table.js) needs to recompute a diff against a
    solution the user clicks, without a round-trip to the server.
    """
    text: str
    classification: Classification
    raw_value: int | float | None
    more_is_good: bool | None

    @property
    def css_class(self) -> str:
        return f"kpi-{self.classification}"

    @property
    def raw_value_attr(self) -> str:
        return '' if self.raw_value is None else str(self.raw_value)

    @property
    def more_is_good_attr(self) -> str:
        if self.more_is_good is None:
            return ''
        return 'true' if self.more_is_good else 'false'


@dataclass
class KpiRow:
    spec: KpiSpec
    raw_values: "OrderedDict[str, KPIValue]"  # solution_name -> raw value, in solution order

    @property
    def name(self) -> str:
        return self.spec.name

    @property
    def label(self) -> str:
        return self.spec.label

    def reference_value(self) -> KPIValue | None:
        """The best value in this row, or None if the KPI isn't directional
        or there's nothing to compare (fewer than two solutions)."""
        if self.spec.more_is_good is None or len(self.raw_values) < 2:
            return None
        values = self.raw_values.values()
        return max(values) if self.spec.more_is_good else min(values)

    def classify(self, solution_name: str) -> Classification:
        reference = self.reference_value()
        if reference is None:
            return "neutral"
        return "good" if self.raw_values[solution_name] == reference else "bad"

    def cell(self, solution_name: str) -> KpiCell:
        value = self.raw_values[solution_name]
        is_numeric = isinstance(value, (int, float)) and not isinstance(value, bool)
        return KpiCell(
            text=value_to_string(value),
            classification=self.classify(solution_name),
            raw_value=value if is_numeric else None,
            more_is_good=self.spec.more_is_good,
        )


@dataclass
class KpiTable:
    solution_names: list[str]
    rows: list[KpiRow] = field(default_factory=list)

    @classmethod
    def from_solution_kpis(cls, solution_kpis_lst: list[SolutionKPIs]) -> "KpiTable":
        solution_names = [sk.solution_name for sk in solution_kpis_lst]
        field_names = [
            name for name in (solution_kpis_lst[0].kpis.model_dump().keys() if solution_kpis_lst else [])
            if name not in NON_KPI_FIELDS
        ]
        rows = []
        for name in field_names:
            raw_values = OrderedDict(
                (sk.solution_name, getattr(sk.kpis, name)) for sk in solution_kpis_lst
            )
            rows.append(KpiRow(spec=get_kpi_spec(name), raw_values=raw_values))
        return cls(solution_names=solution_names, rows=rows)

    @classmethod
    def from_output_files(cls, output_files: Iterable[OutputFile]) -> "KpiTable":
        return cls.from_solution_kpis(output_files_to_solution_kpis(output_files))

    def as_table_rows(self) -> list[list]:
        return [
            [row.label] + [row.cell(name) for name in self.solution_names]
            for row in self.rows
        ]


def solution_kpis_from_json(content: dict, solution_name: str) -> SolutionKPIs:
    version = content.get('version', LATEST_VERSION)
    kpis_cls = get_kpis_class(version)
    solution_kpis_cls = get_solutionkpis_class(version)
    return solution_kpis_cls(
        solution_name=solution_name,
        kpis=kpis_cls(**content['kpis']),
    )


def output_files_to_solution_kpis(
    output_files: Iterable[OutputFile],
) -> list[SolutionKPIs]:
    solution_kpis_lst: list[SolutionKPIs] = []
    for output in output_files:
        logger.debug(f"output: {output}")
        content = json.loads(output.read_content())
        file_name = output.file.name.split('/')[-1]
        solution_kpi = solution_kpis_from_json(content, file_name)
        solution_kpis_lst.append(solution_kpi)
        logger.debug(f"solution_kpi: {solution_kpi}")
    return solution_kpis_lst
