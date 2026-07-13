from typing import Iterable, Optional, Any
from datetime import datetime, timedelta

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from resopt_utils.utils import timedelta_to_hhmm
from resopt_utils.parser import parse_datetime, parse_timedelta

from schemas.standalone import PositiveTimedeltaEntry


class Maintenance(BaseModel):
    id: Optional[str] = Field(None, title="Maintenance ID")
    aircraft_id: str = Field(..., description="The ID of the aircraft")
    type: str = Field(..., description="Type of maintenance, e.g ('CK-A', 'CK-C')")
    start: datetime = Field(..., description="Start date and time of the maintenance")
    end: datetime = Field(..., description="End date and time of the maintenance")
    station: str = Field(..., description="Station where the maintenance is performed")

    def default(cls, data: dict = None) -> 'Maintenance':
        data = data or {}
        return cls(
            id=data.get("id", "1"),
            aircraft_id=data.get("aircraft_id", "AC123"),
            type=data.get("type", "CK-A"),
            start=data.get("start", datetime(2023, 10, 1, 10, 0)),
            end=data.get("end", datetime(2023, 10, 1, 12, 0)),
            station=data.get("station", "JFK"),
        )

    @field_validator("start", mode='before')
    def parse_start(cls, v: str | datetime) -> datetime:
        try:
            return parse_datetime(v)
        except ValueError as e:
            raise ValueError(f"Error parsing Maintenance start: {e}.")

    @field_validator("end", mode='before')
    def parse_end(cls, v: str | datetime) -> datetime:
        try:
            return parse_datetime(v)
        except ValueError as e:
            raise ValueError(f"Error parsing Maintenance end: {e}.")

    @model_validator(mode='after')
    def check_start_before_end(self) -> 'Maintenance':
        if self.start >= self.end:
            raise ValueError("Maintenance start time must be before end time")
        return self

    def plural(self) -> str:
        return "maintenances"


class Flight(BaseModel):
    id: Optional[str] = Field(None, title="Flight ID")
    adep: str = Field(..., title="Departure Airport")
    ades: str = Field(..., title="Arrival Airport")
    start: datetime = Field(..., title="Start Time")
    end: datetime = Field(..., title="End Time")

    # Optional fields with supporting logic
    fl_num: Optional[int] = Field(None, title="Flight Number")
    ac_type: Optional[str] = Field(None, title="Planned Aircraft Type")
    aircraft_id: Optional[str] = Field(None, title="Resource ID")
    rotation_id: Optional[str] = Field(None, title="Rotation ID")
    seqnum: Optional[int] = Field(0, title="Sequence Number")
    multileg_id: Optional[str] = Field(None, title="Multileg ID")

    custom_fields: dict[str, Any] = Field(
        default_factory=dict,
        title="Custom Fields",
        description="Additional custom fields for the flight"
    )

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

    @model_validator(mode='after')
    def check_start_before_end(self) -> 'Flight':
        if self.start >= self.end:
            raise ValueError("Flight start time must be before end time")
        return self

    def plural(self) -> str:
        return "flights"

    @classmethod
    def default(cls, data: dict = None) -> 'Flight':
        data = data or {}
        return cls(
            id=data.get("id", "1"),
            adep=data.get("adep", "JFK"),
            ades=data.get("ades", "LAX"),
            start=data.get("start", datetime(2023, 1, 1, 12, 0)),
            end=data.get("end", datetime(2023, 1, 1, 15, 0)),
            fl_num=data.get("fl_num", 100),
            ac_type=data.get("ac_type", "737"),
            aircraft_id=data.get("aircraft_id", None),
            rotation_id=data.get("rotation_id", None),
            seqnum=data.get("seqnum", 0),
            multileg_id=data.get("multileg_id", None),
            custom_fields=data.get("custom_fields", {})
        )


class Metadata(BaseModel):
    period_start: Optional[datetime] = Field(
        None,
        title="Period Start Date in UTC ISO 8601 format, e.g '2023-01-01T00:00Z'"
    )
    period_end: Optional[datetime] = Field(
        None,
        title="Period End Date in UTC ISO 8601 format, e.g '2023-01-31T23:59Z'"
    )

    @field_validator("period_start", mode='before')
    def parse_period_start(cls, v: str | datetime) -> datetime | None:
        try:
            return parse_datetime(v)
        except ValueError as e:
            raise ValueError(f"Error parsing Metadata period_start: {e}.")

    @field_validator("period_end", mode='before')
    def parse_period_end(cls, v: str | datetime) -> datetime | None:
        try:
            return parse_datetime(v)
        except ValueError as e:
            raise ValueError(f"Error parsing Metadata period_end: {e}.")

    @model_validator(mode='after')
    def check_start_before_end(self) -> 'Metadata':
        if not self.period_start or not self.period_end:
            return self
        if self.period_start >= self.period_end:
            raise ValueError("Metadata period_start must be before period_end")
        return self


class Aircraft(BaseModel):
    id: Optional[str] = Field(None, title="Aircraft ID")
    type: str = Field(..., title="Aircraft Type")
    regno: str = Field(..., title="Aircraft Registration")
    service_start: datetime = Field(..., title="Service Start Date")
    service_end: Optional[datetime] = Field(None, title="Service End Date")
    burn_bias: Optional[float] = Field(1.0, title="Burn Bias")
    min_turn_time: Optional[timedelta] = Field(
        None,
        title="Minimum Turn Time",
        description="Minimum turn time for this aircraft type in HH:MM format"
    )
    available_from: Optional[datetime] = Field(
        None,
        title="Available From",
        description="Date and time when the aircraft becomes available for flights"
    )
    last_known_station: Optional[str] = Field(
        None,
        title="Last Known Station",
        description="Last known station of the aircraft, e.g. 'LAX'"
    )

    class Config:
        json_encoders = {
            timedelta: timedelta_to_hhmm
        }
        extra = 'allow'

    @field_validator("min_turn_time", mode='before')
    def parse_timedelta(cls, v: str | timedelta) -> timedelta:
        try:
            return parse_timedelta(v)
        except ValueError as e:
            raise ValueError(f"Error parsing Aircraft min_turn_time: {e}.")

    @field_validator("service_end", mode='before')
    def parse_period_end(cls, v: str | datetime) -> datetime:
        try:
            return parse_datetime(v)
        except ValueError as e:
            raise ValueError(f"Error parsing Aircraft service_end: {e}.")

    @field_validator("service_start", mode='before')
    def parse_period_start(cls, v: str | datetime) -> datetime:
        try:
            return parse_datetime(v)
        except ValueError as e:
            raise ValueError(f"Error parsing Aircraft service_start: {e}.")

    @model_validator(mode='after')
    def check_service_start_before_service_end(self) -> 'Metadata':
        if not self.service_start or not self.service_end:
            return self
        if self.service_start >= self.service_end:
            raise ValueError("Aircraft service_start must be before service_end")
        return self

    def plural(self) -> str:
        return "aircrafts"

    @classmethod
    def default(cls, data: dict = None) -> 'Aircraft':
        data = data or {}
        return cls(
            id=data.get('id', "AAAAA"),
            type=data.get('type', "DefaultType"),
            regno=data.get('regno', "DefaultReg"),
            service_start=data.get('service_start', datetime(2020, 1, 1, 0, 0)),
            service_end=data.get('service_end', None),
            burn_bias=data.get('burn_bias', 1.0),
            min_turn_time=data.get('min_turn_time', None),
            available_from=data.get('available_from', None),
            last_known_station=data.get('last_known_station', None),
        )


def validate_ids(items: Iterable[dict]) -> list[str]:
    """All items must include an 'id' field that is unique or all must not.
    Returns a list of error messages if any validation fails.
    """
    if not items:
        return []
    errors = []
    ids = {}
    no_ids = []
    for item in items:
        if 'id' not in item:
            no_ids.append(item)
            continue
        id_ = item['id']
        if id_ in ids:
            errors.append(f"Duplicate 'id' found: {id_} in {item} and {ids[id_]}")
            continue
        ids[id_] = item
    if len(ids) > 0 and len(no_ids) > 0:
        for item in no_ids:
            errors.append(f"No 'id' field found in {item}.")
    return errors


class Parameters(BaseModel):
    use_min_turn_time_rule: bool = Field(
        True,
        title="Use Minimum Turn Time Rule",
        description="If True, the minimum turn time rule is applied to flights."
    )
    min_turn_time: timedelta = Field(
        timedelta(hours=1),
        title="Minimum Turn Time",
        description="The minimum turn time between flights in hours and minutes."
    )
    custom_min_turn_times: list[PositiveTimedeltaEntry] = Field(
        default_factory=list,
        title="Custom Minimum Turn Times",
        description="Custom minimum turn times for specific aircraft types or other criteria.",
    )
    use_max_turn_time_rule: bool = Field(
        True,
        title="Use Maximum Turn Time Rule",
        description="If True, the maximum turn time rule is applied to flights."
    )
    max_turn_time: timedelta = Field(
        timedelta(hours=2),
        title="Maximum Turn Time",
        description="The maximum turn time between flights in hours and minutes."
    )
    custom_max_turn_times: list[PositiveTimedeltaEntry] = Field(
        default_factory=list,
        title="Custom Maximum Turn Times",
        description="Custom maximum turn times for specific aircraft types or other criteria."
    )
    max_turn_time_penalty_per_minute: int = Field(
        0,
        title="Max Turn Time Penalty Per Minute",
        description="The penalty applied for each minute over the maximum turn time."
    )
    use_pax_penalty: bool = Field(
        True,
        title="Use Passenger Penalty",
        description="If True, the passenger penalty is applied to flights."
    )
    use_fuel_penalty: bool = Field(
        True,
        title="Use Fuel Penalty",
        description="If True, the fuel penalty is applied to flights."
    )
    fuel_penalty_per_kg: int = Field(
        0,
        title="Fuel Penalty Per KG",
        description="The fuel penalty applied per kilogram of fuel."
    )
    pax_penalty_per_seat_difference: int = Field(
        0,
        title="Pax Penalty Per Seat Difference",
        description="The penalty applied per seat difference for passengers."
    )
    allow_refleeting_with_penalty: bool = Field(
        True,
        title="Allow Refleeting With Penalty",
        description="If True, refleeting is allowed with a penalty."
    )
    penalty_per_refleet: int = Field(
        0,
        title="Penalty Per Refleet",
        description="The penalty applied for each refleeting action."
    )
    reoptimize_solution: bool = Field(
        False,
        title="Reoptimize already assigned solution",
        description="If True, reoptimizing with least changes from the original."
    )

    model_config = ConfigDict(
        json_encoders={
            timedelta: timedelta_to_hhmm
        },
        extra='allow',
    )

    @model_validator(mode='after')
    def check_custom_min_turn_times(self) -> 'Parameters':
        for entry in self.custom_min_turn_times:
            if not entry.param.startswith('min_turn_time_'):
                raise ValueError(
                    f"Custom min turn time parameter '{entry.param}' must start with 'min_turn_time_'."
                )
        return self

    @model_validator(mode='before')
    @classmethod
    def extract_prefixed_fields(cls, values: dict[str, Any]):
        prefix = 'min_turn_time_'
        min_turn_time_fields = {
            k: v for k, v in values.items() if k.startswith(prefix)
        }
        values['custom_min_turn_times'] = values.get('custom_min_turn_times', [])
        for k, v in min_turn_time_fields.items():
            values['custom_min_turn_times'].append(PositiveTimedeltaEntry(
                param=k,
                time_delta=v
            ))
            values.pop(k)
        for k in values:
            if k in cls.model_fields or k in min_turn_time_fields:
                continue
            raise ValueError(f"Unexpected field '{k}' in Parameters model.")
        return values

    @field_validator("min_turn_time", mode='before')
    def parse_timedelta(cls, v: str | timedelta) -> timedelta:
        return parse_timedelta(v)


class InputFile(BaseModel):
    aircrafts: list[Aircraft] = Field(default_factory=list, title="List of Aircraft")
    flights: list[Flight] = Field(default_factory=list, title="List of Flights")
    maintenances: list[Maintenance] = Field(default_factory=list, title="List of Maintenances")
    parameters: Parameters = Field(default_factory=Parameters, title="Parameters")
    metadata: Metadata = Field(default_factory=Metadata, title="Metadata")

    def plural(self) -> str:
        return "input files"

    @model_validator(mode='after')
    def _post_process_all(self) -> 'InputFile':
        self._validate_flight_ids()
        self._validate_maintenance_ids()
        self._validate_aircraft_ids()
        self._generate_ids()
        self._validate_flight_aircraft_relation()
        self._validate_maintenance_aircraft_relation()
        return self

    def _generate_ids(self) -> None:
        for i, ac in enumerate(self.aircrafts, 1):
            if not ac.id:
                ac.id = str(i)
        for i, flight in enumerate(self.flights, 1):
            if not flight.id:
                flight.id = str(i)
        for i, m in enumerate(self.maintenances, 1):
            if not m.id:
                m.id = str(i)

    def _validate_flight_ids(self):
        flight_errors = validate_model_ids(self.flights)
        if flight_errors:
            raise ValueError(f"Flight errors: {', '.join(flight_errors)}")

    def _validate_maintenance_ids(self):
        maintenance_errors = validate_model_ids(self.maintenances)
        if maintenance_errors:
            raise ValueError(f"Maintenance errors: {', '.join(maintenance_errors)}")

    def _validate_aircraft_ids(self):
        aircraft_errors = validate_model_ids(self.aircrafts)
        if aircraft_errors:
            raise ValueError(f"Aircraft errors: {', '.join(aircraft_errors)}")

    def _validate_flight_aircraft_relation(self):
        aircraft_ids = {ac.id for ac in self.aircrafts}
        if not aircraft_ids:
            return None
        errors = [
            f"Flight {f.id} references non-existent aircraft ID: {f.aircraft_id}"
            for f in self.flights if f.aircraft_id and f.aircraft_id not in aircraft_ids
        ]
        if errors:
            raise ValueError(f"Flight aircraft relation errors: {', '.join(errors)}")

    def _validate_maintenance_aircraft_relation(self):
        aircraft_ids = {ac.id for ac in self.aircrafts}
        if not aircraft_ids:
            return
        errors = [
            f"Maintenance {m.id} references non-existent aircraft ID: {m.aircraft_id}"
            for m in self.maintenances if m.aircraft_id not in aircraft_ids
        ]
        if errors:
            raise ValueError(f"Maintenance aircraft relation errors: {', '.join(errors)}")

    def validate_for_optimization(self) -> list[str]:
        """
        Check if the input file is ready for optimization.
        This means it has at least one flight, aircraft, and maintenance.
        """
        errors = []
        if not self.flights:
            errors.append("No flights provided.")
        if not self.aircrafts:
            errors.append("No aircrafts provided.")
        return errors


ValidationModel = Maintenance | Flight | Aircraft | InputFile


def validate_model_ids(items: Iterable[ValidationModel]) -> list[str]:
    return validate_ids(i.model_dump(exclude_none=True) for i in items)

