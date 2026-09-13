from copy import deepcopy

from datetime import datetime, timedelta
from unittest import TestCase

from schemas.optinput.v1 import InputBuilderV1
from schemas.resources.v1 import AircraftV1
from schemas.activities.v1 import FlightV1, MaintenanceV1

from opt.preprocess import (
    PreprocessingContext,
    preprocess_builder,
    set_meta_period,
    set_aircraft_min_turn_time,
    set_aircraft_last_known_station_and_available_from,
    set_flight_ids,
    set_maintenance_ids,
    set_aircraft_ids,
)


class TestPreprocess(TestCase):
    def test_preprocess_builder_end_to_end(self):
        builder = InputBuilderV1(**{
            "aircrafts": [
                AircraftV1.default({
                    "id": "1",
                    "type": "A320",
                }),
            ],
            "flights": [
                FlightV1.default({
                    "start": "2025-01-01T00:00:00",
                    "end": "2025-01-01T01:00:00",
                    "adep": "ARN",
                    "ades": "HEL",
                    "aircraft_id": "1",
                }),
            ],
            "maintenances": [
                MaintenanceV1.default({
                    "aircraft_id": "1",
                    "station": "GOT",
                }),
            ],
        })
        context = preprocess_builder(
            builder,
            period_start=datetime(2025, 1, 2),
            period_end=datetime(2025, 1, 3),
        )
        self.assertFalse(context.has_errors(), context.error_messages)
        self.assertEqual(builder.meta.period_start, datetime(2025, 1, 2))
        self.assertEqual(builder.meta.period_end, datetime(2025, 1, 3))
        self.assertEqual(builder.aircrafts[0].last_known_station, "HEL")
        self.assertEqual(builder.aircrafts[0].available_from, datetime(2025, 1, 2))
        self.assertEqual(builder.aircrafts[0].id, 0)
        self.assertEqual(builder.flights[0].id, 0)
        self.assertEqual(builder.flights[0].aircraft_id, 0)
        self.assertEqual(builder.maintenances[0].id, 0)
        self.assertEqual(builder.maintenances[0].aircraft_id, 0)

    def test_set_aircraft_ids(self):
        builder = InputBuilderV1(**{
            "aircrafts": [
                AircraftV1.default({
                    "id": "2",
                    "type": "A320",
                }),
                AircraftV1.default({
                    "id": "1",
                    "type": "B737",
                }),
            ]
        })
        builder_copy = deepcopy(builder)
        set_aircraft_ids(PreprocessingContext(builder=builder_copy))
        self.assertEqual(builder_copy.aircrafts[0].id, 0)
        self.assertEqual(builder_copy.aircrafts[1].id, 1)

    def test_set_maint_ids(self):
        builder = InputBuilderV1(**{
            "aircrafts": [
                AircraftV1.default({
                    "id": "2",
                }),
                AircraftV1.default({
                    "id": "1",
                }),
            ],
            "maintenances": [
                MaintenanceV1.default({
                    "aircraft_id": "2",
                    "station": "ARN",
                }),
                MaintenanceV1.default({
                    "aircraft_id": "1",
                    "station": "GOT",
                }),
            ]
        })
        builder_copy = deepcopy(builder)
        set_maintenance_ids(PreprocessingContext(builder=builder_copy))
        self.assertEqual(builder_copy.maintenances[0].id, 0)
        self.assertEqual(builder_copy.maintenances[0].aircraft_id, 1)
        self.assertEqual(builder_copy.maintenances[1].id, 1)
        self.assertEqual(builder_copy.maintenances[1].aircraft_id, 0)

    def test_set_flight_ids(self):
        builder = InputBuilderV1(**{
            "aircrafts": [
                AircraftV1.default({
                    "id": "2",
                }),
                AircraftV1.default({
                    "id": "1",
                }),
            ],
            "flights": [
                FlightV1.default({
                    "start": "2025-01-01T02:00:00",
                    "end": "2025-01-01T03:00:00",
                    "adep": "GOT",
                    "ades": "ARN",
                    "aircraft_id": "2",
                }),
                FlightV1.default({
                    "start": "2025-01-01T00:00:00",
                    "end": "2025-01-01T01:00:00",
                    "adep": "ARN",
                    "ades": "HEL",
                    "aircraft_id": "1",
                }),
            ]
        })
        builder_copy = deepcopy(builder)
        set_flight_ids(PreprocessingContext(builder=builder_copy))
        self.assertEqual(builder_copy.flights[0].id, 1)
        self.assertEqual(builder_copy.flights[1].id, 0)
        self.assertEqual(builder_copy.flights[0].aircraft_id, 1)
        self.assertEqual(builder_copy.flights[1].aircraft_id, 0)

    def test_set_aircraft_last_known_station_and_available_with_flight_before_period(self):
        period_start = datetime(2025, 1, 2)
        ades = "HEL"
        builder = InputBuilderV1(**{
            "aircrafts": [
                AircraftV1.default({
                    "id": "1",
                    "last_known_station": None,
                    "available_from": None,
                })
            ],
            "flights": [
                FlightV1.default({
                    "start": "2025-01-01T00:00:00",
                    "end": "2025-01-01T01:00:00",
                    "adep": "GOT",
                    "ades": ades,
                    "aircraft_id": "1",
                }),
            ]
        })
        builder.meta.period_start = period_start
        context = PreprocessingContext(builder=builder)
        set_aircraft_last_known_station_and_available_from(context)
        self.assertFalse(context.has_errors())
        self.assertEqual(builder.aircrafts[0].available_from, period_start)
        self.assertEqual(builder.aircrafts[0].last_known_station, ades)

    def test_set_aircraft_last_known_station_and_available_with_flight_after_period(self):
        period_start = datetime(2025, 1, 1)
        start = datetime(2025, 1, 1, 2)
        end = datetime(2025, 1, 1, 3)
        adep = "ARN"
        builder = InputBuilderV1(**{
            "aircrafts": [
                AircraftV1.default({
                    "id": "1",
                    "last_known_station": None,
                    "available_from": None,
                })
            ],
            "flights": [
                FlightV1.default({
                    "start": start,
                    "end": end,
                    "adep": adep,
                    "ades": "HEL",
                    "aircraft_id": "1",
                }),
            ]
        })
        builder.meta.period_start = period_start
        context = PreprocessingContext(builder=builder)
        set_aircraft_last_known_station_and_available_from(context)
        self.assertFalse(context.has_errors())
        self.assertEqual(builder.aircrafts[0].available_from, period_start)
        self.assertEqual(builder.aircrafts[0].last_known_station, adep)

    def test_set_aircraft_last_known_station_and_available_no_flights(self):
        builder = InputBuilderV1(**{
            "aircrafts": [
                AircraftV1.default({
                    "last_known_station": None,
                    "available_from": None,
                })
            ]
        })
        context = PreprocessingContext(builder=builder)
        set_aircraft_last_known_station_and_available_from(context)
        self.assertTrue(context.has_errors())
        self.assertIsNone(builder.aircrafts[0].available_from)
        self.assertIsNone(builder.aircrafts[0].last_known_station)

    def test_set_aircraft_last_known_station_and_available_already_set(self):
        expected_available_from = datetime(2025, 1, 1)
        expected_last_known_station = "JFK"
        builder = InputBuilderV1(**{
            "aircrafts": [
                AircraftV1.default({
                    "available_from": expected_available_from,
                    "last_known_station": expected_last_known_station,
                })
            ]
        })
        context = PreprocessingContext(builder=builder)
        set_aircraft_last_known_station_and_available_from(context)
        self.assertFalse(context.has_errors())
        self.assertEqual(builder.aircrafts[0].available_from, expected_available_from)
        self.assertEqual(builder.aircrafts[0].last_known_station, expected_last_known_station)

    def test_set_min_turn_time(self):
        specific_min_turn_time = timedelta(minutes=30)
        default_min_turn_time = timedelta(hours=1)
        min_turn_time_a320 = timedelta(hours=1, minutes=10)
        builder = InputBuilderV1(**{
            "parameters": {
                "default_min_turn_time": "01:00",
                "custom_min_turn_times": [
                    {
                        "param": "min_turn_time_A320",
                        "time_delta": "01:10",
                    },
                ],
            },
            "aircrafts": [
                AircraftV1.default({
                    "type": "A320",
                    "min_turn_time": "00:30",
                }),
            ]
        })
        set_aircraft_min_turn_time(PreprocessingContext(builder=builder))
        self.assertEqual(builder.aircrafts[0].min_turn_time, specific_min_turn_time)

        builder.aircrafts = [
            AircraftV1.default({
                "type": "A320",
            }),
        ]
        self.assertIsNone(builder.aircrafts[0].min_turn_time)
        set_aircraft_min_turn_time(PreprocessingContext(builder=builder))
        self.assertEqual(builder.aircrafts[0].min_turn_time, min_turn_time_a320)

        builder.parameters.custom_min_turn_times = []
        builder.aircrafts = [
            AircraftV1.default({
                "type": "A320",
            }),
        ]
        self.assertIsNone(builder.aircrafts[0].min_turn_time)
        set_aircraft_min_turn_time(PreprocessingContext(builder=builder))
        self.assertEqual(builder.aircrafts[0].min_turn_time, default_min_turn_time)

    def test_set_meta_period_explicit_args_override_existing(self):
        builder = InputBuilderV1(**{
            "flights": [
                FlightV1.default({
                    "start": "2024-01-01T10:00",
                    "end": "2024-01-01T12:00",
                }),
            ]
        })
        builder.meta.period_start = datetime(2020, 1, 1)
        builder.meta.period_end = datetime(2020, 1, 2)
        period_start = datetime(2024, 1, 1, 9, 0)
        period_end = datetime(2024, 1, 2, 18, 0)
        set_meta_period(
            PreprocessingContext(builder=builder),
            period_start=period_start,
            period_end=period_end,
        )
        self.assertEqual(builder.meta.period_start, period_start)
        self.assertEqual(builder.meta.period_end, period_end)

    def test_set_meta_period_keeps_existing_when_no_args(self):
        existing_start = datetime(2020, 1, 1)
        existing_end = datetime(2020, 1, 2)
        builder = InputBuilderV1(**{
            "flights": [
                FlightV1.default({
                    "start": "2024-01-01T10:00",
                    "end": "2024-01-01T12:00",
                }),
            ]
        })
        builder.meta.period_start = existing_start
        builder.meta.period_end = existing_end
        set_meta_period(PreprocessingContext(builder=builder))
        self.assertEqual(builder.meta.period_start, existing_start)
        self.assertEqual(builder.meta.period_end, existing_end)

    def test_set_meta_period_from_flights_when_unset(self):
        flight1 = FlightV1.default({
            "start": "2024-01-01T10:00",
            "end": "2024-01-01T12:00",
        })
        flight2 = FlightV1.default({
            "start": "2024-01-01T14:00",
            "end": "2024-01-02T16:00",
        })
        builder = InputBuilderV1(**{
            "flights": [
                flight1,
                flight2,
            ]
        })
        self.assertIsNone(builder.meta.period_start)
        self.assertIsNone(builder.meta.period_end)
        set_meta_period(PreprocessingContext(builder=builder))
        self.assertEqual(builder.meta.period_start, flight1.start)
        self.assertEqual(builder.meta.period_end, flight2.end)
