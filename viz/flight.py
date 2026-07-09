import json
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class Flight(BaseModel):
    id: Optional[str]= Field(None, title="Flight ID")

    adep: str = Field(..., title="Departure Airport")
    ades: str = Field(..., title="Arrival Airport")
    sibt: datetime = Field(..., title="End Time")
    fl_num: int = Field(..., title="Flight Number")
    sobt: datetime = Field(..., title="Start Time")

    # Optional fields
    planned_actype: Optional[str] = Field(None, title="Planned Aircraft Type")
    resource_id: Optional[str] = Field(None, title="Resource ID")
    rotation_id: Optional[str] = Field(None, title="Rotation ID")
    seqnum: Optional[int] = Field(0, title="Sequence Number")
    multileg_id: Optional[str] = Field(None, title="Multileg ID")

    model_config = {
        "extra": "allow"
    }


class Input(BaseModel):
    activities: list[Flight] = Field(..., title="List of Flights")
    resources: list[str] = Field(..., title="List of Resources")


class Param(BaseModel):
    # Define the parameters for the optimization
    max_flight_time: int = Field(10, title="Maximum Flight Time")
    max_flight_count: int = Field(..., title="Maximum Flight Count")
    max_maintenance_time: int = Field(..., title="Maximum Maintenance Time")
    max_maintenance_count: int = Field(..., title="Maximum Maintenance Count")
    max_maintenance_duration: int = Field(..., title="Maximum Maintenance Duration")
    max_maintenance_count_per_day: int = Field(..., title="Maximum Maintenance Count Per Day")


if __name__ == "__main__":
    flight = Flight(
        id="1",
        adep="JFK",
        ades="LAX",
        sibt=datetime(2023, 10, 1, 12, 0),
        fl_num=123,
        sobt=datetime(2023, 10, 1, 10, 0),
        planned_actype="A320",
        resource_id="R1",
        rotation_id="ROT1",
        multileg_id="ML1"
    )

    flight_json = """
    {
        "id": "1",
        "adep": "JFK",
        "ades": "LAX",
        "sibt": "2023-10-01T12:00:00",
        "fl_num": 123,
        "sobt": "2023-10-01T10:00:00",
        "planned_actype": "A320",
        "resource_id": "R1",
        "rotation_id": "ROT1",
        "seqnum": 1,
        "multileg_id": "ML1"
    }
    """
    flight2 = Flight(**json.loads(flight_json))
    print(flight2.model_dump_json())
    # print(Flight.model_json_schema())
    # schema = Flight.model_json_schema()
    # print(json.dumps(schema, indent=2))
    # schema2 = Input.model_json_schema()
    # print(json.dumps(schema2, indent=2))
    # print(flight.model_dump_json())