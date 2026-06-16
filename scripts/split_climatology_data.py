#!/usr/bin/env python3
"""Split the public climatology JSON into a light index and station files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data/climatology_1996_2025_s_stations.json"
DEFAULT_INDEX = ROOT / "data/climatology_index_1996_2025_s_stations.json"
DEFAULT_STATION_DIR = ROOT / "data/stations"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def split_payload(source: Path, index_path: Path, station_dir: Path) -> None:
    data = json.loads(source.read_text(encoding="utf-8"))
    stations = data.get("stations", [])
    current_year = data.get("current_year", {})

    index_payload = {
        "meta": {
            **data.get("meta", {}),
            "data_mode": "split_by_station",
            "station_data_path": "data/stations/{station_key}.json",
        },
        "days": data.get("days", []),
        "stations": stations,
        "current_year": {
            "year": current_year.get("year"),
            "latest_date": current_year.get("latest_date"),
        },
    }
    write_json(index_path, index_payload)

    station_dir.mkdir(parents=True, exist_ok=True)
    for old_file in station_dir.glob("*.json"):
        old_file.unlink()

    stats = data.get("stats", {})
    years = data.get("years", {})
    current_stations = current_year.get("stations", {})
    for station in stations:
        station_key = station["station_key"]
        station_payload = {
            "station_key": station_key,
            "stats": stats.get(station_key, {}),
            "years": years.get(station_key, {}),
            "current_year": current_stations.get(station_key),
        }
        write_json(station_dir / f"{station_key}.json", station_payload)

    print(f"wrote {index_path}")
    print(f"wrote {len(stations)} station files to {station_dir}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--station-dir", type=Path, default=DEFAULT_STATION_DIR)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    split_payload(args.source, args.index, args.station_dir)


if __name__ == "__main__":
    main()
