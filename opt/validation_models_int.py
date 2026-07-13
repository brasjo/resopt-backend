from datetime import datetime, timedelta
from typing import Optional, Any, ClassVar
import logging

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from resopt_utils.utils import timedelta_to_int
from resopt_utils.parser import parse_datetime, parse_timedelta

logger = logging.getLogger('validation_models_pub')
DATETIME_STR_FORMAT = '%Y-%m-%dT%H:%M'


class OptActivity(BaseModel):
    activity_type: ClassVar[str] = 'opt_unknown'

    id: int = Field(..., description="Unique identifier for the activity")
    start: datetime = Field(..., description="Start date and time of the maintenance")
    end: datetime = Field(..., description="End date and time of the maintenance")

    custom_fields: dict[str, Any] = Field(
        default_factory=dict,
        title="Custom Fields",
        description="Additional custom fields for the activity"
    )

    class Config:
        json_encoders = {
            timedelta: timedelta_to_int
        }

    def __init__(self, **data: Any):
        known_fields = self.__class__.model_fields.keys()
        actual_data = {k: v for k, v in data.items() if k in known_fields}
        extra_fields = {k: v for k, v in data.items() if k not in known_fields}

        actual_data["custom_fields"] = extra_fields

        super().__init__(**actual_data)

    @field_validator("start", mode='before')
    def parse_start(cls, v: str | datetime) -> datetime:
        try:
            return parse_datetime(v)
        except ValueError as e:
            logger.error(f"Error parsing OptActivity start: '{v}' ({e}).")
            raise ValueError(f"Error parsing OptActivity start: '{v}'.")

    @field_validator("end", mode='before')
    def parse_end(cls, v: str | datetime) -> datetime:
        try:
            return parse_datetime(v)
        except ValueError as e:
            logger.error(f"Error parsing OptActivity end: '{v}' ({e}).")
            raise ValueError(f"Error parsing OptActivity end: '{v}'.")

    @model_validator(mode='after')
    def check_start_before_end(self) -> 'OptActivity':
        if self.start >= self.end:
            start_str = self.start.strftime(DATETIME_STR_FORMAT)
            end_str = self.end.strftime(DATETIME_STR_FORMAT)
            logger.error(f"OptActivity start time '{start_str}' must be before end time '{end_str}'")
            raise ValueError("OptActivity start time must be before end time")
        return self


class OptMaintenance(OptActivity):
    activity_type: ClassVar[str] = 'opt_maintenance'

    aircraft_id: int = Field(..., description="The ID of the aircraft")
    station: str = Field(..., description="Station where the maintenance is performed")

    def default(cls, data: dict = None) -> 'OptMaintenance':
        data = data or {}
        return cls(
            aircraft_id=data.get("aircraft_id", "AAAAA"),
            type=data.get("type", "CK-A"),
            start=data.get("start", datetime(2023, 10, 1, 10, 0)),
            end=data.get("end", datetime(2023, 10, 1, 12, 0)),
            station=data.get("station", "JFK"),
        )


class OptFlight(OptActivity):
    activity_type: ClassVar[str] = 'opt_flight'

    adep: str = Field(..., title="Departure Airport")
    ades: str = Field(..., title="Arrival Airport")
    planned_actype: str = Field(..., title="Planned Aircraft Type")

    # Optional fields with supporting logic
    aircraft_id: Optional[int] = Field(None, title="Pre-assigned Resource ID")
    rotation_id: Optional[str] = Field(None, title="Rotation ID")
    seqnum: Optional[int] = Field(0, title="Sequence Number")
    multileg_id: Optional[str] = Field(None, title="Multileg ID")

    @classmethod
    def default(cls, data: dict = None) -> 'OptFlight':
        data = data or {}
        return cls(
            adep=data.get("adep", "JFK"),
            ades=data.get("ades", "LAX"),
            start=data.get("start", datetime(2023, 1, 1, 12, 0)),
            end=data.get("end", datetime(2023, 1, 1, 15, 0)),
            fl_num=data.get("fl_num", 1000),
            ac_type=data.get("ac_type", "737"),
            resource_id=data.get("resource_id"),
            rotation_id=data.get("rotation_id"),
            seqnum=data.get("seqnum"),
            multileg_id=data.get("multileg_id"),
        )


class OptMeta(BaseModel):
    period_start: datetime = Field(
        None,
        title="Period Start Date in UTC ISO 8601 format, e.g '2023-01-01T00:00Z'"
    )
    period_end: datetime = Field(
        None,
        title="Period End Date in UTC ISO 8601 format, e.g '2023-01-31T23:59Z'"
    )

    @field_validator("period_start", mode='before')
    def parse_period_start(cls, v: str | datetime) -> datetime | None:
        try:
            return parse_datetime(v)
        except ValueError as e:
            raise ValueError(f"Error parsing Meta period_start: {e}.")

    @field_validator("period_end", mode='before')
    def parse_period_end(cls, v: str | datetime) -> datetime | None:
        try:
            return parse_datetime(v)
        except ValueError as e:
            raise ValueError(f"Error parsing Meta period_end: {e}.")

    @model_validator(mode='after')
    def check_start_before_end(self) -> 'OptMeta':
        if not self.period_start or not self.period_end:
            return self
        if self.period_start >= self.period_end:
            raise ValueError("Meta period_start must be before period_end")
        return self


class OptResource(BaseModel):
    id: int = Field(..., title="Resource ID")
    min_turn_time: timedelta = Field(
        ...,
        title="Minimum Turn Time",
        description="Minimum turn time for this aircraft in 'HH:MM format"
    )
    available_from: datetime = Field(
        ...,
        title="Available From",
        description="Date and time when the aircraft becomes available for flights"
    )
    last_known_station: str = Field(
        ...,
        title="Last Known Station",
        description="Last known station of the aircraft, e.g. 'LAX'"
    )
    type: str = Field(..., title="Aircraft Type")

    custom_fields: dict[str, Any] = Field(
        default_factory=dict,
        title="Custom Fields",
        description="Additional custom fields for the resource"
    )

    def __init__(self, **data: Any):
        known_fields = self.__class__.model_fields.keys()
        actual_data = {k: v for k, v in data.items() if k in known_fields}
        extra_fields = {k: v for k, v in data.items() if k not in known_fields}

        actual_data["custom_fields"] = extra_fields

        super().__init__(**actual_data)

    def plural(self) -> str:
        return "resources"

    class Config:
        json_encoders = {
            timedelta: timedelta_to_int
        }


class OptAircraft(OptResource):
    resource_type: ClassVar[str] = 'opt_aircraft'

    type: str = Field(..., title="Aircraft Type")
    service_start: datetime = Field(..., title="Service Start Date")
    service_end: Optional[datetime] = Field(None, title="Service End Date")
    min_turn_time: timedelta = Field(
        ...,
        title="Minimum Turn Time",
        description="Minimum turn time for this aircraft type in HH:MM format"
    )
    available_from: datetime = Field(
        ...,
        title="Available From",
        description="Date and time when the aircraft becomes available for flights"
    )
    last_known_station: str = Field(
        ...,
        title="Last Known Station",
        description="Last known station of the aircraft, e.g. 'LAX'"
    )

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
    def check_service_start_before_service_end(self) -> 'OptAircraft':
        if not self.service_start or not self.service_end:
            return self
        if self.service_start >= self.service_end:
            raise ValueError("Aircraft service_start must be before service_end")
        return self

    def plural(self) -> str:
        return "aircrafts"

    @classmethod
    def default(cls, data: dict = None) -> 'OptAircraft':
        data = data or {}
        return cls(
            id=data.get('id', "AAAAA"),
            type=data.get('type', "320"),
            regno=data.get('regno', "ABC123"),
            service_start=data.get('service_start', datetime(2020, 1, 1, 0, 0)),
            service_end=data.get('service_end', None),
            burn_bias=data.get('burn_bias', 1.0),
            min_turn_time=data.get('min_turn_time', None),
            available_from=data.get('available_from', None),
            last_known_station=data.get('last_known_station', None),
        )


class OptTimedeltaEntry(BaseModel):
    param: str
    time_delta: timedelta

    class Config:
        json_encoders = {
            timedelta: timedelta_to_int
        }

    def to_str(self) -> str:
        return timedelta_to_int(self.time_delta)

    @field_validator("time_delta", mode='before')
    def parse_timedelta(cls, v: str | timedelta) -> timedelta:
        return parse_timedelta(v)


class OptPositiveTimedeltaEntry(OptTimedeltaEntry):
    @field_validator("time_delta", mode='after')
    def check_positive(cls, v: timedelta) -> timedelta:
        if v <= timedelta(0):
            raise ValueError("time_delta must be positive")
        return v


class OptParameters(BaseModel):
    use_min_turn_time_rule: bool = Field(
        True,
        title="Use Minimum Turn Time Rule",
        description="If True, the minimum turn time rule is applied to flights."
    )
    default_min_turn_time: timedelta = Field(
        timedelta(hours=1),
        title="Default Minimum Turn Time",
        description="The default minimum turn time between flights in hours and minutes."
    )
    custom_min_turn_times: list[OptPositiveTimedeltaEntry] = Field(
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
    custom_max_turn_times: list[OptTimedeltaEntry] = Field(
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
            timedelta: timedelta_to_int
        },
        extra='allow',
    )

    @model_validator(mode='after')
    def check_custom_min_turn_times(self) -> 'OptParameters':
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
            values['custom_min_turn_times'].append(OptPositiveTimedeltaEntry(
                param=k,
                time_delta=v
            ))
            values.pop(k)
        for k in values:
            if k in cls.model_fields or k in min_turn_time_fields:
                continue
            raise ValueError(f"Unexpected field '{k}' in Parameters model.")
        return values

    @field_validator("default_min_turn_time", mode='before')
    def parse_timedelta(cls, v: str | timedelta) -> timedelta:
        return parse_timedelta(v)


class InputFile(BaseModel):
    aircrafts: list[OptResource] = Field(default_factory=list, title="List of Aircraft")
    flights: list[OptFlight] = Field(default_factory=list, title="List of Flights")
    maintenances: list[OptMaintenance] = Field(default_factory=list, title="List of Maintenances")
    parameters: OptParameters = Field(default_factory=OptParameters, title="Optimization Parameters")
    meta: OptMeta = Field(default_factory=OptMeta, title="Meta Information")

    def plural(self) -> str:
        return "input files"


OptValidationModel = InputFile | OptMeta | OptResource | OptActivity | OptFlight | OptMaintenance | OptParameters | OptTimedeltaEntry
