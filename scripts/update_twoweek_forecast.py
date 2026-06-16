#!/usr/bin/env python3
"""Update the public JMA two-week temperature forecast JSON.

This script is intentionally self-contained for the public static-site repo.
It reads station metadata from the published climatology JSON and does not
need the private workspace, SQLite files, or raw JMA caches.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import json
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CLIMATOLOGY = ROOT / "data/climatology_index_1996_2025_s_stations.json"
DEFAULT_OUT = ROOT / "data/twoweek_latest_s_stations.json"
BASE_URL = "https://www.data.jma.go.jp/cpd/twoweek/data/Latest/data_{block_no}.json"
USER_AGENT = "NatureWxLab-TemperatureRiskNavi/1.0 (+https://note.com/nature_wx_lab)"


def load_stations(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    stations = data.get("stations", [])
    if not isinstance(stations, list):
        raise ValueError(f"invalid stations in {path}")
    return [
        {
            "station_key": str(station["station_key"]),
            "block_no": str(station["block_no"]),
            "name": str(station["name"]),
        }
        for station in stations
        if station.get("station_key") and station.get("block_no")
    ]


def date_key(row: dict[str, Any]) -> str:
    return f"{int(row['mm']):02d}-{int(row['dd']):02d}"


def compact_forecast(rows: list[dict[str, Any]], elem: int) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for row in rows:
        if int(row.get("elem", -1)) != elem:
            continue
        result.append(
            {
                "date": f"{int(row['yy']):04d}-{int(row['mm']):02d}-{int(row['dd']):02d}",
                "day_key": date_key(row),
                "value": row.get("fcst"),
                "lower": row.get("lower"),
                "upper": row.get("upper"),
                "normal": row.get("nrm"),
                "rank": row.get("rank"),
            }
        )
    return result


def parse_forecast(data: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(data, dict) or "reportDate" not in data:
        return None
    report = data["reportDate"]
    rows = list(data.get("wk1", [])) + list(data.get("wk2", []))
    report_date = (
        f"{int(report['yy']):04d}-{int(report['mm']):02d}-{int(report['dd']):02d}"
        f"T{int(report['hh']):02d}:00:00+09:00"
    )
    return {
        "block_no": str(data.get("No")),
        "report_date": report_date,
        "max": compact_forecast(rows, 2),
        "min": compact_forecast(rows, 3),
    }


def fetch_station(station: dict[str, str], timeout: float, user_agent: str) -> tuple[str, dict[str, Any] | None, str | None]:
    url = BASE_URL.format(block_no=station["block_no"])
    request = Request(url, headers={"User-Agent": user_agent})
    try:
        with urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                return station["station_key"], None, f"HTTP {response.status}"
            data = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        return station["station_key"], None, str(error)

    parsed = parse_forecast(data)
    if parsed is None:
        return station["station_key"], None, "invalid forecast payload"
    parsed["station_key"] = station["station_key"]
    parsed["name"] = station["name"]
    return station["station_key"], parsed, None


def build_payload(stations: list[dict[str, str]], max_workers: int, timeout: float, user_agent: str) -> dict[str, Any]:
    station_payload: dict[str, Any] = {}
    skipped: list[str] = []
    errors: dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(fetch_station, station, timeout, user_agent): station
            for station in stations
        }
        for future in as_completed(futures):
            station_key, parsed, error = future.result()
            if parsed is None:
                skipped.append(station_key)
                if error:
                    errors[station_key] = error
                continue
            station_payload[station_key] = parsed

    ordered_payload = {
        station["station_key"]: station_payload[station["station_key"]]
        for station in stations
        if station["station_key"] in station_payload
    }
    skipped_set = set(skipped)
    skipped_sorted = [
        station["station_key"]
        for station in stations
        if station["station_key"] in skipped_set
    ]
    return {
        "meta": {
            "source": "気象庁 2週間気温予報 data/Latest JSON",
            "generated_at": datetime.now(ZoneInfo("Asia/Tokyo")).isoformat(timespec="seconds"),
            "station_count": len(ordered_payload),
            "skipped_station_count": len(skipped_sorted),
            "skipped_station_keys": skipped_sorted,
            "errors": errors,
            "note": "前半は日別予報、後半は2週間気温予報由来の値。更新で内容が変わる。",
            "updater": "public/weather-climatology/scripts/update_twoweek_forecast.py",
        },
        "stations": ordered_payload,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--climatology", type=Path, default=DEFAULT_CLIMATOLOGY)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--max-workers", type=int, default=6)
    parser.add_argument("--timeout", type=float, default=20.0)
    parser.add_argument("--user-agent", default=USER_AGENT)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    stations = load_stations(args.climatology)
    payload = build_payload(
        stations=stations,
        max_workers=max(1, args.max_workers),
        timeout=args.timeout,
        user_agent=args.user_agent,
    )
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.dry_run:
        print(json.dumps(payload["meta"], ensure_ascii=False, indent=2))
        return
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out}")
    print(json.dumps(payload["meta"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
