from copy import deepcopy

from datetime import datetime, timedelta
from unittest import TestCase

from opt.validation_models_pub import (
    InputFileBuilder,
    Flight,
    Aircraft,
    Maintenance,
)
from opt.preprocess import (
    set_meta_period,
    set_aircraft_min_turn_time,
    set_aircraft_last_known_station_and_available_from,
    set_flight_ids,
    set_maintenance_ids,
    set_aircraft_ids,
    generate_input_builder,
)


class TestPreprocess(TestCase):
    def test_generate_input_builder(self):
        builder = InputFileBuilder(**{
            "aircrafts": [
                Aircraft.default({
                    "id": "1",
                    "type": "A320",
                }),
            ],
            "flights": [
                Flight.default({
                    "start": "2025-01-01T00:00:00",
                    "end": "2025-01-01T01:00:00",
                    "adep": "ARN",
                    "ades": "HEL",
                    "aircraft_id": "1"
                }),
            ],
            "maintenances": [
                Maintenance.default({
                    "aircraft_id": "1",
                    "station": "GOT",
                }),
            ],
            "meta": {
                "period_start": datetime(2025, 1, 2),
                "period_end": datetime(2025, 1, 3),
            }
        })
        result = generate_input_builder(builder)
        input_builder, errors = result.input_builder, result.errors
        print(input_builder.model_dump_json(indent=2))
        self.assertFalse(errors)


    def test_set_aircraft_ids(self):
        builder = InputFileBuilder(**{
            "aircrafts": [
                Aircraft.default({
                    "id": "2",
                    "type": "A320",
                }),
                Aircraft.default({
                    "id": "1",
                    "type": "B737",
                }),
            ]
        })
        builder_copy = deepcopy(builder)
        set_aircraft_ids(builder_copy)
        self.assertEqual(builder_copy.aircrafts[0].id, 0)
        self.assertEqual(builder_copy.aircrafts[1].id, 1)

    def test_set_maint_ids(self):
        builder = InputFileBuilder(**{
            "aircrafts": [
                Aircraft.default({
                    "id": "2",
                }),
                Aircraft.default({
                    "id": "1",
                }),
            ],
            "maintenances": [
                Maintenance.default({
                    "aircraft_id": "2",
                    "station": "ARN",
                }),
                Maintenance.default({
                    "aircraft_id": "1",
                    "station": "GOT",
                }),
            ]
        })
        builder_copy = deepcopy(builder)
        set_maintenance_ids(builder_copy)
        self.assertEqual(builder_copy.maintenances[0].id, 0)
        self.assertEqual(builder_copy.maintenances[0].aircraft_id, 1)
        self.assertEqual(builder_copy.maintenances[1].id, 1)
        self.assertEqual(builder_copy.maintenances[1].aircraft_id, 0)

    def test_set_flight_ids(self):
        builder = InputFileBuilder(**{
            "aircrafts": [
                Aircraft.default({
                    "id": "2",
                }),
                Aircraft.default({
                    "id": "1",
                }),
            ],
            "flights": [
                Flight.default({
                    "start": "2025-01-01T02:00:00",
                    "end": "2025-01-01T03:00:00",
                    "adep": "GOT",
                    "ades": "ARN",
                    "aircraft_id": "2",
                }),
                Flight.default({
                    "start": "2025-01-01T00:00:00",
                    "end": "2025-01-01T01:00:00",
                    "adep": "ARN",
                    "ades": "HEL",
                    "aircraft_id": "1"
                }),
            ]
        })
        builder_copy = deepcopy(builder)
        set_flight_ids(builder_copy)
        self.assertEqual(builder_copy.flights[0].id, 1)
        self.assertEqual(builder_copy.flights[1].id, 0)
        self.assertEqual(builder_copy.flights[0].aircraft_id, 1)
        self.assertEqual(builder_copy.flights[1].aircraft_id, 0)

    def test_set_aircraft_last_known_station_and_available_with_flights_outside_period(self):
        start = datetime(2025, 1, 1, 2)
        end = datetime(2025, 1, 1, 3)
        period_start = datetime(2025, 1, 2)
        ades = "HEL"
        builder = InputFileBuilder(**{
            "aircrafts": [
                Aircraft.default({
                    "id": "1",
                    "last_known_station": None,
                    "available_from": None
                })
            ],
            "flights": [
                Flight.default({
                    "start": "2025-01-01T00:00:00",
                    "end": "2025-01-01T01:00:00",
                    "adep": "GOT",
                    "ades": "ARN",
                    "aircraft_id": "1"
                }),
                Flight.default({
                    "start": start,
                    "end": end,
                    "adep": "ARN",
                    "ades": ades,
                    "aircraft_id": "1"
                }),
            ]
        })
        builder.meta.period_start = period_start
        self.assertIsNone(builder.aircrafts[0].available_from)
        self.assertIsNone(builder.aircrafts[0].last_known_station)
        errors = set_aircraft_last_known_station_and_available_from(
            builder
        )
        self.assertFalse(errors)
        self.assertEqual(builder.aircrafts[0].available_from, period_start)
        self.assertEqual(builder.aircrafts[0].last_known_station, ades)

    def test_set_aircraft_last_known_station_and_available_with_flight_inside_period(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 1, 1)
        period_start = datetime(2025, 1, 1)
        ades = "ARN"
        builder = InputFileBuilder(**{
            "aircrafts": [
                Aircraft.default({
                    "id": "1",
                    "last_known_station": None,
                    "available_from": None
                })
            ],
            "flights": [
                Flight.default({
                    "start": start,
                    "end": end,
                    "adep": "GOT",
                    "ades": ades,
                    "aircraft_id": "1"
                })
            ]
        })
        builder.meta.period_start = period_start
        self.assertIsNone(builder.aircrafts[0].available_from)
        self.assertIsNone(builder.aircrafts[0].last_known_station)
        errors = set_aircraft_last_known_station_and_available_from(
            builder
        )
        self.assertTrue(errors)
        self.assertIsNone(builder.aircrafts[0].available_from)
        self.assertIsNone(builder.aircrafts[0].last_known_station)

    def test_set_aircraft_last_known_station_and_available_with_flight_outside_period(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 1, 1)
        period_start = datetime(2025, 1, 1, 0, 1)
        ades = "ARN"
        builder = InputFileBuilder(**{
            "aircrafts": [
                Aircraft.default({
                    "id": "1",
                    "last_known_station": None,
                    "available_from": None
                })
            ],
            "flights": [
                Flight.default({
                    "start": start,
                    "end": end,
                    "adep": "GOT",
                    "ades": ades,
                    "aircraft_id": "1"
                })
            ]
        })
        builder.meta.period_start = period_start
        self.assertIsNone(builder.aircrafts[0].available_from)
        self.assertIsNone(builder.aircrafts[0].last_known_station)
        errors = set_aircraft_last_known_station_and_available_from(
            builder
        )
        self.assertFalse(errors)
        self.assertEqual(builder.aircrafts[0].available_from, end)
        self.assertEqual(builder.aircrafts[0].last_known_station, ades)

    def test_set_aircraft_last_known_station_and_available_no_flights(self):
        builder = InputFileBuilder(**{
            "aircrafts": [
                Aircraft.default({
                    "last_known_station": None,
                    "available_from": None
                })
            ]
        })
        self.assertIsNone(builder.aircrafts[0].available_from)
        self.assertIsNone(builder.aircrafts[0].last_known_station)
        errors = set_aircraft_last_known_station_and_available_from(builder)
        self.assertTrue(errors)
        self.assertIsNone(builder.aircrafts[0].available_from)
        self.assertIsNone(builder.aircrafts[0].last_known_station)

    def test_set_aircraft_last_known_station_and_available_already_set(self):
        expected_available_from = datetime(2025, 1, 1)
        expected_last_known_station = "JFK"
        builder = InputFileBuilder(**{
            "aircrafts": [
                Aircraft.default({
                    "available_from": expected_available_from,
                    "last_known_station": expected_last_known_station
                })
            ]
        })
        self.assertEqual(
            builder.aircrafts[0].available_from,
            expected_available_from,
        )
        self.assertEqual(
            builder.aircrafts[0].last_known_station,
            expected_last_known_station
        )
        set_aircraft_last_known_station_and_available_from(builder)
        self.assertEqual(
            builder.aircrafts[0].available_from,
            expected_available_from,
        )
        self.assertEqual(
            builder.aircrafts[0].last_known_station,
            expected_last_known_station
        )

    def test_set_min_turn_time(self):
        specific_min_turn_time = timedelta(minutes=30)
        default_min_turn_time = timedelta(hours=1)
        min_turn_time_a320 = timedelta(hours=1, minutes=10)
        builder = InputFileBuilder(**{
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
                Aircraft.default({
                    "type": "A320",
                    "min_turn_time": "00:30",
                }),
            ]
        })
        set_aircraft_min_turn_time(builder)
        self.assertEqual(builder.aircrafts[0].min_turn_time, specific_min_turn_time)
        builder.aircrafts = [
            Aircraft.default({
                "type": "A320",
            }),
        ]
        self.assertEqual(builder.aircrafts[0].min_turn_time, None)
        set_aircraft_min_turn_time(builder)
        self.assertEqual(builder.aircrafts[0].min_turn_time, min_turn_time_a320)
        builder.parameters.custom_min_turn_times = []
        builder.aircrafts = [
            Aircraft.default({
                "type": "A320",
            }),
        ]
        self.assertEqual(builder.aircrafts[0].min_turn_time, None)
        set_aircraft_min_turn_time(builder)
        self.assertEqual(builder.aircrafts[0].min_turn_time, default_min_turn_time)

    def test_set_meta_from_opt_scenario(self):
        flight1 = Flight.default({
            "start": "2024-01-01T10:00",
            "end": "2024-01-01T12:00",
        })
        flight2 = Flight.default({
            "start": "2024-01-01T14:00",
            "end": "2024-01-02T16:00",
        })
        builder = InputFileBuilder(**{
            "activities": [
                flight1,
                flight2,
            ]
        })
        self.assertIsNone(builder.meta.period_start)
        self.assertIsNone(builder.meta.period_end)
        period_start = datetime(2024, 1, 1, 9, 0)
        period_end = datetime(2024, 1, 2, 18, 0)
        set_meta_period(builder, period_start=period_start, period_end=period_end)
        self.assertIsNotNone(builder.meta.period_start)
        self.assertIsNotNone(builder.meta.period_end)
        self.assertEqual(
            builder.meta.period_start,
            period_start,
        )
        self.assertEqual(
            builder.meta.period_end,
            period_end,
        )


    def test_set_meta_period_from_flight(self):
        flight1 = Flight.default({
            "start": "2024-01-01T10:00",
            "end": "2024-01-01T12:00",
        })
        flight2 = Flight.default({
            "start": "2024-01-01T14:00",
            "end": "2024-01-02T16:00",
        })
        builder = InputFileBuilder(**{
            "flights": [
                flight1,
                flight2,
            ]
        })
        self.assertIsNone(builder.meta.period_start)
        self.assertIsNone(builder.meta.period_end)
        set_meta_period(builder)
        self.assertIsNotNone(builder.meta.period_start)
        self.assertIsNotNone(builder.meta.period_end)
        self.assertEqual(
            builder.meta.period_start,
            flight1.start,
        )
        self.assertEqual(
            builder.meta.period_end,
            flight2.end,
        )