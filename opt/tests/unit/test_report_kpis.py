from datetime import datetime, timedelta
from unittest import TestCase

from schemas.activities.v1 import MaintenanceV1

from opt.report_kpis import compute_report_kpis


PERIOD_START = datetime(2025, 1, 1, 0, 0)
PERIOD_END = datetime(2025, 1, 8, 0, 0)  # a 7-day period


def make_aircraft(aircraft_id="A1", type_="A320"):
    return {
        "id": aircraft_id,
        "type": type_,
        "service_start": datetime(2020, 1, 1),
    }


def make_flight(start, end, aircraft_type="A320", flight_id="F1"):
    return {
        "id": flight_id,
        "adep": "JFK",
        "ades": "LAX",
        "start": start,
        "end": end,
        "planned_actype": aircraft_type,
    }


def make_kpis(num_unassigned=0):
    return {
        "time": datetime(2025, 1, 1),
        "num_unassigned": num_unassigned,
        "num_assigned": 1,
        "cost": 0,
        "fuel_cost": 0,
    }


def make_output(assignments, num_unassigned=0):
    return {
        "version": "v1",
        "kpis": make_kpis(num_unassigned=num_unassigned),
        "assignments": assignments,
    }


def make_maintenance(aircraft_id, start, end, maint_id="M1"):
    return MaintenanceV1(
        id=maint_id,
        aircraft_id=aircraft_id,
        type="CK-A",
        start=start,
        end=end,
        station="JFK",
    )


class TestAircraftUtilization(TestCase):
    def test_flight_fully_inside_period(self):
        flight = make_flight(
            datetime(2025, 1, 2, 0, 0), datetime(2025, 1, 2, 2, 0),
        )
        output = make_output([
            {"resource": make_aircraft(), "activities": [flight]},
        ])
        result = compute_report_kpis(output, [], PERIOD_START, PERIOD_END)

        period_duration = PERIOD_END - PERIOD_START
        expected = timedelta(hours=2) / period_duration
        self.assertAlmostEqual(result.aircraft_utilization, expected)

    def test_flight_straddling_period_start_is_clipped(self):
        # Starts 1h before the period, ends 1h into it -> only 1h counts.
        flight = make_flight(
            PERIOD_START - timedelta(hours=1), PERIOD_START + timedelta(hours=1),
        )
        output = make_output([
            {"resource": make_aircraft(), "activities": [flight]},
        ])
        result = compute_report_kpis(output, [], PERIOD_START, PERIOD_END)

        period_duration = PERIOD_END - PERIOD_START
        expected = timedelta(hours=1) / period_duration
        self.assertAlmostEqual(result.aircraft_utilization, expected)

    def test_maintenance_reduces_available_time(self):
        flight = make_flight(
            datetime(2025, 1, 2, 0, 0), datetime(2025, 1, 2, 2, 0),
        )
        maintenance = make_maintenance(
            "A1", datetime(2025, 1, 3, 0, 0), datetime(2025, 1, 3, 4, 0),
        )
        output = make_output([
            {"resource": make_aircraft(), "activities": [flight]},
        ])
        result = compute_report_kpis(output, [maintenance], PERIOD_START, PERIOD_END)

        period_duration = PERIOD_END - PERIOD_START
        available = period_duration - timedelta(hours=4)
        expected = timedelta(hours=2) / available
        self.assertAlmostEqual(result.aircraft_utilization, expected)

    def test_no_overlapping_activity_yields_none(self):
        output = make_output([
            {"resource": make_aircraft(), "activities": []},
            {"resource": "unassigned", "activities": []},
        ])
        result = compute_report_kpis(output, [], PERIOD_START, PERIOD_END)
        self.assertIsNone(result.aircraft_utilization)


class TestReFleeting(TestCase):
    def test_mismatched_actype_is_counted(self):
        flight = make_flight(
            datetime(2025, 1, 2, 0, 0), datetime(2025, 1, 2, 2, 0),
            aircraft_type="A321",
        )
        output = make_output([
            {"resource": make_aircraft(type_="A320"), "activities": [flight]},
        ])
        result = compute_report_kpis(output, [], PERIOD_START, PERIOD_END)
        self.assertEqual(result.num_refleeted, 1)

    def test_matching_actype_is_not_counted(self):
        flight = make_flight(
            datetime(2025, 1, 2, 0, 0), datetime(2025, 1, 2, 2, 0),
            aircraft_type="A320",
        )
        output = make_output([
            {"resource": make_aircraft(type_="A320"), "activities": [flight]},
        ])
        result = compute_report_kpis(output, [], PERIOD_START, PERIOD_END)
        self.assertEqual(result.num_refleeted, 0)

    def test_unassigned_bucket_is_never_counted(self):
        flight = make_flight(
            datetime(2025, 1, 2, 0, 0), datetime(2025, 1, 2, 2, 0),
            aircraft_type="A321",
        )
        output = make_output([
            {"resource": "unassigned", "activities": [flight]},
        ])
        result = compute_report_kpis(output, [], PERIOD_START, PERIOD_END)
        self.assertEqual(result.num_refleeted, 0)


class TestTurnTimeEvenness(TestCase):
    def test_evenly_spaced_turns_have_zero_variation(self):
        flights = [
            make_flight(datetime(2025, 1, 2, 0, 0), datetime(2025, 1, 2, 1, 0), flight_id="F1"),
            make_flight(datetime(2025, 1, 2, 2, 0), datetime(2025, 1, 2, 3, 0), flight_id="F2"),
            make_flight(datetime(2025, 1, 2, 4, 0), datetime(2025, 1, 2, 5, 0), flight_id="F3"),
        ]
        output = make_output([
            {"resource": make_aircraft(), "activities": flights},
        ])
        result = compute_report_kpis(output, [], PERIOD_START, PERIOD_END)
        self.assertAlmostEqual(result.turn_time_cv, 0.0)

    def test_fewer_than_two_turns_yields_none(self):
        flights = [
            make_flight(datetime(2025, 1, 2, 0, 0), datetime(2025, 1, 2, 1, 0), flight_id="F1"),
        ]
        output = make_output([
            {"resource": make_aircraft(), "activities": flights},
        ])
        result = compute_report_kpis(output, [], PERIOD_START, PERIOD_END)
        self.assertIsNone(result.turn_time_cv)


class TestNumUnassignedPassthrough(TestCase):
    def test_reads_num_unassigned_from_solution_kpis(self):
        output = make_output([], num_unassigned=3)
        result = compute_report_kpis(output, [], PERIOD_START, PERIOD_END)
        self.assertEqual(result.num_unassigned, 3)
