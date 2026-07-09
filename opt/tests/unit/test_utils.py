from datetime import timedelta
from unittest import TestCase

from utils import timedelta_to_hhmm

class TestUtils(TestCase):
    def test_timedelta_to_hhmm(self):
        self.assertEqual(
            timedelta_to_hhmm(timedelta(hours=1, minutes=30)),
            "01:30",
        )
        self.assertEqual(
            timedelta_to_hhmm(timedelta(hours=0, minutes=5)),
            "00:05",
        )
        self.assertEqual(
            timedelta_to_hhmm(timedelta(hours=10, minutes=0)),
            "10:00",
        )
        self.assertEqual(
            timedelta_to_hhmm(timedelta(hours=0, minutes=0)),
            "00:00",
        )
        self.assertEqual(
            timedelta_to_hhmm(timedelta(hours=100, minutes=59)),
            "100:59",
        )
        self.assertEqual(
            timedelta_to_hhmm(timedelta(hours=0, minutes=123)),
            "02:03",
        )
        self.assertEqual(
            timedelta_to_hhmm(timedelta(hours=-1)),
            "-01:00",
        )