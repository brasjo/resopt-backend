import logging
from dataclasses import dataclass, field
from datetime import timedelta, datetime

from .models import OptimizationScenario
from .validation_models_int import InputFile
from schemas.loader import get_opt_input_file_class
from schemas.base import PositiveTimedeltaEntry
from schemas.optinput.base import InputBuilder
from schemas.activities.base import Activity
from utils import format_update_message


logger = logging.getLogger('preprocess')
DATETIME_STR_FORMAT = '%Y-%m-%dT%H:%M'


@dataclass
class PreprocessingContext:
    builder: InputBuilder
    error_messages: list[str] = field(default_factory=list)
    info_messages: list[str] = field(default_factory=list)
    debug_messages: list[str] = field(default_factory=list)

    def add_error(self, message: str) -> None:
        """Add an error message."""
        self.error_messages.append(message)

    def add_info(self, message: str) -> None:
        """Add an info message."""
        self.info_messages.append(message)

    def add_debug(self, message: str) -> None:
        """Add a debug message."""
        self.debug_messages.append(message)

    def has_errors(self) -> bool:
        """Check if there are any errors."""
        return bool(self.error_messages)

    def get_summary(self) -> str:
        """Get a summary of the messages."""
        error_count = len(self.error_messages)
        info_count = len(self.info_messages)
        debug_count = len(self.debug_messages)

        return f"Errors: {error_count}, Info: {info_count}, Debug: {debug_count}"

    def print_summary(self) -> None:
        """Print a summary of the messages."""
        print(self.get_summary())

        if self.error_messages:
            print("\nErrors:")
            for error in self.error_messages:
                print(f"- {error}")

        if self.info_messages:
            print("\nInfos:")
            for info in self.info_messages:
                print(f"- {info}")

        if self.debug_messages:
            print("\nDebugs:")
            for debug in self.debug_messages:
                print(f"- {debug}")

    def __str__(self) -> str:
        """Return a string representation of the preprocess result."""
        return self.get_summary()


def preprocess_builder(
    builder: InputBuilder,
    period_start: datetime = None,
    period_end: datetime = None,
) -> PreprocessingContext:
    logger.debug(f"Preprocessing builder {builder}...")
    context = PreprocessingContext(builder=builder)
    set_meta_period(context, period_start, period_end)
    set_aircraft_last_known_station_and_available_from(context)
    set_aircraft_min_turn_time(context)
    set_ids(context)
    return context


def set_meta_period(
    context: PreprocessingContext,
    period_start: datetime = None,
    period_end: datetime = None,
) -> None:
    builder = context.builder
    old_period_start = builder.meta.period_start
    old_period_end = builder.meta.period_end
    logger.debug(f"Setting meta period for builder {builder}...")
    if period_start and period_end:
        builder.meta.period_start = period_start
        builder.meta.period_end = period_end
        msg = format_update_message(
            entity="Meta",
            changes={
                "period_start": (old_period_start, builder.meta.period_start),
                "period_end": (old_period_end, builder.meta.period_end),
            },
            source="function arguments",
        )
        context.add_info(msg)
        return None
    if builder.meta.period_start and builder.meta.period_end:
        msg = (
            "Meta period already set "
            f"[{builder.meta.period_start}, {builder.meta.period_end}]."
        )
        context.add_info(msg)
        return None
    period_start = min(builder.flights, key=lambda f: f.start).start
    period_end = max(builder.flights, key=lambda f: f.end).end
    builder.meta.period_start = period_start
    builder.meta.period_end = period_end
    msg = format_update_message(
        entity="Meta",
        changes={
            "period_start": (old_period_start, period_start),
            "period_end": (old_period_end, period_end),
        },
        source="activities",
    )
    context.add_info(msg)


def get_custom_min_turn_time_map(
    turn_times: list[PositiveTimedeltaEntry],
) -> dict[str, timedelta]:
    return {
        entry.param.replace('min_turn_time_', ''): entry.time_delta
        for entry in turn_times
    }


def set_aircraft_min_turn_time(context: PreprocessingContext) -> None:
    builder = context.builder
    default_min_turn_time = builder.parameters.default_min_turn_time
    min_turn_times = get_custom_min_turn_time_map(
        builder.parameters.custom_min_turn_times
    )
    for ac in builder.aircrafts:
        old_min_turn_time = ac.min_turn_time
        if ac.min_turn_time is not None:
            logger.debug(f"Aircraft {ac.id} has specific min_turn_time {ac.min_turn_time}, skipping...")
            continue
        custom_min_turn_time = min_turn_times.get(ac.type)
        if custom_min_turn_time:
            ac.min_turn_time = custom_min_turn_time
            msg = format_update_message(
                entity=f"Aircraft {ac.id}",
                changes={
                    "min_turn_time": (old_min_turn_time, custom_min_turn_time),
                },
                source=f"type {ac.type}",
            )
            context.add_debug(msg)
            logger.debug(msg)
            continue
        ac.min_turn_time = default_min_turn_time
        msg = format_update_message(
            entity=f"Aircraft {ac.id}",
            changes={
                "min_turn_time": (old_min_turn_time, default_min_turn_time),
            },
            source="default_min_turn_time",
        )
        context.add_debug(msg)
        logger.debug(msg)


def find_aircraft_last_known_station_and_availale_from(
    flights: list[Activity],
    period_start: datetime,
) -> tuple[str | None, datetime] | None:
    if not flights:
        return (None, period_start)
    flights = sorted(flights, key=lambda f: f.start)
    current_flight = None
    for fl in flights:
        if fl.start >= period_start:
            if not current_flight:
                return (fl.adep, period_start)
            break
        current_flight = fl
    if not current_flight:
        return (None, period_start)
    end = current_flight.end if current_flight.end > period_start else period_start
    return (current_flight.ades, end)


def set_aircraft_last_known_station_and_available_from(
    context: PreprocessingContext,
) -> None:
    builder = context.builder
    logger.debug(f"Setting aircraft last_known_station and available_from for builder {builder}...")
    ac2flights = {ac.id: [] for ac in builder.aircrafts}
    period_start = builder.meta.period_start
    for fl in builder.flights:
        if fl.aircraft_id:
            ac2flights[fl.aircraft_id].append(fl)
    for ac in builder.aircrafts:
        old_last_known_station = ac.last_known_station
        old_available_from = ac.available_from
        if old_available_from and old_last_known_station:
            msg = (
                f"Aircraft {ac.id} already has last_known_station "
                f"{old_last_known_station} and available_from {old_available_from}, skipping..."
            )
            context.add_debug(msg)
            continue
        flights = ac2flights.get(ac.id, [])
        tup = find_aircraft_last_known_station_and_availale_from(
            flights,
            period_start,
        )
        last_known_station = tup[0] or old_last_known_station
        available_from = tup[1]
        if not last_known_station:
            msg = (
                f"Aircraft {ac.id} has no flights assigned prior to period_start "
                f"{period_start}, cannot set last_known_station."
            )
            logger.error(msg)
            context.add_error(msg)
            continue
        ac.last_known_station, ac.available_from = last_known_station, available_from
        msg = format_update_message(
            entity=f"Aircraft {ac.id}",
            changes={
                "last_known_station": (old_last_known_station, ac.last_known_station),
                "available_from": (old_available_from, ac.available_from),
            },
            source="activities",

        )
        context.add_debug(msg)


def set_ids(context: PreprocessingContext) -> None:
    set_flight_ids(context)
    set_maintenance_ids(context)
    set_aircraft_ids(context)


def set_flight_ids(context: PreprocessingContext) -> None:
    builder = context.builder
    if not builder.flights:
        return
    old_id_aircraft_map = {ac.id: ac for ac in builder.aircrafts if ac.id}
    aircraft_id_map = {
        ac: id for id, ac in builder.generate_resource_ids(builder.aircrafts).items()
    }
    first_flight = builder.flights[0]
    flight_id_map = type(first_flight).generate_ids(builder.flights)
    for id, fl in flight_id_map.items():
        old_id = fl.id
        fl.id = id
        msg = format_update_message(
            entity=f"Flight {fl.id}",
            changes={
                "id": (old_id, fl.id),
            }
        )
        context.add_debug(msg)
        if fl.aircraft_id:
            old_ac_id = fl.aircraft_id
            fl.aircraft_id = aircraft_id_map[old_id_aircraft_map[fl.aircraft_id]]
            msg = format_update_message(
                entity=f"Flight {fl.id}",
                changes={
                    "aircraft_id": (old_ac_id, fl.aircraft_id),
                }
            )
            context.add_debug(msg)


def set_aircraft_ids(context: PreprocessingContext) -> None:
    builder = context.builder
    aircraft_id_map = {
        ac: id for id, ac in builder.generate_resource_ids(builder.aircrafts).items()
    }
    for ac, id in aircraft_id_map.items():
        old_id = ac.id
        ac.id = id
        msg = format_update_message(
            entity=f"Aircraft {ac.id}",
            changes={
                "id": (old_id, ac.id),
            }
        )
        context.add_debug(msg)


def set_maintenance_ids(context: PreprocessingContext) -> None:
    builder = context.builder
    if not builder.maintenances:
        return
    old_id_aircraft_map = {
        ac.id: ac for ac in builder.aircrafts if ac.id is not None
    }
    for ac in builder.aircrafts:
        print('aircraft:', ac.id, type(ac.id))
    print('old_id_aircraft_map:', type(old_id_aircraft_map), old_id_aircraft_map.keys())

    id_aircraft_map = builder.generate_resource_ids(builder.aircrafts)
    aircraft_id_map = {
        ac: id for id, ac in id_aircraft_map.items()
    }
    maint_id_map = builder.generate_activity_ids(builder.maintenances)
    for ix, (id, m) in enumerate(maint_id_map.items()):
        old_id = m.id
        old_ac_id = m.aircraft_id
        m.id = id
        old_ac_id
        old_ac = old_id_aircraft_map.get(old_ac_id)
        if not old_ac:
            msg = (
                f"Maintenance with id '{m.id}' references unknown aircraft_id {old_ac_id}, "
                "cannot update aircraft_id."
            )
            context.add_error(msg)
            continue
        ac_id = aircraft_id_map.get(old_ac)
        if ac_id is None:
            msg = (
                f"Maintenance {m.id} references aircraft_id {old_ac_id} "
                f"which has no new ID assigned, cannot update aircraft_id."
            )
            logger.error(msg)
            context.add_error(msg)
            continue
        m.aircraft_id = aircraft_id_map[old_ac]
        msg = format_update_message(
            entity=f"Maintenance {m.id}",
            changes={
                "id": (old_id, m.id),
                "aircraft_id": (old_ac_id, m.aircraft_id),
            }
        )
        context.add_debug(msg)


@dataclass
class PreprocessResult:
    input_file: InputFile | None
    error_messages: list[str] = field(default_factory=list)
    debug_messages: list[str] = field(default_factory=list)
    info_messages: list[str] = field(default_factory=list)

    def add_error(self, message: str) -> None:
        """Add an error message."""
        self.error_messages.append(message)


def generate_input_file(
    builder: InputBuilder,
    scenario: OptimizationScenario,
) -> PreprocessResult:

    # Preprocess builder and get context
    preprocessing_context = preprocess_builder(
        builder,
        scenario.period_start,
        scenario.period_end
    )
    # preprocessing_context.print_summary()

    # Prepare the base PreprocessResult
    result = PreprocessResult(
        input_file=None,
        error_messages=preprocessing_context.error_messages,
        debug_messages=preprocessing_context.debug_messages,
        info_messages=preprocessing_context.info_messages,
    )
    opt_input_file_class = get_opt_input_file_class(scenario.builder_version)
    print('Dumping input fiel')
    try:
        # Attempt to create InputFile from the builder
        input_file = opt_input_file_class(
            **builder.model_dump(exclude_none=True)
        )
        result.input_file = input_file  # Update result if successful
    except Exception as e:
        # Handle error if InputFile creation fails
        error_msg = f"Error creating InputFile from builder: {e}"
        result.add_error(error_msg)
        logger.error(error_msg)

    return result
