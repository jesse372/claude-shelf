"""The 38 power-limit reasons the drive unit broadcasts on CAN ID 0x1D6.

This is the most useful thing on the entire bus and no Tesla app shows it.
When your car feels slow, one or more of these bits is set, and the car is
telling you exactly which. Each entry maps the raw signal to plain English,
how much it matters, and -- crucially -- whether YOU can do anything about it.

`fixable` values:
  driver  -> you can change this right now (charge up, precondition, cool down)
  service -> indicates wear or a fault worth investigating
  normal  -> expected behaviour, not a problem
"""

# name: (label, explanation, severity 1-3, fixable)
LIMIT_REASONS = {
    # ---- Battery-side limits: the usual suspects on a street car -----------
    "DI_limitDischargePower": (
        "Battery discharge cap",
        "The pack is refusing to deliver more current. On a healthy car this is "
        "almost always low state of charge or a cold pack -- the two things that "
        "cost a P3D the most power.",
        3, "driver"),
    "DI_limitIBat": (
        "Battery current cap",
        "The BMS is capping amps out of the pack. Same root causes as the discharge "
        "cap: cold cells or low SOC raise internal resistance.",
        3, "driver"),
    "DI_limitVBatLow": (
        "Pack voltage sagging low",
        "Pack voltage is dropping under load. Classic low-SOC symptom, and it gets "
        "worse as the pack ages. If you see this above 70% SOC, look at cell spread.",
        3, "driver"),
    "DI_limitVBatHigh": (
        "Pack voltage at ceiling",
        "Usually seen near 100% SOC where regen is cut because there is nowhere to "
        "put the energy. Harmless -- it clears as you drive.",
        1, "normal"),

    # ---- Motor thermal ----------------------------------------------------
    "DI_limitStatorTemp": (
        "Stator too hot",
        "Motor windings are heat-soaked. This is the normal limiter after repeated "
        "hard launches or a few laps. Let it cool; nothing is wrong.",
        3, "driver"),
    "DI_limitRotorTemp": (
        "Rotor too hot",
        "The rear motor's magnets are hot. Sustained high magnet temperature "
        "permanently weakens them, so this limit is protecting real money.",
        3, "driver"),
    "DI_limitPoleTemp": (
        "Motor pole temperature",
        "Localised motor hotspot triggering a pull-back.",
        2, "driver"),
    "DI_limitMotorCurrent": (
        "Motor current cap",
        "The inverter is capping current to the motor, typically thermal or a "
        "commanded torque limit upstream.",
        2, "normal"),
    "DI_limitMotorVoltage": (
        "Motor voltage cap",
        "Back-EMF is approaching available pack voltage -- the normal physics of "
        "high-speed running. Expected at the top end.",
        1, "normal"),
    "DI_limitMotorSpeed": (
        "Motor RPM ceiling",
        "You are at the motor's rev limit. Nothing to fix.",
        1, "normal"),
    "DI_limitBaseSpeed": (
        "Base speed transition",
        "Normal transition out of the constant-torque region into field weakening.",
        1, "normal"),
    "DI_limitStatorFrequency": (
        "Stator frequency ceiling",
        "Inverter switching frequency limit. Normal at high RPM.",
        1, "normal"),

    # ---- Inverter / power electronics thermal -----------------------------
    "DI_limitInverterTemp": (
        "Inverter too hot",
        "Power electronics are heat-soaked. Very common on track, rare on the road.",
        3, "driver"),
    "DI_limitIGBTJunctTemp": (
        "IGBT junction temperature",
        "The switching transistors themselves are hot -- the hardest thermal limit "
        "in the whole drivetrain, and the one that ends track sessions.",
        3, "driver"),
    "DI_limitPCBTemp": (
        "Inverter PCB temperature",
        "Control board running hot.",
        2, "driver"),
    "DI_limitDcCapTemp": (
        "DC capacitor temperature",
        "DC-link capacitor heat-soaked.",
        2, "driver"),
    "DI_limitdcLinkCapTemp": (
        "DC-link capacitor temperature",
        "Same family as above -- sustained high current has heated the capacitors.",
        2, "driver"),

    # ---- Busbar / conductor thermal (these mean sustained huge current) ----
    "DI_limithvDcCableTemp": (
        "HV cable temperature",
        "The orange HV cabling is hot. Only appears after sustained extreme load.",
        2, "driver"),
    "DI_limitnegDcBusbarTemp": (
        "Negative DC busbar hot",
        "Conductor thermal limit from sustained high current.",
        2, "driver"),
    "DI_limitposDcBusbarTemp": (
        "Positive DC busbar hot",
        "Conductor thermal limit from sustained high current.",
        2, "driver"),
    "DI_limitphaseOutBusbarTemp": (
        "Phase output busbar hot",
        "Motor phase conductor thermal limit.",
        2, "driver"),
    "DI_limitphaseOutBusBarWeldTemp": (
        "Phase busbar weld hot",
        "The welded joint on the phase busbar is the hotspot. Persistent warnings "
        "here are worth a service conversation.",
        2, "service"),
    "DI_limitphaseOutLugTemp": (
        "Phase output lug hot",
        "Terminal lug thermal limit.",
        2, "service"),

    # ---- Cooling system ---------------------------------------------------
    "DI_limitDeltaFluidTemp": (
        "Coolant delta too high",
        "Coolant is not carrying heat away fast enough. If this shows up early in a "
        "drive, suspect coolant level, a tired pump, or a blocked radiator.",
        2, "service"),
    "DI_limitOilPumpFluidTemp": (
        "Gearbox oil temperature",
        "Drive unit oil is hot, so the oil pump cannot cool the motor properly.",
        2, "service"),

    # ---- Traction / stability / chassis ------------------------------------
    "DI_limitTCDrive": (
        "Traction control cutting power",
        "Wheels are slipping and stability control is intervening. This is grip, not "
        "power -- tyres and surface, not the car.",
        2, "driver"),
    "DI_limitTCRegen": (
        "Traction control limiting regen",
        "Stability control is pulling back regen braking, usually on a low-grip surface.",
        1, "normal"),
    "DI_limitDriveTorque": (
        "Commanded drive torque cap",
        "Torque is being limited upstream. Chill mode is the most common everyday "
        "cause -- worth checking before you blame the hardware.",
        3, "driver"),
    "DI_limitRegenTorque": (
        "Regen torque cap",
        "Regen limited -- cold pack or near-full charge.",
        1, "normal"),
    "DI_limitRegenPower": (
        "Regen power cap",
        "Same as above, expressed as power.",
        1, "normal"),
    "DI_limitShockTorque": (
        "Driveline shock protection",
        "Protecting the driveline from a torque spike, e.g. a sudden grip change.",
        1, "normal"),
    "DI_limitDiff": (
        "Differential protection",
        "Differential/driveline protection engaged.",
        2, "normal"),
    "DI_limitClutch": (
        "Front motor decouple",
        "Relates to front drive unit engagement state.",
        1, "normal"),
    "DI_limitVehicleSpeed": (
        "Speed limiter active",
        "A speed cap is in force -- valet mode, speed limit mode, or the car's own "
        "top-speed governor.",
        2, "driver"),
    "DI_limitShift": (
        "Gear/shift state",
        "Torque limited by the current drive state.",
        1, "normal"),
    "DI_limitObstacleDetection": (
        "Obstacle detected",
        "The car sees something and is limiting torque to avoid hitting it.",
        2, "normal"),

    # ---- Fault states -----------------------------------------------------
    "DI_limitLimpMode": (
        "LIMP MODE",
        "The drivetrain has faulted into reduced power. This is not a tuning matter "
        "-- read the fault and get it looked at.",
        3, "service"),
    "DI_limitGracefulPowerOff": (
        "Powering down",
        "The drive unit is shutting down in a controlled way.",
        1, "normal"),
}

SEVERITY_LABEL = {1: "info", 2: "warn", 3: "critical"}


def describe(signal_name):
    """Return a dict describing a limit flag, or a safe fallback if unknown."""
    entry = LIMIT_REASONS.get(signal_name)
    if entry is None:
        pretty = signal_name.replace("DI_limit", "")
        return {
            "signal": signal_name, "label": pretty,
            "explanation": "Undocumented limit flag.",
            "severity": 1, "severity_label": "info", "fixable": "normal",
        }
    label, explanation, severity, fixable = entry
    return {
        "signal": signal_name, "label": label, "explanation": explanation,
        "severity": severity, "severity_label": SEVERITY_LABEL[severity],
        "fixable": fixable,
    }


def active_limits(signals):
    """Given a dict of decoded CAN signals, return every limit currently asserted,
    most serious first."""
    out = []
    for name in LIMIT_REASONS:
        value = signals.get(name)
        if value in (1, True, "Active"):
            out.append(describe(name))
    out.sort(key=lambda d: -d["severity"])
    return out
