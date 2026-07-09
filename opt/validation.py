import datetime
import json
from collections import defaultdict

from .models import OptimizationScenario


def validate_periods(period_start: datetime, period_end: datetime) -> list[str]:
    if not period_start or not period_end:
        return [
            "OptimizationScenario must have period_start and period_end set. To set them, "
            "either provide them directly in the OptimizationScenario or ensure they are "
            "defined in the input file metadata."
        ]
    return []


def validate_last_known_station(
    aircrafts: list[Aircraft],
    flights: list[Flight],
    period_start: datetime,
) -> list[str]:
    chains = defaultdict(list)
    for flight in flights:
        chains[flight.aircraft_id or "unassigned"].append(flight)
    errors = []
    for ac in aircrafts:
        if ac.last_known_station:
            continue
        chain = chains.get(ac.id, [])
        if not chain:
            errors.append(f"Aircraft '{ac.id}' has no flights assigned and no last_known_station set.")
            continue
        flight_prior_to_period = find_flight_prior_to_period(chain, period_start)
        if not flight_prior_to_period:
            errors.append(
                f"Aircraft '{ac.id}' has no flights prior to the period start {period_start.isoformat()} "
                "and no last_known_station set."
            )
            continue
    return errors


def find_flight_prior_to_period(chain: list[Flight], period_start: datetime) -> Flight | None:
    chains_sorted = sorted(chain, key=lambda f: f.start)
    prev_flight = None
    current_flight = None
    for flight in chains_sorted:
        if flight.start < period_start:
            if period_start <= flight.end:
                return flight
            prev_flight = flight
            continue
        if prev_flight:
            return prev_flight
    return None


def validate_ac_available_from(
    aircrafts: list[Aircraft],
    flights: list[Flight],
) -> list[str]:
    aircrafts_dict = {ac.id: ac for ac in aircrafts}
    chains = defaultdict(list)
    for flight in flights:
        chains[flight.aircraft_id or "unassigned"].append(flight)
    errors = []
    for id, ac in aircrafts_dict.items():
        if ac.available_from:
            continue
        chain = chains.get(id, [])
        if not chain:
            errors.append(f"Aircraft '{id}' has no flights assigned and no available_from set.")
            continue
    return errors

def validate_input_builder(input_builder: InputFileBuilder) -> list[str]:
    return input_builder.validate_for_optimization() or []


def validate_OptimizationScenario(run: OptimizationScenario) -> list[str]:
    with run.input_builder.open() as file:
        input_builder_data = json.load(file)
    input_builder = InputFileBuilder(**input_builder_data)
    input_builder_errors = input_builder.validate_for_optimization()
    if input_builder_errors:
        return input_builder_errors
    period_errors = validate_periods(
        run.get_period_start(),
        run.get_period_end(),
    )
    if period_errors:
        return period_errors
    ac_available_from_errors = validate_ac_available_from(
        input_builder.aircrafts, input_builder.flights
    )
    if ac_available_from_errors:
        return ac_available_from_errors
    return []