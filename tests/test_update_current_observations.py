import importlib.util
import sys
import unittest
from datetime import date
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "update_current_observations.py"
SPEC = importlib.util.spec_from_file_location("update_current_observations", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FreshnessPolicyTests(unittest.TestCase):
    def stations(self, count: int) -> list:
        return [
            MODULE.Station(
                station_key=f"station-{index}",
                prec_no="01",
                block_no=str(index),
                name=f"地点{index}",
            )
            for index in range(count)
        ]

    def test_accepts_one_explicit_official_missing_station(self) -> None:
        stations = self.stations(156)
        latest_dates = {station.station_key: "2026-08-29" for station in stations}
        latest_dates["station-55"] = "2026-08-27"
        fetched = {
            "station-55": {8: {29: {"max": None, "min": None}}},
        }

        freshness = MODULE.evaluate_freshness(
            stations,
            fetched,
            latest_dates,
            date(2026, 8, 29),
        )

        self.assertTrue(freshness["freshness_ok"])
        self.assertEqual(freshness["freshness_status"], "official_missing_within_limit")
        self.assertEqual(freshness["fresh_station_count"], 155)
        self.assertEqual(freshness["official_missing_station_count"], 1)
        self.assertEqual(freshness["allowed_official_missing_station_count"], 2)

    def test_missing_required_row_remains_a_hard_failure(self) -> None:
        stations = self.stations(3)
        latest_dates = {station.station_key: "2026-08-29" for station in stations}
        latest_dates["station-1"] = "2026-08-28"

        freshness = MODULE.evaluate_freshness(
            stations,
            {},
            latest_dates,
            date(2026, 8, 29),
        )

        self.assertFalse(freshness["freshness_ok"])
        self.assertEqual(freshness["freshness_status"], "stale")
        self.assertEqual(freshness["official_missing_station_count"], 0)

    def test_too_many_official_missing_stations_remain_a_hard_failure(self) -> None:
        stations = self.stations(156)
        latest_dates = {station.station_key: "2026-08-29" for station in stations}
        fetched = {}
        for index in range(3):
            station_key = f"station-{index}"
            latest_dates[station_key] = "2026-08-28"
            fetched[station_key] = {8: {29: {"max": None, "min": None}}}

        freshness = MODULE.evaluate_freshness(
            stations,
            fetched,
            latest_dates,
            date(2026, 8, 29),
        )

        self.assertFalse(freshness["freshness_ok"])
        self.assertEqual(freshness["freshness_status"], "stale")
        self.assertEqual(freshness["official_missing_station_count"], 3)
        self.assertEqual(freshness["allowed_official_missing_station_count"], 2)

    def test_complete_freshness_is_success(self) -> None:
        stations = self.stations(2)
        latest_dates = {station.station_key: "2026-08-29" for station in stations}

        freshness = MODULE.evaluate_freshness(
            stations,
            {},
            latest_dates,
            date(2026, 8, 29),
        )

        self.assertTrue(freshness["freshness_ok"])
        self.assertEqual(freshness["freshness_status"], "complete")
        self.assertEqual(freshness["fresh_station_count"], 2)


if __name__ == "__main__":
    unittest.main()
