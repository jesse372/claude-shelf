"""Turning 2752 raw signals into answers.

The headline question this module answers is: right now, how much of your car's
potential can you actually use, and what is standing in the way?

That question matters more on a 2019 Model 3 Performance than on most cars,
because the P3D has no Acceleration Boost available and no aftermarket power
module that does anything for it. The only power you are getting back is the
power you are currently giving away -- and on a cold pack at 45% charge that is
a genuinely large number. See docs/POWER.md.
"""
import config
from limits import active_limits


def _get(sig, *names, default=None):
    """First present value among several candidate signal names."""
    for n in names:
        v = sig.get(n)
        if v is not None:
            return v
    return default


# ---------------------------------------------------------------------------
# Power headroom -- the centrepiece
# ---------------------------------------------------------------------------
def power_analysis(sig):
    max_dis = _get(sig, "BMS_maxDischargePower")
    soc = _get(sig, "SOCUI292", "SOCave292", "UI_SOC")
    pack_temp = _pack_temp(sig)

    ceiling = config.PACK_MAX_DISCHARGE_KW_BEST
    out = {
        "max_discharge_kw": _round(max_dis, 1),
        "ceiling_kw": ceiling,
        "max_regen_kw": _round(_get(sig, "BMS_maxRegenPower"), 1),
        "pack_volts": _round(_get(sig, "BattVoltage132"), 1),
        "pack_amps": _round(_get(sig, "SmoothBattCurrent132", "RawBattCurrent132"), 1),
    }

    if max_dis is None:
        out.update({"available": True, "hp_available": None, "hp_ceiling": None,
                    "hp_on_table": None, "pct_of_potential": None, "available": False})
        return out

    hp_available = max_dis * config.KW_TO_HP
    hp_ceiling = ceiling * config.KW_TO_HP
    out.update({
        "available": True,
        "hp_available": round(hp_available),
        "hp_ceiling": round(hp_ceiling),
        "hp_on_table": max(0, round(hp_ceiling - hp_available)),
        "pct_of_potential": round(100.0 * max_dis / ceiling, 1),
    })

    # Attribute the shortfall to its causes, so the number is actionable rather
    # than just depressing.
    causes = []
    if soc is not None and soc < config.SOC_FULL_POWER:
        deficit = config.SOC_FULL_POWER - soc
        # ~2.1 hp per point of SOC below 75%, from the 75->45% = 64 hp measurement.
        causes.append({
            "cause": "State of charge",
            "detail": f"{soc:.0f}% -- below the {config.SOC_FULL_POWER:.0f}% "
                      "point where SOC stops costing you power",
            "est_hp": round(min(deficit * 2.1, 140)),
            "fix": f"Charge above {config.SOC_FULL_POWER:.0f}%. This is the single "
                   "biggest free power gain available to your car.",
        })
    if pack_temp is not None and pack_temp < config.PACK_TEMP_IDEAL_MIN:
        deficit = config.PACK_TEMP_IDEAL_MIN - pack_temp
        causes.append({
            "cause": "Cold battery",
            "detail": f"{pack_temp:.0f}degC -- the pack wants "
                      f"{config.PACK_TEMP_IDEAL_MIN:.0f}-{config.PACK_TEMP_IDEAL_MAX:.0f}degC",
            "est_hp": round(min(deficit * 6.0, 160)),
            "fix": "Precondition. Navigate to a Supercharger to force pack heating, "
                   "or drive briskly for 10-15 minutes first.",
        })
    out["causes"] = sorted(causes, key=lambda c: -c["est_hp"])
    return out


def _pack_temp(sig):
    hi = _get(sig, "BattBrickTempMax332")
    lo = _get(sig, "BattBrickTempMin332")
    if hi is not None and lo is not None:
        return (hi + lo) / 2.0
    return hi if hi is not None else lo


# ---------------------------------------------------------------------------
# Launch readiness -- a pre-flight checklist for a fast run
# ---------------------------------------------------------------------------
def readiness(sig):
    checks = []

    soc = _get(sig, "SOCUI292", "SOCave292", "UI_SOC")
    checks.append(_check(
        "State of charge",
        soc, lambda v: v >= config.SOC_FULL_POWER,
        lambda v: v >= config.SOC_NOTICEABLE,
        f"{soc:.0f}%" if soc is not None else None,
        f"At or above {config.SOC_FULL_POWER:.0f}% for full power",
        "Charge up -- below 45% you are down roughly 60-80 hp"))

    pt = _pack_temp(sig)
    checks.append(_check(
        "Pack temperature",
        pt,
        lambda v: config.PACK_TEMP_IDEAL_MIN <= v <= config.PACK_TEMP_IDEAL_MAX,
        lambda v: v >= config.PACK_TEMP_COLD,
        f"{pt:.0f}degC" if pt is not None else None,
        f"{config.PACK_TEMP_IDEAL_MIN:.0f}-{config.PACK_TEMP_IDEAL_MAX:.0f}degC is the sweet spot",
        "Precondition the pack -- a cold battery cannot deliver peak current"))

    st = _get(sig, "RearTempStator315", "DIR_statorTemp1", "DIR_statorTemp2")
    checks.append(_check(
        "Rear motor stator",
        st,
        lambda v: v < config.STATOR_TEMP_WARN,
        lambda v: v < config.STATOR_TEMP_LIMIT,
        f"{st:.0f}degC" if st is not None else None,
        f"Under {config.STATOR_TEMP_WARN:.0f}degC",
        "Motor is heat-soaked -- give it a few minutes"))

    igbt = _get(sig, "RearTempInverter315", "DIR_IGBTJunctTemp", "DIF_IGBTJunctTemp")
    checks.append(_check(
        "Inverter IGBTs",
        igbt,
        lambda v: v < config.IGBT_TEMP_WARN,
        lambda v: v < config.IGBT_TEMP_LIMIT,
        f"{igbt:.0f}degC" if igbt is not None else None,
        f"Under {config.IGBT_TEMP_WARN:.0f}degC",
        "Power electronics hot -- this is what ends track sessions"))

    spread = _brick_spread_mv(sig)
    checks.append(_check(
        "Cell balance",
        spread,
        lambda v: v <= config.BRICK_SPREAD_GOOD_MV,
        lambda v: v <= config.BRICK_SPREAD_WATCH_MV,
        f"{spread:.0f} mV" if spread is not None else None,
        f"Under {config.BRICK_SPREAD_GOOD_MV:.0f} mV spread",
        "Wide cell spread limits the whole pack to its weakest brick"))

    tyres = _tyres(sig)
    if tyres["values"]:
        worst = max(abs(v - config.TYRE_TARGET_BAR) for v in tyres["values"])
        checks.append(_check(
            "Tyre pressures",
            worst,
            lambda v: v <= config.TYRE_TOLERANCE_BAR,
            lambda v: v <= config.TYRE_TOLERANCE_BAR * 2,
            f"{min(tyres['values']):.2f}-{max(tyres['values']):.2f} bar",
            f"Within {config.TYRE_TOLERANCE_BAR:.2f} bar of {config.TYRE_TARGET_BAR:.2f}",
            "Pressure is grip, and grip is how power reaches the road"))

    lims = active_limits(sig)
    blocking = [l for l in lims if l["severity"] == 3]
    checks.append({
        "name": "Drive unit limits",
        "status": "bad" if blocking else ("warn" if lims else "good"),
        "value": f"{len(blocking)} active" if blocking else
                 (f"{len(lims)} minor" if lims else "clear"),
        "target": "No critical limits asserted",
        "advice": blocking[0]["explanation"] if blocking else "",
    })

    scored = [c for c in checks if c["status"] != "unknown"]
    score = round(100 * sum(
        {"good": 1.0, "warn": 0.5, "bad": 0.0}[c["status"]] for c in scored
    ) / len(scored)) if scored else None

    return {"checks": checks, "score": score, "limits": lims}


def _check(name, value, good_fn, ok_fn, display, target, advice):
    if value is None:
        return {"name": name, "status": "unknown", "value": "--",
                "target": target, "advice": "No data on the bus yet"}
    status = "good" if good_fn(value) else ("warn" if ok_fn(value) else "bad")
    return {"name": name, "status": status, "value": display,
            "target": target, "advice": "" if status == "good" else advice}


# ---------------------------------------------------------------------------
# Battery health
# ---------------------------------------------------------------------------
def _brick_spread_mv(sig):
    hi = _get(sig, "BattBrickVoltageMax332")
    lo = _get(sig, "BattBrickVoltageMin332")
    if hi is None or lo is None:
        return None
    return (hi - lo) * 1000.0


def battery_analysis(sig):
    full = _get(sig, "BMS_nominalFullPackEnergy")
    remaining = _get(sig, "BMS_nominalEnergyRemaining")
    hi = _get(sig, "BattBrickVoltageMax332")
    lo = _get(sig, "BattBrickVoltageMin332")
    spread = _brick_spread_mv(sig)

    degradation = None
    if full:
        degradation = round(100.0 * (1 - full / config.PACK_NOMINAL_NEW_KWH), 1)

    if spread is None:
        health = "unknown"
    elif spread <= config.BRICK_SPREAD_GOOD_MV:
        health = "good"
    elif spread <= config.BRICK_SPREAD_WATCH_MV:
        health = "watch"
    else:
        health = "bad"

    return {
        "nominal_full_kwh": _round(full, 2),
        "nominal_new_kwh": config.PACK_NOMINAL_NEW_KWH,
        "energy_remaining_kwh": _round(remaining, 2),
        "degradation_pct": degradation,
        "capacity_retained_pct": round(100 - degradation, 1) if degradation is not None else None,
        "brick_v_max": _round(hi, 3),
        "brick_v_min": _round(lo, 3),
        "brick_spread_mv": _round(spread, 1),
        "brick_max_num": _get(sig, "BattBrickVoltageMaxNum332"),
        "brick_min_num": _get(sig, "BattBrickVoltageMinNum332"),
        "temp_max_c": _round(_get(sig, "BattBrickTempMax332"), 1),
        "temp_min_c": _round(_get(sig, "BattBrickTempMin332"), 1),
        "temp_spread_c": _round(
            (_get(sig, "BattBrickTempMax332", default=0) or 0)
            - (_get(sig, "BattBrickTempMin332", default=0) or 0), 1),
        "soc_ui": _round(_get(sig, "SOCUI292", "UI_SOC"), 1),
        "soc_min": _round(_get(sig, "SOCmin292"), 1),
        "soc_max": _round(_get(sig, "SOCmax292"), 1),
        "health": health,
        "series_groups": config.PACK_SERIES_GROUPS,
    }


# ---------------------------------------------------------------------------
# Drivetrain
# ---------------------------------------------------------------------------
def drivetrain_analysis(sig):
    rear = _get(sig, "RearTorque1D8", "RearTorque154")
    front = _get(sig, "FrontTorque1D5", "FrontTorque1D4")
    total = None
    split = None
    if rear is not None and front is not None:
        total = rear + front
        if abs(total) > 1:
            split = round(100.0 * rear / total, 1)

    return {
        "rear_torque_nm": _round(rear, 1),
        "front_torque_nm": _round(front, 1),
        "total_torque_nm": _round(total, 1),
        "rear_split_pct": split,
        "rear_requested_nm": _round(_get(sig, "RearTorqueRequest1D8"), 1),
        "front_requested_nm": _round(_get(sig, "FrontTorqueRequest1D5"), 1),
        "stator_temp_c": _round(_get(sig, "RearTempStator315", "DIR_statorTemp1"), 1),
        "rotor_temp_c": _round(_get(sig, "DIR_rotorMaxMagnetTemp", "DIR_magnetTempEst"), 1),
        "inverter_temp_c": _round(_get(sig, "RearTempInverter315"), 1),
        "heatsink_temp_c": _round(_get(sig, "RearTempInvHeatsink315"), 1),
        "capbank_temp_c": _round(_get(sig, "RearTempInvCapbank315"), 1),
        # The drive unit publishes how close it is to its own thermal ceiling,
        # as a percentage. This is better than guessing from raw degrees.
        "stator_thermal_pct": _round(_get(sig, "RearTempPctStator315"), 1),
        "inverter_thermal_pct": _round(_get(sig, "RearTempPctInverter315"), 1),
        "rear_power_limit_kw": _round(_get(sig, "RearPowerLimit266"), 1),
        "igbt_temp_c": _round(_get(sig, "DIR_IGBTJunctTemp", "DIF_IGBTJunctTemp"), 1),
        "inverter_pcb_c": _round(_get(sig, "RearTempInvPCB315", "DIF_pcbTemp2"), 1),
        "speed_kph": _round(_get(sig, "DI_vehicleSpeed", "UI_gpsVehicleSpeed"), 1),
        "odometer_km": _round(_get(sig, "Odometer3B6", "UI_odometer"), 1),
    }


def _tyres(sig):
    names = [
        ("FL", ["TPMSFLpressure31F"]),
        ("FR", ["TPMSFRpressure31F"]),
        ("RL", ["TPMSRLpressure31F"]),
        ("RR", ["TPMSRRpressure31F"]),
    ]
    out, values = {}, []
    for label, candidates in names:
        v = _get(sig, *candidates)
        out[label] = _round(v, 2)
        if v:
            values.append(v)
    temps = {
        "FL": _round(_get(sig, "TPMSFLtemp31F"), 0),
        "FR": _round(_get(sig, "TPMSFRtemp31F"), 0),
        "RL": _round(_get(sig, "TPMSRLtemp31F"), 0),
        "RR": _round(_get(sig, "TPMSRRtemp31F"), 0),
    }
    return {"corners": out, "values": values, "temps": temps,
            "target_bar": config.TYRE_TARGET_BAR}


def chassis_analysis(sig):
    return {
        "tyres": _tyres(sig),
        "brake_temps_c": {
            "FL": _round(_get(sig, "BrakeTempFL3FE"), 0),
            "FR": _round(_get(sig, "BrakeTempFR3FE"), 0),
            "RL": _round(_get(sig, "BrakeTempRL3FE"), 0),
            "RR": _round(_get(sig, "BrakeTempRR3FE"), 0),
        },
        "steering_angle_deg": _round(_get(sig, "SteeringAngle129"), 1),
    }


def _round(v, n):
    if v is None:
        return None
    try:
        return round(float(v), n)
    except (TypeError, ValueError):
        return None


def verdict(power, ready):
    """One honest sentence for the top of the screen."""
    if not power.get("available"):
        return "Waiting for the battery management system to report on the bus."
    on_table = power.get("hp_on_table") or 0
    pct = power.get("pct_of_potential") or 0
    if on_table < 25:
        return f"Your car is at {pct:.0f}% of its potential. This is as good as a P3D gets."
    top = power.get("causes") or []
    lead = top[0]["cause"].lower() if top else "current conditions"
    return (f"You are giving away about {on_table} hp right now -- {pct:.0f}% of "
            f"potential available. Biggest cause: {lead}.")


def snapshot(sig):
    power = power_analysis(sig)
    ready = readiness(sig)
    return {
        "power": power,
        "readiness": ready,
        "battery": battery_analysis(sig),
        "drivetrain": drivetrain_analysis(sig),
        "chassis": chassis_analysis(sig),
        "verdict": verdict(power, ready),
        "vehicle": config.VEHICLE,
    }
