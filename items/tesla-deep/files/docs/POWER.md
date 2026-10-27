# More power from a 2019 Model 3 Performance — the honest answer

You asked whether the app could "edit it for more power." Here is what I found, in
order of how much it is likely to change your life.

**The short version:** the two obvious paths — Tesla's own Acceleration Boost and a
plug-in tuning module — are both **closed to your car specifically**, because you
already bought the fast one. The path that *is* open is the one nobody sells you:
your P3D routinely runs 60–100 hp below its own ceiling because of state of charge
and battery temperature, and that is free to reclaim. That is why the app leads with
a horsepower-on-the-table number rather than a tuning button.

---

## 1. Tesla Acceleration Boost — not available for your car

Acceleration Boost is Tesla's paid software unlock that takes roughly half a second
off 0–100 km/h. It is offered **only on Long Range AWD** Model 3 and Model Y. The
Performance variant is explicitly excluded, because Boost exists to move a Long
Range *towards* what your car already does.

In Australia it sells for about **A$3,000** on an eligible Long Range. There is no
version of it for a P3D at any price.

There is also no API for it. Even on an eligible car, the purchase happens in Tesla's
own app — the Fleet API exposes vehicle data and a fixed command set (climate,
charging, locks, sentry), and nothing that touches drivetrain output.

## 2. Third-party modules — real products, wrong car

[Ingenext](https://ingenext.ca) is the best-known vendor, and their products are
legitimate. The catch is what each one is *for*:

| Module | Claim | Applies to your 2019 P3D? |
|---|---|---|
| **Boost 50** | +50 hp | **No** — for dual-motor **Long Range**, to close the gap to a Performance |
| **Ghost** | +150 hp, drift mode, lap mode | **No** — an upgrade path for Long Range AWD cars |
| **Bonus** | drift mode, heated rear seats, ambient light, regen control | **Yes, but it explicitly adds zero power** |

Ingenext's own description of the Bonus module — the only one that fits a Performance
car — states it "doesn't add any power to your car." That is not a limitation of the
product; it is the physics. The Boost 50 and Ghost modules work by commanding the
rear drive unit to do what the Performance unit *already* does from the factory. On a
P3D there is nothing left in that particular envelope to unlock.

Hansshow and similar vendors are in the same position for the same reason.

So the aftermarket offer to a P3D owner is **features, not power**: drift mode, track
toys, comfort unlocks. If drift mode is what you actually want, say so — that is a
real and achievable goal, and a different conversation from horsepower.

### If you were ever tempted anyway — the costs

- **Warranty.** A module that commands the drive unit gives Tesla a clean reason to
  decline a drive-unit or battery claim. On a 2019 car the basic warranty is long
  gone, but the **8-year / 192,000 km battery and drive unit warranty** may still be
  live depending on your in-service date — that is the expensive one, and it is
  exactly the one at risk.
- **Insurance.** In Australia a non-disclosed performance modification is a
  well-trodden route to a denied claim. Any modification must be declared, and some
  insurers will simply decline to cover the car.
- **Roadworthiness.** Modifications must comply with the Australian Design Rules and
  WA's vehicle standards. Power increases sit in a genuinely grey area for EVs.
  Confirm with the Department of Transport rather than a forum — and rather than me.

## 3. What actually makes your car faster — and it is not small

This is where the real number is. Community dyno testing (Mountain Pass Performance,
among others) on a Model 3 Performance found:

- **95% → 75% state of charge: about 17 hp lost.** Barely matters.
- **75% → 45% state of charge: about 64 hp lost.** That is *more than the Boost 50
  module gives a Long Range car* — and you are giving it away for free every time you
  drive around at half charge.
- **Below ~30–35 °C pack temperature, power tapers hard.** A cold pack has higher
  internal resistance and the BMS simply will not authorise the current.
- Peak `BMS_maxDischargePower` on a healthy P3D ranges from about **432 kW to 462 kW**
  depending purely on those conditions.

Stack a cold pack and a half-empty battery and a P3D can be **100+ hp down on itself**
— while feeling, to the driver, like the car is just getting old.

**So the fastest your car can be, for free, today:**

1. **Charge above 75%** before you want the car to be quick. Biggest single lever.
2. **Precondition the pack.** Navigating to a Supercharger triggers battery heating
   even if you turn off before arriving. Fifteen minutes of brisk driving also works.
3. **Check Chill mode is off.** Obvious, but it sets `DI_limitDriveTorque` and people
   do leave it on for months without noticing.
4. **Tyre pressures at placard.** Power you cannot put down is not power.
5. **Let it cool between runs.** After repeated launches the stator and IGBTs
   heat-soak and the car pulls timing on you. The app shows exactly when.

The app measures every one of these live and tells you which is costing you what.

## 4. Where genuine gains do exist for a P3D

Not from the motors — from everything around them:

- **Tyres.** By a distance the biggest real-world improvement. The stock Michelin
  PS4S is already good; a semi-slick transforms acceleration, braking and cornering.
- **Weight.** Lighter wheels reduce rotating and unsprung mass — you feel this more
  than an equivalent power increase.
- **Brakes and fluid.** The P3D's limitation on a track is heat, not speed.
- **Alignment and suspension.** Mountain Pass Performance built a business on the
  fact that a Model 3's chassis responds far better to setup than to power.
- **Track Mode.** Free, factory, and genuinely changes the car — adjustable stability,
  regen balance and front/rear power distribution. If you have never dug into it,
  start there before spending anything.

---

## Sources

- [Tesla Acceleration Boost: A Complete Guide — Not a Tesla App](https://www.notateslaapp.com/tesla-reference/1040/tesla-acceleration-boost-a-complete-guide)
- [Tesla starts offering Acceleration Boost for Model 3 Long Range — Tesla Oracle](https://www.teslaoracle.com/2024/11/22/tesla-starts-offering-acceleration-boost-for-the-model-3-highland-long-range-variant/)
- [New Model 3 Long Range gets Acceleration Boost — Carscoops](https://www.carscoops.com/2024/11/tesla-model-3-long-range-awd-gets-acceleration-boost-upgrade-but-not-in-the-us/)
- [Ingenext Boost 50](https://ingenext.ca/products/boost-50) · [Ghost Upgrade](https://ingenext.ca/products/ghost-upgrade) · [Bonus Module](https://ingenext.ca/products/bonus-module-tm3)
- [Tesla Performance Model 3 dyno testing at various SOC — Mountain Pass Performance](https://www.mountainpassperformance.com/tesla-performance-model-3-dyno-testing-at-various-soc/)
- [How much does state of charge impact Model 3 Performance hp — InsideEVs](https://insideevs.com/news/381551/video-tesla-model-3-performance-soc-dyno/)
- [What conditions do I need for full power — Tesla Motors Club](https://teslamotorsclub.com/tmc/threads/what-conditions-do-i-need-to-have-the-full-%E2%80%9Cpower%E2%80%9D-throttle-available.295560/)
- [Tesla Fleet API — billing and limits](https://developer.tesla.com/docs/fleet-api/billing-and-limits)

*Compiled September 2026. Product lineups and Tesla's software offerings change —
re-check before spending money. The regulatory and insurance notes are a prompt to go
and verify, not advice.*
