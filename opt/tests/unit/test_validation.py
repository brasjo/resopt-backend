from datetime import datetime
from pathlib import Path
from unittest import TestCase as BaseTestCase
from datetime import timedelta
import json

from pydantic import ValidationError
from django.core.files.base import ContentFile
from django.conf import settings
from django.contrib.auth import get_user_model

from opt.validation import (
    validate_periods,
    validate_ac_available_from,
    validate_last_known_station,
)
from opt.models import OptimizationScenario
from utils import timedelta_to_hhmm


User = get_user_model()
SCRIPT_DIR = Path(__file__).parent
TEST_DATA_DIR = SCRIPT_DIR / '../test_data'
INPUT_BUILDER_TEMPLATE_CONTENT = settings.INPUT_BUILDER_TEMPLATE_CONTENT
INPUT_BUILDER_FILENAME = settings.INPUT_BUILDER_FILENAME


class TestParser(BaseTestCase):
    def test_guess_model_class_aircraft(self):
        data = [
            {
                "id": "AC123",
                "type": "Boeing 737",
                "regno": "N12345",
                "service_start": "2023-01-01T00:00:00",
                "burn_bias": 1.0
            }
        ]
        model = guess_model_class(data)
        self.assertIsInstance(model, Aircraft, "Expected model type to be Aircraft")

    def test_guess_model_class_flight(self):
        data = [
            {
                "id": "FL123",
                "adep": "JFK",
                "ades": "LAX",
                "start": "2023-10-01T12:00:00",
                "end": "2023-10-01T15:00:00",
                "fl_num": 123
            }
        ]
        model = guess_model_class(data)
        self.assertIsInstance(model, Flight, "Expected model type to be Flight")

    def test_guess_model_class_empty(self):
        data = []
        model = guess_model_class(data)
        self.assertIsNone(model, "Expected model type to be None for empty data")

    def test_guess_model_class_maintenance(self):
        data = [
            {
                "aircraft_id": "AC123",
                "type": "CK-A",
                "station": "JFK",
                "start": "2023-10-01T10:00:00",
                "end": "2023-10-01T12:00:00"
            }
        ]
        model = guess_model_class(data)
        self.assertIsInstance(model, Maintenance, "Expected model type to be Maintenance")

    def test_guess_file_type_csv_1_column(self):
        file_path = TEST_DATA_DIR / 'csv_1_column'
        assert guess_file_type(file_path) == 'csv', "Expected file type to be 'csv'"

    def test_guess_file_type_csv_with_fieldnames(self):
        file_path = TEST_DATA_DIR / 'csv_with_fieldnames'
        assert guess_file_type(file_path) == 'csv', "Expected file type to be 'csv'"

    def test_guess_file_type_csv_without_fieldnames(self):
        file_path = TEST_DATA_DIR / 'csv_without_fieldnames'
        assert guess_file_type(file_path) == 'csv', "Expected file type to be '' (empty) for CSV without fieldnames"

    def test_guess_file_type_json_list(self):
        file_path = TEST_DATA_DIR / 'json_list'
        assert guess_file_type(file_path) == 'json', "Expected file type to be 'json' for JSON list"

    def test_extract_1_aircraft(self):
        aircrafts = extract_key({
            "aircrafts": [
                {
                    "id": "AC123",
                    "type": "Boeing 737",
                    "regno": "N12345",
                    "service_start": "2023-01-01T00:00:00",
                    "burn_bias": 1.0
                },
            ]
        }, 'aircrafts')
        self.assertEqual(len(aircrafts), 1)

    def test_extract_multiple_aircrafts(self):
        aircrafts = extract_key({
            "aircrafts": [
                {
                    "id": "AC123",
                    "type": "Boeing 737",
                    "regno": "N12345",
                    "service_start": "2023-01-01T00:00:00",
                    "burn_bias": 1.1
                },
                {
                    "id": "AC124",
                    "type": "Airbus A320",
                    "regno": "N54321",
                    "service_start": "2023-02-01T00:00:00",
                    "burn_bias": 1.2
                }
            ]
        }, 'aircrafts')
        self.assertEqual(len(aircrafts), 2)

    def test_extract_invalid_aircraft(self):
        aircrafts = extract_key({
            "flights": [
                {
                    "id": "FL123",
                    "adep": "JFK",
                    "ades": "LAX",
                    "start": "2023-10-01T12:00:00",
                    "end": "2023-10-01T15:00:00",
                    "fl_num": 123
                }
            ]
        }, 'aircrafts')
        self.assertEqual(aircrafts, [], "Expected to find no aircrafts in flights data")

    def test_extract_aircrafts_nested(self):
        aircrafts = extract_key({
            "data": {
                "aircrafts": [
                    {
                        "id": "AC123",
                        "type": "Boeing 737",
                        "regno": "N12345",
                        "service_start": "2023-01-01T00:00:00",
                        "burn_bias": 1.0
                    }
                ]
            },
        }, 'aircrafts')
        self.assertEqual(len(aircrafts), 1, "Expected to find one aircraft in nested data structure")


class TestValidation(BaseTestCase):
    def test_validate_ids(self):
        items_with_duplicates = [
            {"id": "1", "name": "Item 1"},
            {"id": "2", "name": "Item 2"},
            {"id": "1", "name": "Item 3"}  # Duplicate ID
        ]
        errors = validate_ids(items_with_duplicates)
        self.assertIn("Duplicate 'id' found: 1", errors[0])

        items_no_id = {
            "flights": [
                {"name": "Item 1"},
                {"name": "Item 2"}
            ]
        }
        errors_no_id = validate_ids(items_no_id)
        self.assertEqual(errors_no_id, [], "Expected no errors when no 'id' field is present")

        items_some_no_id = [
            {"id": "1", "name": "Item 1"},
            {"name": "Item 2"},  # No ID here
            {"id": "3", "name": "Item 3"}
        ]
        errors_some_no_id = validate_ids(items_some_no_id)
        self.assertIn("No 'id' field found in {'name': 'Item 2'}", str(errors_some_no_id))

        items_with_ids = [
            {"id": "1", "name": "Item 1"},
            {"id": "2", "name": "Item 2"},
            {"id": "3", "name": "Item 3"}
        ]
        errors_with_ids = validate_ids(items_with_ids)
        self.assertEqual(errors_with_ids, [], "Expected no errors when all items have unique 'id' fields")

    def test_validate_input_builder_ok(self):
        input_data = {
            "aircrafts": [
                {
                    "id": "AC123",
                    "type": "Boeing 737",
                    "regno": "N12345",
                    "service_start": "2023-01-01T00:00:00",
                    "burn_bias": 1.0
                }
            ],
            "flights": [
                {
                    "id": "FL123",
                    "aircraft_id": "AC123",
                    "adep": "JFK",
                    "ades": "LAX",
                    "start": "2023-10-01T12:00:00",
                    "end": "2023-10-01T15:00:00",
                    "fl_num": 123
                }
            ],
            "maintenances": [
                {
                    "aircraft_id": "AC123",
                    "type": "CK-A",
                    "station": "JFK",
                    "start": "2023-10-01T10:00:00",
                    "end": "2023-10-01T12:00:00"
                }
            ]
        }
        _input_builder = InputFileBuilder(**input_data)

    def test_validate_input_builder_no_id(self):
        input_data = {
            "aircrafts": [
                {
                    "type": "Boeing 737",
                    "regno": "N12345",
                    "service_start": "2023-01-01T00:00:00",
                }
            ],
            "flights": [
                {
                    "adep": "JFK",
                    "ades": "LAX",
                    "start": "2023-10-01T12:00:00",
                    "end": "2023-10-01T15:00:00",
                }
            ],
        }
        input_builder = InputFileBuilder(**input_data)
        json_data = input_builder.model_dump_json()
        self.assertIn('"id":"1","type":"Boeing 737"', json_data)
        self.assertIn('{"id":"1","adep":"JFK"', json_data)

    def test_validate_input_builder_one_id(self):
        input_data = {
            "flights": [
                {
                    "adep": "JFK",
                    "ades": "LAX",
                    "start": "2023-10-01T12:00:00",
                    "end": "2023-10-01T15:00:00",
                },
                {
                    "id": "1",
                    "adep": "JFK",
                    "ades": "LAX",
                    "start": "2023-10-01T12:00:00",
                    "end": "2023-10-01T15:00:00",
                }
            ],
        }
        with self.assertRaises(ValidationError) as cm:
            InputFileBuilder(**input_data)
        self.assertIn("Flight errors: No 'id' field found in {'adep': 'JFK', 'ades': 'LAX'", str(cm.exception))

    def test_validate_input_builder_flight_aircraft_relation(self):
        input_data = {
            "aircrafts": [
                {
                    "id": "AC123",
                    "type": "Boeing 737",
                    "regno": "N12345",
                    "service_start": "2023-01-01T00:00:00",
                }
            ],
            "flights": [
                {
                    "id": "FL124",
                    "aircraft_id": "AC999",  # Non-existent aircraft ID
                    "adep": "JFK",
                    "ades": "LAX",
                    "start": "2023-10-01T16:00:00",
                    "end": "2023-10-01T18:00:00",
                }
            ],
        }
        with self.assertRaises(ValidationError) as cm:
            InputFileBuilder(**input_data)
        self.assertIn("references non-existent aircraft ID", str(cm.exception))

    def test_validate_input_builder_maintenance_aircraft_relation(self):
        input_data = {
            "aircrafts": [
                {
                    "id": "AC123",
                    "type": "Boeing 737",
                    "regno": "N12345",
                    "service_start": "2023-01-01T00:00:00",
                }
            ],
            "maintenances": [
                {
                    "aircraft_id": "AC999",  # Non-existent aircraft ID
                    "type": "CK-A",
                    "station": "JFK",
                    "start": "2023-10-01T10:00:00",
                    "end": "2023-10-01T12:00:00"
                }
            ],
        }
        with self.assertRaises(ValidationError) as cm:
            InputFileBuilder(**input_data)
        self.assertIn("references non-existent aircraft ID", str(cm.exception))


class TestAircraftValidation(BaseTestCase):
    def test_aircraft_model(self):
        aircraft = Aircraft(**{
            "id": "AC123",
            "type": "Boeing 737",
            "regno": "N12345",
            "service_start": "2020-01-01T00:00:00",
            "burn_bias": 1.1,
            "name": "Test Aircraft", # Extra field
            "min_turn_time": "01:23",
        })
        self.assertEqual(aircraft.id, "AC123")
        self.assertEqual(aircraft.type, "Boeing 737")
        self.assertEqual(aircraft.regno, "N12345")
        self.assertEqual(aircraft.service_start, datetime(2020, 1, 1, 0, 0))
        self.assertEqual(aircraft.burn_bias, 1.1)
        self.assertEqual(aircraft.name, "Test Aircraft")
        self.assertEqual(aircraft.service_end, None)  # Default value
        self.assertEqual(aircraft.min_turn_time, timedelta(hours=1, minutes=23))


class TestFlightValidation(BaseTestCase):
    def test_flight_model(self):
        flight = Flight(**{
            "id": "FL123",
            "adep": "JFK",
            "ades": "LAX",
            "start": "2023-10-01T12:00:00",
            "end": "2023-10-01T15:00:00",
            "fl_num": 123,
            "ac_type": "Boeing 737",
            "aircraft_id": "AC123",
            "rotation_id": "ROT123",
            "seqnum": 1,
            "multileg_id": None
        })
        self.assertEqual(flight.id, "FL123")
        self.assertEqual(flight.adep, "JFK")
        self.assertEqual(flight.ades, "LAX")
        self.assertEqual(flight.start, datetime(2023, 10, 1, 12, 0))
        self.assertEqual(flight.end, datetime(2023, 10, 1, 15, 0))
        self.assertEqual(flight.fl_num, 123)
        self.assertEqual(flight.ac_type, "Boeing 737")
        self.assertEqual(flight.aircraft_id, "AC123")
        self.assertEqual(flight.rotation_id, "ROT123")
        self.assertEqual(flight.seqnum, 1)
        self.assertIsNone(flight.multileg_id)


class TestMaintenanceValidation(BaseTestCase):
    def test_maintenance_model(self):
        maintenance = Maintenance(**{
            "aircraft_id": "AC123",
            "type": "CK-A",
            "station": "JFK",
            "start": "2023-10-01T10:00:00",
            "end": "2023-10-01T12:00:00"
        })
        self.assertEqual(maintenance.aircraft_id, "AC123")
        self.assertEqual(maintenance.type, "CK-A")
        self.assertEqual(maintenance.start, datetime(2023, 10, 1, 10, 0))
        self.assertEqual(maintenance.end, datetime(2023, 10, 1, 12, 0))


class TestOptimizationScenarioValidation(BaseTestCase):
    def setUp(self):
        self.test_user = User.objects.get_or_create(
            username='testuser',
            password='testpassword',
            email='testuser@example.com'
        )[0]

    def test_validate_periods_no_period(self):
        run = OptimizationScenario(
            user=self.test_user,
            period_start=None,
            period_end=None,
        )
        run.save()
        errors = validate_periods(run.get_period_start(), run.get_period_end())
        self.assertIn(
            "OptimizationScenario must have period_start and period_end set.",
            errors[0],
            "Expected error when both period_start and period_end are None"
        )

    def test_validate_periods_with_periods(self):
        run = OptimizationScenario(
            user=self.test_user,
            period_start=datetime(2023, 1, 1, 0, 0),
            period_end=datetime(2023, 1, 1, 23, 59, 59),
        )
        run.save()
        errors = validate_periods(run.get_period_start(), run.get_period_end())
        self.assertEqual(errors, [], "Expected no errors when both period_start and period_end are set")

    def test_validate_ac_available_from(self):
        ac = Aircraft.default(
            {"available_from": datetime(2023, 1, 1, 0, 0)}
        )
        errors = validate_ac_available_from([ac], [])
        self.assertEqual(errors, [], "Expected no errors when aircraft has available_from set")

        ac = Aircraft.default({"id": "AAAAA"})
        flight = Flight.default()
        errors = validate_ac_available_from([ac], [flight])
        self.assertIn("no available_from set", errors[0])

        flight.aircraft_id = "AAAAA"
        errors = validate_ac_available_from([ac], [flight])
        self.assertEqual(errors, [], "Expected no errors when aircraft has flights assigned")

    def test_validate_last_known_station(self):
        ac = Aircraft.default({"id": "AAAAA", "last_known_station": "LAX"})
        errors = validate_last_known_station([ac], [], datetime(2023, 1, 1, 0, 0))
        self.assertEqual(errors, [], "Expected no errors when aircraft has last_known_station set")

        ac.last_known_station = None
        errors = validate_last_known_station([ac], [], datetime(2023, 1, 1, 0, 0))
        self.assertIn("no last_known_station set", errors[0])

        flight = Flight.default({
            "aircraft_id": "AAAAA",
            "start": datetime(2023, 1, 1, 0, 0),
            "end": datetime(2023, 1, 1, 1, 0),
        })
        errors = validate_last_known_station([ac], [flight], datetime(2023, 1, 1, 0, 0))
        self.assertIn(
            "Aircraft 'AAAAA' has no flights prior to the period start 2023-01-01T00:00:00 "
            "and no last_known_station set.",
            errors[0],
            "Expected error when aircraft has no flights prior to the period start and no last_known_station set."
        )
        flight.start = datetime(2022, 12, 31, 23, 0)
        errors = validate_last_known_station([ac], [flight], datetime(2023, 1, 1, 0, 0))
        self.assertEqual(errors, [], "Expected no errors when aircraft has flights prior to the period start")


class TestParametersValidation(BaseTestCase):
    def test_create_parameters(self):
        params = Parameters()
        self.assertIsNotNone(params, "Default parameters instance should be created successfully")

    def test_validate_default_parameters(self):
        with open(settings.BASE_DIR / 'default_parameters.json') as f:
            default_params = json.load(f)
        try:
            _params = Parameters(**default_params)
        except ValidationError as e:
            self.fail(f"Default parameters validation failed: {e}")

    def test_custom_allowed_parameter(self):
        params = Parameters(**{
            "min_turn_time_320": "01:30",
        })
        self.assertEqual(
            params.custom_min_turn_times[0].time_delta,
            timedelta(hours=1, minutes=30),
            "Custom parameter should be set correctly",
        )
        json_str = params.model_dump_json()
        self.assertIn(
            '"custom_min_turn_times":[{"param":"min_turn_time_320","time_delta":"01:30"}]',
            json_str,
            "Custom parameter should be included in the JSON output",
        )
        self.assertNotIn(
            ',"min_turn_time_320":"01:30"',
            json_str,
            "Customed parameter should not be included as a top-level field",
        )

    def test_custom_allowed_parameters(self):
        params = Parameters(**{
            "min_turn_time_320": "01:30",
            "min_turn_time_321": "02:00",
        })
        self.assertEqual(
            len(params.custom_min_turn_times), 2,
            "Two custom parameters should be set correctly"
        )
        self.assertEqual(
            params.custom_min_turn_times[0].time_delta,
            timedelta(hours=1, minutes=30),
            "First custom parameter should be set correctly"
        )
        self.assertEqual(
            params.custom_min_turn_times[1].time_delta,
            timedelta(hours=2, minutes=0),
            "Second custom parameter should be set correctly"
        )

    def test_custom_allowed_parameter_list(self):
        dict_data = {
            "custom_min_turn_times": [
                {"param": "min_turn_time_320", "time_delta": "01:30"},
                {"param": "min_turn_time_321", "time_delta": "02:00"},
            ]
        }
        params = Parameters(**dict_data)
        self.assertEqual(
            len(params.custom_min_turn_times), 2,
            "Two custom parameters should be set correctly from list"
        )

    def test_custom_allowed_parameter_not_list(self):
        dict_data = {
            "custom_min_turn_times": {"param": "min_turn_time_321", "time_delta": "02:00"},
        }
        with self.assertRaises(ValidationError) as cm:
            Parameters(**dict_data)
        self.assertIn("Input should be a valid list", str(cm.exception))

    def test_custom_allowed_parameter_incorrect_param_name(self):
        dict_data = {
            "custom_min_turn_times": [
                {"param": "incorrect_min_turn_time", "time_delta": "02:00"},
            ]
        }
        with self.assertRaises(ValidationError) as cm:
            params = Parameters(**dict_data)
            print(params.model_dump_json(indent=4))
        self.assertIn("must start with", str(cm.exception))

    def test_custom_allowed_parameter_wrong_value(self):
        with self.assertRaises(ValidationError) as cm:
            Parameters(**{
                "min_turn_time_320": "invalid_value",  # This should raise a validation error
            })
        self.assertIn("Use 'HH:MM'", str(cm.exception))

    def test_custom_not_allowed_parameter(self):
        with self.assertRaises(ValidationError) as cm:
            Parameters(**{
                "hacked": True,  # This should not be allowed
            })
        self.assertIn("Unexpected field 'hacked'", str(cm.exception))
