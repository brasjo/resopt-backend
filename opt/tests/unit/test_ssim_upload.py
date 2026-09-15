from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase

from resopt_utils.ssim import RECORD_3_FIELDS, RECORD_LENGTH

from opt.models import OptimizationScenario


def _ssim_leg_line(**overrides) -> str:
    values = {
        "record_type": "3",
        "airline_designator": "AA",
        "flight_number": "1",
        "itinerary_variation_identifier": "01",
        "leg_sequence_number": "01",
        "service_type": "J",
        "period_of_operation_from": "01JAN17",
        "period_of_operation_to": "01JAN17",
        "days_of_operation": "1234567",
        "departure_station": "JFK",
        "scheduled_time_of_passenger_departure": "0800",
        "scheduled_time_of_aircraft_departure": "0800",
        "utc_local_time_variation_departure": "-0500",
        "arrival_station": "LAX",
        "scheduled_time_of_aircraft_arrival": "1141",
        "scheduled_time_of_passenger_arrival": "1141",
        "utc_local_time_variation_arrival": "-0800",
        "aircraft_type": "32B",
        "date_variation": "00",
        "record_serial_number": "000003",
    }
    values.update(overrides)
    parts = []
    for name, width in RECORD_3_FIELDS:
        val = str(values.get(name, ""))
        parts.append(val.ljust(width))
    line = "".join(parts)
    assert len(line) == RECORD_LENGTH
    return line


class TestParseSsimUpload(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="ssim_test_user",
            email="ssim_test@example.com",
            password="testpassword",
        )
        self.scenario = OptimizationScenario.objects.create(
            user=self.user,
            name="SSIM import test scenario",
        )

    def test_small_file_imports_without_a_period_set(self):
        content = _ssim_leg_line()
        result = self.scenario._parse_ssim_upload(content)
        self.assertEqual(result.errors, [])
        self.assertEqual(len(result.items["flights"]), 1)

    def test_large_file_rejected_without_a_period_set(self):
        # A single leg operating daily across a full year - spans well
        # beyond SSIM_MAX_IMPORT_SPAN_DAYS (90).
        content = _ssim_leg_line(
            period_of_operation_from="01JAN17",
            period_of_operation_to="31DEC17",
        )
        result = self.scenario._parse_ssim_upload(content)
        self.assertTrue(result.errors)
        self.assertIn("exceeds the", result.errors[0])
        self.assertIn("period", result.errors[0])

    def test_large_file_scoped_to_scenario_period(self):
        content = _ssim_leg_line(
            period_of_operation_from="01JAN17",
            period_of_operation_to="31DEC17",
        )
        self.scenario.period_start = datetime(2017, 6, 1)
        self.scenario.period_end = datetime(2017, 6, 15)
        self.scenario.save()

        result = self.scenario._parse_ssim_upload(content)
        self.assertEqual(result.errors, [])
        flights = result.items["flights"]
        self.assertGreater(len(flights), 0)
        # Buffer is 10 days each side (default SSIM_IMPORT_BUFFER_DAYS) -
        # every returned flight's date must fall within [period_start -
        # 10d, period_end + 10d].
        window_start = date(2017, 5, 22)
        window_end = date(2017, 6, 25)
        for f in flights:
            dt = date(*[int(x) for x in _parse_ddmmmyyyy(f["dt"])])
            self.assertGreaterEqual(dt, window_start)
            self.assertLessEqual(dt, window_end)

    def test_large_file_rejected_when_scenario_period_itself_too_long(self):
        content = _ssim_leg_line(
            period_of_operation_from="01JAN17",
            period_of_operation_to="31DEC17",
        )
        self.scenario.period_start = datetime(2017, 1, 1)
        self.scenario.period_end = datetime(2017, 6, 1)  # ~5 months, way over 30 days
        self.scenario.save()

        result = self.scenario._parse_ssim_upload(content)
        self.assertTrue(result.errors)
        self.assertIn("Scenario period", result.errors[0])


def _parse_ddmmmyyyy(value: str) -> tuple[int, int, int]:
    from datetime import datetime
    d = datetime.strptime(value, "%d%b%Y")
    return d.year, d.month, d.day
