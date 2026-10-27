"""Where CAN frames come from.

Four interchangeable sources, chosen with --source:

  sim       a physics-flavoured simulator. No hardware. Use it to learn the app,
            develop against it, and see what a launch looks like before you buy
            a cable.
  elm       an ELM327/STN-class dongle on a serial or Bluetooth port. This is the
            path for a 2019 Model 3 via the 26-pin adapter. STN chips (OBDLink)
            are strongly preferred -- cheap ELM clones drop frames badly at the
            Model 3's traffic rates.
  socketcan a proper CAN interface on Linux (e.g. a Raspberry Pi hat). Best data
            quality by a wide margin.
  slcan     a serial-line CAN adapter (CANable, CANtact).

Every source is an iterator yielding (timestamp, frame_id:int, data:bytes).
"""
import math
import random
import time
import logging

log = logging.getLogger(__name__)


# --------------------------------------------------------------------------
# Simulator
# --------------------------------------------------------------------------
class SimulatorSource:
    """Synthesises a plausible P3D on a back road, including a launch every ~40s.

    It models the things this app exists to show: the pack warming up, SOC
    bleeding down, discharge power sagging when cold or low, and the drive unit
    raising thermal limit flags after repeated hard launches.
    """

    def __init__(self, scenario: str = "drive"):
        self.t0 = time.time()
        self.scenario = scenario
        # Starting conditions: a cold-ish car with a half-full pack, i.e. exactly
        # the state in which owners complain their Tesla "feels slow".
        self.soc = 62.0
        self.pack_temp = 18.0
        self.stator_temp = 25.0
        self.rotor_temp = 25.0
        self.igbt_temp = 30.0
        self.speed = 0.0
        self.odometer = 91_450.0
        self.launching = False
        self._launch_end = 0.0

    def _tick(self, dt):
        now = time.time() - self.t0
        # Launch for 4s out of every 40s.
        phase = now % 40.0
        self.launching = phase < 4.0

        if self.launching:
            self.speed = min(160.0, self.speed + 38.0 * dt)
            # Hard use heats everything fast and drains the pack.
            self.stator_temp += 9.0 * dt
            self.rotor_temp += 7.5 * dt
            self.igbt_temp += 11.0 * dt
            self.pack_temp += 0.9 * dt
            self.soc -= 0.012
        else:
            self.speed = max(35.0, self.speed - 16.0 * dt)
            self.stator_temp -= 1.6 * dt
            self.rotor_temp -= 1.3 * dt
            self.igbt_temp -= 2.4 * dt
            # Pack slowly warms from use, tending toward its happy window.
            self.pack_temp += (0.25 if self.pack_temp < 38 else -0.1) * dt
            self.soc -= 0.0012

        self.stator_temp = max(20.0, self.stator_temp)
        self.rotor_temp = max(20.0, self.rotor_temp)
        self.igbt_temp = max(25.0, self.igbt_temp)
        self.soc = max(3.0, self.soc)
        self.odometer += self.speed * dt / 3600.0

    def _max_discharge_kw(self):
        """The number the whole app revolves around: what the BMS will allow now.

        Modelled on community dyno data -- SOC and pack temperature dominate,
        and they compound.
        """
        base = 462.0
        # SOC term: flat above 75%, falls away steeply below.
        if self.soc >= 75:
            soc_factor = 1.0
        elif self.soc >= 45:
            soc_factor = 1.0 - (75 - self.soc) * 0.0043   # ~64 hp lost 75->45
        else:
            soc_factor = 0.871 - (45 - self.soc) * 0.010
        # Thermal term: a cold pack simply cannot push current.
        if self.pack_temp >= 30:
            temp_factor = 1.0
        elif self.pack_temp >= 10:
            temp_factor = 0.62 + (self.pack_temp - 10) * 0.019
        else:
            temp_factor = 0.45
        return max(80.0, base * max(0.25, soc_factor) * temp_factor)

    def __iter__(self):
        last = time.time()
        while True:
            now = time.time()
            dt = now - last
            last = now
            self._tick(dt)

            max_dis = self._max_discharge_kw()
            pack_v = 350.0 + (self.soc / 100.0) * 50.0
            demand_kw = max_dis * 0.96 if self.launching else 14.0 + random.random() * 6
            pack_a = demand_kw * 1000.0 / pack_v

            # 0x252 BMS_powerAvailable -- maxRegenPower | maxDischargePower
            yield (now, 0x252, _pack_u16(int(min(70.0, 70.0) / 0.01), int(max_dis / 0.013)))
            # 0x132 HVBattAmpVolt
            yield (now, 0x132, _hv_amp_volt(pack_v, pack_a))
            # 0x292 BMS_SOC
            yield (now, 0x292, _bms_soc(self.soc))
            # 0x352 BMS_energyStatus -- the degradation source
            yield (now, 0x352, _bms_energy(self.soc))
            # 0x332 BattBrickMinMax (alternating mux: temps / voltages)
            yield (now, 0x332, _brick_minmax(self.pack_temp, self.soc,
                                             mux=int(now * 2) % 2))
            # 0x1D6 DI_limits -- the star of the show
            yield (now, 0x1D6, _di_limits(self))
            # 0x1D8 RearTorque / 0x1D5 FrontTorque
            rear_nm = 620.0 if self.launching else 40.0
            front_nm = 180.0 if self.launching else 15.0
            yield (now, 0x1D8, _torque(rear_nm))
            yield (now, 0x1D5, _torque(front_nm))
            # 0x315 RearInverterTemps
            yield (now, 0x315, _inv_temps(self.stator_temp, self.igbt_temp))
            # 0x3FE brake temps -- they climb when you actually use the car
            yield (now, 0x3FE, _brake_temps(45.0 + self.speed * 0.9))
            # 0x3B6 odometer
            yield (now, 0x3B6, _odo(self.odometer))
            # 0x257 DIspeed
            yield (now, 0x257, _speed(self.speed))
            # 0x31F TPMS
            yield (now, 0x31F, _tpms(28.0 + self.speed * 0.08))

            time.sleep(0.1)


# ---- little-endian bit packing helpers for the simulator -------------------
def _u(val, bits):
    """Clamp to a bit width, two's-complementing negatives.

    The previous version clamped negatives to zero, which silently destroyed
    every signed signal on the bus -- currents and torques read as 0 rather
    than failing loudly.
    """
    v = int(round(val))
    mask = (1 << bits) - 1
    if v < 0:
        v = (1 << bits) + v
    return max(0, min(mask, v))


def _pack_bits(fields, length=8):
    """fields: list of (start_bit, bit_length, unsigned_value). Little-endian."""
    raw = 0
    for start, nbits, value in fields:
        raw |= (_u(value, nbits) & ((1 << nbits) - 1)) << start
    return raw.to_bytes(length, "little")


def _pack_u16(regen_raw, discharge_raw):
    return _pack_bits([(0, 16, regen_raw), (16, 16, discharge_raw)], 8)


def _hv_amp_volt(volts, amps):
    """0x132: BattVoltage132 @bit0 (0.01 V/bit, unsigned),
    SmoothBattCurrent132 @bit16 (signed, scale -0.1 A/bit).

    The negative scale means a discharge reads as a negative physical value,
    which is the convention the rest of the app expects.
    """
    raw_current = amps * 10          # (-amps) / (-0.1)
    return _pack_bits([(0, 16, volts / 0.01), (16, 16, raw_current)], 8)


def _bms_soc(soc):
    return _pack_bits([
        (0, 10, soc / 0.1),        # SOCmin292
        (10, 10, soc / 0.1),       # SOCUI292
        (20, 10, (soc + 0.6) / 0.1),  # SOCmax292
        (30, 10, soc / 0.1),       # SOCave292
    ], 8)


def _bms_energy(soc):
    # A 7-year-old P3D pack: ~72.4 kWh nominal full vs 78.3 when new (~7.5% down).
    full = 72.4
    remaining = full * soc / 100.0
    return _pack_bits([
        (0, 11, full / 0.1),
        (11, 11, remaining / 0.1),
        (22, 11, remaining * 0.98 / 0.1),
        (33, 11, remaining * 1.01 / 0.1),
    ], 8)


def _brick_minmax(pack_temp, soc, mux):
    cell_v = 3.45 + (soc / 100.0) * 0.65
    if mux == 0:
        return _pack_bits([
            (0, 2, 0),
            (16, 8, (pack_temp + 1.5 + 40) / 0.5),
            (24, 8, (pack_temp - 1.5 + 40) / 0.5),
            (32, 8, (pack_temp + 1.0 + 40) / 0.5),
            (40, 8, (pack_temp - 1.0 + 40) / 0.5),
        ], 8)
    return _pack_bits([
        (0, 2, 1),
        (2, 12, (cell_v + 0.011) / 0.002),
        (16, 12, (cell_v - 0.012) / 0.002),
        (32, 7, 42),
        (40, 7, 77),
    ], 8)


def _di_limits(sim):
    """Set the limit bits the real drive unit would set under these conditions."""
    bits = []
    if sim.pack_temp < 25 or sim.soc < 55:
        bits += [(6, 1, 1), (16, 1, 1)]      # DischargePower, IBat
    if sim.soc < 45:
        bits.append((18, 1, 1))              # VBatLow
    if sim.stator_temp > 110:
        bits.append((2, 1, 1))               # StatorTemp
    if sim.rotor_temp > 120:
        bits.append((36, 1, 1))              # RotorTemp
    if sim.igbt_temp > 95:
        bits.append((24, 1, 1))              # IGBTJunctTemp
    if sim.launching and random.random() < 0.25:
        bits.append((12, 1, 1))              # TCDrive
    return _pack_bits(bits, 5)


def _torque(nm):
    raw = int(nm / 0.222) & 0x1FFF
    return _pack_bits([(8, 13, raw), (21, 13, raw)], 8)


def _inv_temps(stator, inverter):
    """0x315: PCB@0, Inverter@8, Stator@16, Capbank@24, Heatsink@32,
    PctInverter@40 (0.4%/bit), PctStator@48 (0.4%/bit)."""
    return _pack_bits([
        (0, 8, inverter - 6 + 40),
        (8, 8, inverter + 40),
        (16, 8, stator + 40),
        (24, 8, inverter - 10 + 40),
        (32, 8, inverter - 4 + 40),
        (40, 8, min(102, inverter / 125.0 * 100) / 0.4),
        (48, 8, min(102, stator / 150.0 * 100) / 0.4),
    ], 8)


def _odo(km):
    return _pack_bits([(0, 32, km / 0.001)], 4)


def _speed(kph):
    return _pack_bits([(12, 12, (kph + 40) / 0.08), (24, 9, kph)], 8)


def _tpms(tyre_temp=32.0):
    """0x31F: pressure (0.025 bar/bit) and temp interleaved, one byte each."""
    base = 2.88
    fields = []
    for i in range(4):
        pressure = base + random.uniform(-0.05, 0.05)
        fields.append((i * 16, 8, pressure / 0.025))
        fields.append((i * 16 + 8, 8, tyre_temp + random.uniform(-2, 2) + 40))
    return _pack_bits(fields, 8)


def _brake_temps(t):
    """0x3FE: four 10-bit brake temperatures, offset -40."""
    return _pack_bits([
        (0, 10, t + 40), (10, 10, t + 40),
        (20, 10, t * 0.8 + 40), (30, 10, t * 0.8 + 40),
    ], 5)


# --------------------------------------------------------------------------
# ELM327 / STN serial dongle  (the real-hardware path for a 2019 Model 3)
# --------------------------------------------------------------------------
class Elm327Source:
    """Raw CAN monitoring over an ELM327/STN dongle.

    The Model 3 vehicle bus is 11-bit CAN at 500 kbit/s. We put the dongle into
    a raw monitor-all mode with headers on and formatting off, then parse the
    'IIILDDDDDDDDDDDDDDDD' lines it spits out.

    Reality check: a genuine STN chip (OBDLink MX+/LX/CX) keeps up. Cheap ELM327
    clones silently drop a large fraction of frames at Model 3 bus load, which
    makes the dashboard look laggy and wrong rather than obviously broken.
    """

    def __init__(self, port: str, baudrate: int = 500000):
        self.port = port
        self.baudrate = baudrate

    def _cmd(self, ser, cmd, wait=0.3):
        ser.write((cmd + "\r").encode())
        time.sleep(wait)
        return ser.read_all().decode(errors="ignore")

    def __iter__(self):
        import serial  # imported lazily so sim mode needs no pyserial

        ser = serial.Serial(self.port, self.baudrate, timeout=1)
        time.sleep(1.0)
        for cmd in ("ATZ", "ATE0", "ATL0", "ATS0", "ATH1", "ATCAF0", "ATSP6"):
            log.info("dongle <- %s : %s", cmd, self._cmd(ser, cmd).strip())
        # STN chips: STMA is a far better monitor-all than ELM's ATMA.
        probe = self._cmd(ser, "STI")
        monitor = "STMA" if "STN" in probe.upper() else "ATMA"
        log.info("dongle identified as %s, monitoring with %s",
                 probe.strip() or "ELM327-compatible", monitor)
        ser.write((monitor + "\r").encode())

        buf = ""
        while True:
            chunk = ser.read(256).decode(errors="ignore")
            if not chunk:
                continue
            buf += chunk
            while "\r" in buf:
                line, buf = buf.split("\r", 1)
                parsed = _parse_elm_line(line.strip())
                if parsed:
                    yield (time.time(), parsed[0], parsed[1])


def _parse_elm_line(line):
    """'1D6 5 0011223344' or '1D6 0011223344' -> (0x1D6, b'...')."""
    line = line.replace(" ", "")
    if len(line) < 5 or not all(c in "0123456789ABCDEFabcdef" for c in line):
        return None
    try:
        frame_id = int(line[:3], 16)
        payload = line[3:]
        # Some firmwares insert a single-hex-digit DLC after the header.
        if len(payload) % 2 == 1:
            payload = payload[1:]
        return frame_id, bytes.fromhex(payload)
    except ValueError:
        return None


# --------------------------------------------------------------------------
# python-can backed sources (socketcan on Linux, slcan for CANable/CANtact)
# --------------------------------------------------------------------------
class PythonCanSource:
    def __init__(self, interface: str, channel: str, bitrate: int = 500000):
        self.interface, self.channel, self.bitrate = interface, channel, bitrate

    def __iter__(self):
        import can  # lazy import

        bus = can.interface.Bus(channel=self.channel, interface=self.interface,
                                bitrate=self.bitrate)
        for msg in bus:
            if not msg.is_extended_id:
                yield (msg.timestamp, msg.arbitration_id, bytes(msg.data))


def build_source(name: str, port: str = None, channel: str = None):
    if name == "sim":
        return SimulatorSource()
    if name == "elm":
        if not port:
            raise SystemExit("--port is required for --source elm "
                             "(e.g. /dev/tty.OBDLink or COM5)")
        return Elm327Source(port)
    if name == "socketcan":
        return PythonCanSource("socketcan", channel or "can0")
    if name == "slcan":
        if not port:
            raise SystemExit("--port is required for --source slcan")
        return PythonCanSource("slcan", port)
    raise SystemExit(f"unknown source: {name}")
