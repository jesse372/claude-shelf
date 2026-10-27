"""Vehicle profile + tuning constants.

Everything here is specific to a 2019 Tesla Model 3 Performance (P3D, "Raven"-era
pre-refresh, 26-pin diagnostic connector, LG/Panasonic 2170 pack).

Sources for the reference numbers are cited in docs/POWER.md. Where a number is a
community-measured observation rather than a Tesla specification, it says so.
"""

VEHICLE = {
    "name": "2019 Model 3 Performance",
    "code": "P3D",
    "model_year": 2019,
    # Tesla's published figures for the 2019 P3D.
    "rated_power_kw": 377,          # ~450 hp combined motor output
    "rated_0_100_s": 3.4,           # 3.2s with Performance Upgrade package
    "drive": "AWD dual motor",
    # Front: induction (IPM-less) / Rear: permanent magnet. The rear does the heavy lifting.
    "front_motor": "Induction",
    "rear_motor": "Permanent magnet synchronous (PMSR)",
}

# --- Battery pack reference -------------------------------------------------
# BMS_nominalFullPackEnergy as read on a healthy, new 2019 LR/Performance pack.
# Your car's current value divided by this is the real degradation figure --
# far more honest than the rated-range estimate the touchscreen shows.
PACK_NOMINAL_NEW_KWH = 78.3
PACK_SERIES_GROUPS = 96          # 96 series "bricks" in a Model 3 LR/P pack

# --- Power ceiling ----------------------------------------------------------
# Best-case BMS_maxDischargePower observed on a healthy P3D: fully preconditioned
# pack, >90% SOC. Community dyno testing (Mountain Pass Performance) puts the
# realistic band at 432-462 kW. This is BATTERY-SIDE power, not motor output --
# roughly 8-10% is lost in the inverters and motors before it reaches the tyres.
PACK_MAX_DISCHARGE_KW_BEST = 462.0
PACK_MAX_DISCHARGE_KW_TYPICAL = 432.0

KW_TO_HP = 1.34102

# --- The conditions that actually decide how fast your car is ---------------
# Measured behaviour, not marketing. Dropping from 75% -> 45% SOC costs about
# 64 hp on a P3D; below ~30-35 degC pack temperature power tapers hard.
SOC_FULL_POWER = 75.0       # at/above this, SOC is not your limiter
SOC_NOTICEABLE = 55.0       # below this you are giving away serious power
SOC_CRIPPLED = 35.0

PACK_TEMP_IDEAL_MIN = 30.0  # degC - below this the pack cannot deliver peak current
PACK_TEMP_IDEAL_MAX = 50.0  # above this, thermal derating starts creeping in
PACK_TEMP_COLD = 20.0

# Cell/brick voltage spread is the single best cheap indicator of pack health.
# A tight pack sits under ~20 mV spread at rest; >50 mV warrants attention.
BRICK_SPREAD_GOOD_MV = 20.0
BRICK_SPREAD_WATCH_MV = 50.0
BRICK_SPREAD_BAD_MV = 100.0

# Motor/inverter thermal ceilings (degC) before the DI starts pulling torque.
STATOR_TEMP_WARN = 120.0
STATOR_TEMP_LIMIT = 150.0
ROTOR_TEMP_WARN = 130.0
ROTOR_TEMP_LIMIT = 160.0
IGBT_TEMP_WARN = 100.0
IGBT_TEMP_LIMIT = 125.0

# Placard cold tyre pressure for the 20" Performance wheels, in bar.
TYRE_TARGET_BAR = 2.9
TYRE_TOLERANCE_BAR = 0.15
