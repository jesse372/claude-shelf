"""DBC-backed CAN frame decoder.

Wraps cantools around joshwardell/model3dbc -- 159 messages, 2752 signals of
reverse-engineered Model 3 bus traffic. Tesla publishes none of this; it exists
because the community decoded it. It is not guaranteed correct for your firmware,
which is why every value in this app is presented as observed, not authoritative.
"""
import logging
from pathlib import Path

import cantools

log = logging.getLogger(__name__)

DBC_PATH = Path(__file__).resolve().parent.parent / "data" / "Model3CAN.dbc"


class Decoder:
    def __init__(self, dbc_path: Path = DBC_PATH):
        self.db = cantools.database.load_file(str(dbc_path))
        self._by_id = {m.frame_id: m for m in self.db.messages}
        # Signal name -> the message that carries it (for the raw explorer).
        self.signal_index = {}
        for msg in self.db.messages:
            for sig in msg.signals:
                self.signal_index.setdefault(sig.name, {
                    "message": msg.name,
                    "frame_id": msg.frame_id,
                    "unit": sig.unit,
                    "minimum": sig.minimum,
                    "maximum": sig.maximum,
                    "comment": sig.comment,
                })
        self._warned = set()

    @property
    def stats(self):
        return {
            "messages": len(self.db.messages),
            "signals": len(self.signal_index),
            "dbc": DBC_PATH.name,
        }

    def knows(self, frame_id: int) -> bool:
        return frame_id in self._by_id

    def decode(self, frame_id: int, data: bytes) -> dict:
        """Decode one frame to {signal_name: value}. Never raises."""
        msg = self._by_id.get(frame_id)
        if msg is None:
            return {}
        try:
            # allow_truncated copes with short frames; multiplexed messages that
            # do not match a selector simply yield fewer signals.
            return msg.decode(data, decode_choices=False, allow_truncated=True)
        except Exception as exc:  # noqa: BLE001 - a bad frame must never kill the stream
            if frame_id not in self._warned:
                self._warned.add(frame_id)
                log.debug("undecodable frame 0x%03X: %s", frame_id, exc)
            return {}
