"""tesla-deep -- HTTP + WebSocket server.

Run:
    ./run.sh                          # simulator, no hardware needed
    ./run.sh --source elm --port /dev/tty.OBDLink-SPP
    ./run.sh --source socketcan --channel can0
"""
import argparse
import asyncio
import json
import logging
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import analytics
from decoder import Decoder
from sources import build_source
from store import HistoryLogger, VehicleState

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tesla-deep")

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

state = VehicleState()
decoder = Decoder()
history = HistoryLogger()
app = FastAPI(title="tesla-deep")

_reader_status = {"connected": False, "source": None, "error": None}


def reader_thread(source_name, port, channel):
    """Pull frames forever, decode, fold into state. Reconnects on failure."""
    _reader_status["source"] = source_name
    backoff = 1.0
    while True:
        try:
            source = build_source(source_name, port, channel)
            log.info("CAN source '%s' starting", source_name)
            _reader_status.update(connected=True, error=None)
            backoff = 1.0
            for ts, frame_id, data in source:
                decoded = decoder.decode(frame_id, data)
                state.update(frame_id, decoded, ts)
        except Exception as exc:  # noqa: BLE001
            _reader_status.update(connected=False, error=str(exc))
            log.error("CAN source failed: %s -- retrying in %.0fs", exc, backoff)
            time.sleep(backoff)
            backoff = min(30.0, backoff * 2)


def analysis_thread():
    """Recompute derived values and feed the logger, once a second."""
    while True:
        try:
            snap = analytics.snapshot(state.signals())
            now = time.time()
            state.track("max_discharge_kw", snap["power"]["max_discharge_kw"], now)
            state.track("hp_available", snap["power"]["hp_available"], now)
            state.track("soc", snap["battery"]["soc_ui"], now)
            state.track("pack_temp", snap["battery"]["temp_max_c"], now)
            state.track("total_torque_nm", snap["drivetrain"]["total_torque_nm"], now)
            state.track("stator_temp", snap["drivetrain"]["stator_temp_c"], now)
            history.watch_launch(snap)
            history.maybe_log(snap)
        except Exception as exc:  # noqa: BLE001
            log.warning("analysis tick failed: %s", exc)
        time.sleep(1.0)


# ---------------------------------------------------------------- API
@app.get("/api/snapshot")
def api_snapshot():
    snap = analytics.snapshot(state.signals())
    snap["stats"] = state.stats()
    snap["status"] = dict(_reader_status)
    snap["decoder"] = decoder.stats
    return JSONResponse(snap)


@app.get("/api/signals")
def api_signals(q: str = "", limit: int = 3000):
    """Every live signal, with its message and unit. This is the raw 2752."""
    sigs = state.signals()
    fresh = state.freshness()
    needle = q.lower().strip()
    out = []
    for name, value in sigs.items():
        if needle and needle not in name.lower():
            continue
        meta = decoder.signal_index.get(name, {})
        out.append({
            "name": name,
            "value": round(value, 4) if isinstance(value, float) else value,
            "unit": meta.get("unit"),
            "message": meta.get("message"),
            "frame_id": meta.get("frame_id"),
            "comment": meta.get("comment"),
            "age_s": fresh.get(name),
        })
    out.sort(key=lambda d: (d["message"] or "", d["name"]))
    return JSONResponse({"count": len(out), "signals": out[:limit],
                         "total_known": len(decoder.signal_index)})


@app.get("/api/history/{name}")
def api_history(name: str):
    return JSONResponse({"name": name, "points": state.history(name)})


@app.get("/api/degradation")
def api_degradation():
    return JSONResponse({"trend": history.degradation_trend()})


@app.get("/api/launches")
def api_launches():
    return JSONResponse({"launches": history.recent_launches()})


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            snap = analytics.snapshot(state.signals())
            snap["stats"] = state.stats()
            snap["status"] = dict(_reader_status)
            snap["series"] = {
                "max_discharge_kw": state.history("max_discharge_kw")[-120:],
                "total_torque_nm": state.history("total_torque_nm")[-120:],
                "soc": state.history("soc")[-120:],
                "pack_temp": state.history("pack_temp")[-120:],
                "stator_temp": state.history("stator_temp")[-120:],
            }
            await websocket.send_text(json.dumps(snap))
            await asyncio.sleep(0.25)
    except (WebSocketDisconnect, RuntimeError):
        pass


# ---------------------------------------------------------------- static
@app.get("/")
def index():
    return FileResponse(WEB_DIR / "index.html")


app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(WEB_DIR / "static" / "manifest.webmanifest",
                        media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    # Must be served from root scope to control the whole app.
    return FileResponse(WEB_DIR / "static" / "sw.js",
                        media_type="application/javascript")


def main():
    ap = argparse.ArgumentParser(description="tesla-deep telemetry server")
    ap.add_argument("--source", default="sim",
                    choices=["sim", "elm", "socketcan", "slcan"])
    ap.add_argument("--port", help="serial port for elm/slcan")
    ap.add_argument("--channel", help="interface for socketcan (default can0)")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--http-port", type=int, default=8383)
    args = ap.parse_args()

    threading.Thread(target=reader_thread,
                     args=(args.source, args.port, args.channel),
                     daemon=True).start()
    threading.Thread(target=analysis_thread, daemon=True).start()

    log.info("DBC loaded: %s", decoder.stats)
    log.info("open http://localhost:%d", args.http_port)

    import uvicorn
    uvicorn.run(app, host=args.host, port=args.http_port, log_level="warning")


if __name__ == "__main__":
    main()
