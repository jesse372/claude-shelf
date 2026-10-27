"""Live signal state + long-term logging.

Two jobs:
  1. Hold the latest value of every signal seen on the bus, so the dashboard can
     render instantly rather than waiting for a slow message to repeat.
  2. Write periodic snapshots to SQLite, because the genuinely interesting
     Tesla questions -- how fast is my pack degrading, is cell spread widening,
     is my car slower than it was last winter -- are only answerable with history.
"""
import sqlite3
import threading
import time
from collections import defaultdict, deque
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "history.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    ts               REAL PRIMARY KEY,
    soc              REAL,
    nominal_full_kwh REAL,
    max_discharge_kw REAL,
    pack_temp_c      REAL,
    brick_spread_mv  REAL,
    brick_v_min      REAL,
    brick_v_max      REAL,
    odometer_km      REAL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts);

CREATE TABLE IF NOT EXISTS launches (
    ts               REAL PRIMARY KEY,
    peak_kw          REAL,
    peak_hp          REAL,
    soc              REAL,
    pack_temp_c      REAL,
    stator_temp_c    REAL,
    pct_of_potential REAL
);
"""


class VehicleState:
    """Thread-safe latest-value store for every decoded signal."""

    def __init__(self, history_len: int = 600):
        self._lock = threading.Lock()
        self._signals = {}
        self._seen_at = {}
        self._msg_counts = defaultdict(int)
        self._frames = 0
        self._started = time.time()
        self._history = defaultdict(lambda: deque(maxlen=history_len))

    def update(self, frame_id: int, decoded: dict, ts: float):
        if not decoded:
            return
        with self._lock:
            self._frames += 1
            self._msg_counts[frame_id] += 1
            for name, value in decoded.items():
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    continue
                self._signals[name] = value
                self._seen_at[name] = ts

    def track(self, name: str, value, ts: float):
        """Record a derived value into the rolling history (for sparklines)."""
        if value is None:
            return
        with self._lock:
            self._history[name].append((ts, value))

    def signals(self) -> dict:
        with self._lock:
            return dict(self._signals)

    def history(self, name: str):
        with self._lock:
            return list(self._history.get(name, ()))

    def stats(self) -> dict:
        with self._lock:
            uptime = max(1e-6, time.time() - self._started)
            return {
                "frames": self._frames,
                "frames_per_sec": round(self._frames / uptime, 1),
                "unique_messages": len(self._msg_counts),
                "live_signals": len(self._signals),
                "uptime_s": round(uptime, 1),
            }

    def freshness(self) -> dict:
        now = time.time()
        with self._lock:
            return {n: round(now - t, 2) for n, t in self._seen_at.items()}


class HistoryLogger:
    """Periodic SQLite snapshots + automatic launch detection."""

    def __init__(self, db_path: Path = DB_PATH, interval_s: float = 60.0):
        self.db_path = db_path
        self.interval_s = interval_s
        self._last_write = 0.0
        self._peak_kw = 0.0
        self._in_launch = False
        self._launch_start = 0.0
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.executescript(SCHEMA)

    def _conn(self):
        return sqlite3.connect(self.db_path, timeout=5)

    def maybe_log(self, snap: dict):
        now = time.time()
        if now - self._last_write < self.interval_s:
            return
        self._last_write = now
        b, p, d = snap["battery"], snap["power"], snap["drivetrain"]
        pack_temp = None
        if b["temp_max_c"] is not None and b["temp_min_c"] is not None:
            pack_temp = (b["temp_max_c"] + b["temp_min_c"]) / 2
        try:
            with self._conn() as c:
                c.execute(
                    "INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?,?,?,?,?,?)",
                    (now, b["soc_ui"], b["nominal_full_kwh"], p["max_discharge_kw"],
                     pack_temp, b["brick_spread_mv"], b["brick_v_min"],
                     b["brick_v_max"], d["odometer_km"]))
        except sqlite3.Error:
            pass

    def watch_launch(self, snap: dict):
        """Detect a hard acceleration event and record how good it actually was.

        Over time this builds the honest answer to 'is my car getting slower?'
        """
        d, p, b = snap["drivetrain"], snap["power"], snap["battery"]
        total_nm = d.get("total_torque_nm") or 0
        hard = total_nm > 400

        if hard and not self._in_launch:
            self._in_launch = True
            self._launch_start = time.time()
            self._peak_kw = 0.0

        if self._in_launch:
            volts = p.get("pack_volts") or 0
            amps = abs(p.get("pack_amps") or 0)
            self._peak_kw = max(self._peak_kw, volts * amps / 1000.0)

        if self._in_launch and not hard:
            self._in_launch = False
            if self._peak_kw > 50:
                pack_temp = None
                if b["temp_max_c"] is not None and b["temp_min_c"] is not None:
                    pack_temp = (b["temp_max_c"] + b["temp_min_c"]) / 2
                try:
                    with self._conn() as c:
                        c.execute(
                            "INSERT OR REPLACE INTO launches VALUES (?,?,?,?,?,?,?)",
                            (self._launch_start, round(self._peak_kw, 1),
                             round(self._peak_kw * 1.34102), b["soc_ui"], pack_temp,
                             d.get("stator_temp_c"), p.get("pct_of_potential")))
                except sqlite3.Error:
                    pass

    def degradation_trend(self, limit: int = 500):
        try:
            with self._conn() as c:
                rows = c.execute(
                    "SELECT ts, nominal_full_kwh, odometer_km, brick_spread_mv "
                    "FROM snapshots WHERE nominal_full_kwh IS NOT NULL "
                    "ORDER BY ts DESC LIMIT ?", (limit,)).fetchall()
        except sqlite3.Error:
            return []
        return [{"ts": r[0], "nominal_full_kwh": r[1], "odometer_km": r[2],
                 "brick_spread_mv": r[3]} for r in reversed(rows)]

    def recent_launches(self, limit: int = 50):
        try:
            with self._conn() as c:
                rows = c.execute(
                    "SELECT ts, peak_kw, peak_hp, soc, pack_temp_c, stator_temp_c, "
                    "pct_of_potential FROM launches ORDER BY ts DESC LIMIT ?",
                    (limit,)).fetchall()
        except sqlite3.Error:
            return []
        keys = ["ts", "peak_kw", "peak_hp", "soc", "pack_temp_c",
                "stator_temp_c", "pct_of_potential"]
        return [dict(zip(keys, r)) for r in rows]
