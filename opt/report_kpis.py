"""Derived KPI report for the Gantt visualizer (GitHub issue ResOpt#55).

Unlike `opt/kpi.py` (which surfaces whatever `kpis` the optimizer already
wrote into a solution file, verbatim), this module computes a second set of
metrics - aircraft utilization, turn-time evenness, and re-fleeting count -
from data that already exists but isn't pre-aggregated anywhere: the
solution's `assignments` (resolved aircraft + flights) plus the scenario's
own maintenances and scheduling period. `num_unassigned` is the one
exception - it's read straight from the solution's own `kpis`, not
recomputed.

Deliberately does not touch `resopt-optimizer` - everything here reads
`resopt-schemas` data contracts that are already produced today.
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import mean, pstdev
from typing import Iterable

from schemas.activities.v1 import MaintenanceV1
from schemas.loader import get_output_file_class
from schemas.resources.v1 import AircraftV1


@dataclass(frozen=True)
class ReportKpis:
    aircraft_utilization: float | None
    turn_time_cv: float | None
    num_unassigned: int
    num_refleeted: int

    def as_dict(self) -> dict:
        return {
            "aircraft_utilization": self.aircraft_utilization,
            "turn_time_cv": self.turn_time_cv,
            "num_unassigned": self.num_unassigned,
            "num_refleeted": self.num_refleeted,
        }


def _overlap(start: datetime, end: datetime, period_start: datetime, period_end: datetime) -> timedelta:
    """The portion of [start, end) that falls within [period_start, period_end)."""
    clipped_start = max(start, period_start)
    clipped_end = min(end, period_end)
    if clipped_end <= clipped_start:
        return timedelta(0)
    return clipped_end - clipped_start


def _aircraft_key(aircraft_id) -> str:
    # AircraftV1.id and MaintenanceV1.aircraft_id are both `str | int` and
    # not guaranteed to agree on type for the same aircraft (e.g. "5" vs
    # 5) - normalize to str for joining the two.
    return str(aircraft_id)


def compute_report_kpis(
    output_content: dict,
    maintenances: Iterable[MaintenanceV1],
    period_start: datetime,
    period_end: datetime,
) -> ReportKpis:
    """Compute the report KPIs for one solution.

    `output_content` is the parsed JSON of a solution file (an
    `OutputFileV1`-shaped dict, version-dispatched via `schemas.loader`).
    `maintenances` is the scenario's own maintenance list (not part of the
    solution output - `AssignmentsV1.activities` only ever contains
    flights).
    """
    version = output_content.get("version", "v1")
    output_cls = get_output_file_class(version)
    output = output_cls(**output_content)

    num_unassigned = output.kpis.num_unassigned

    maintenances_by_aircraft: dict[str, list[MaintenanceV1]] = defaultdict(list)
    for maintenance in maintenances:
        maintenances_by_aircraft[_aircraft_key(maintenance.aircraft_id)].append(maintenance)

    total_block_time = timedelta(0)
    turn_times: list[timedelta] = []
    num_refleeted = 0
    aircraft_with_overlap: set[str] = set()

    for assignment in output.assignments:
        resource = assignment.resource
        if not isinstance(resource, AircraftV1):
            continue  # the "unassigned" bucket - resource is a plain str there

        aircraft_key = _aircraft_key(resource.id)
        flights = sorted(assignment.activities, key=lambda f: f.start)

        for flight in flights:
            overlap = _overlap(flight.start, flight.end, period_start, period_end)
            if overlap > timedelta(0):
                total_block_time += overlap
                aircraft_with_overlap.add(aircraft_key)
            # `resource.type`/`flight.planned_actype` are required, non-blank
            # fields (CustomFieldsMixin.__init__ strips any "" value before
            # pydantic even sees it, so construction fails outright for a
            # blank one) - the truthiness check is defense-in-depth only,
            # not a reachable case with today's schema.
            if (
                resource.type
                and flight.planned_actype
                and flight.planned_actype != resource.type
            ):
                num_refleeted += 1

        for prev_flight, next_flight in zip(flights, flights[1:]):
            gap = next_flight.start - prev_flight.end
            if gap > timedelta(0):
                turn_times.append(gap)

        aircraft_maintenance_overlap = sum(
            (
                _overlap(m.start, m.end, period_start, period_end)
                for m in maintenances_by_aircraft.get(aircraft_key, [])
            ),
            timedelta(0),
        )
        if aircraft_maintenance_overlap > timedelta(0):
            aircraft_with_overlap.add(aircraft_key)

    period_duration = max(period_end - period_start, timedelta(0))
    total_available_time = timedelta(0)
    for aircraft_key in aircraft_with_overlap:
        maintenance_overlap = sum(
            (
                _overlap(m.start, m.end, period_start, period_end)
                for m in maintenances_by_aircraft.get(aircraft_key, [])
            ),
            timedelta(0),
        )
        total_available_time += max(period_duration - maintenance_overlap, timedelta(0))

    aircraft_utilization = (
        total_block_time / total_available_time
        if total_available_time > timedelta(0)
        else None
    )

    turn_time_cv = None
    if len(turn_times) >= 2:
        seconds = [t.total_seconds() for t in turn_times]
        avg = mean(seconds)
        if avg > 0:
            turn_time_cv = pstdev(seconds) / avg

    return ReportKpis(
        aircraft_utilization=aircraft_utilization,
        turn_time_cv=turn_time_cv,
        num_unassigned=num_unassigned,
        num_refleeted=num_refleeted,
    )
