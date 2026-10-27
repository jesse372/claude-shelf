# Getting the cable into your 2019 Model 3

Your car is, by luck, on the **easy** side of the Model 3 hardware split. Cars built
from about **January 2019** use a 26-pin diagnostic connector on a conventional
500 kbit/s CAN bus. The 2021+ refresh moved to a different architecture that is
considerably harder to tap. A 2019 Performance is the sweet spot.

## What to buy

**1. A 26-pin Tesla → OBD2 adapter cable (~A$30–60)**

Search "Tesla Model 3 Y OBD2 adapter cable 26 pin 2019". Known-good sellers include
Exctool, AUGREX, EVOffer, SL Elements and e-Mobility Driving Solutions. **Make sure
the listing says 2019+ / 26-pin** — the 2017–2018 cars used a different connector and
that cable will not fit.

**2. A CAN-capable dongle — this is where not to save money (~A$70–170)**

| Option | Verdict |
|---|---|
| **OBDLink LX / CX / MX+** | **Recommended.** Genuine STN chip, keeps up with Model 3 bus load. |
| Generic ELM327 clone (~A$15) | Works, then drops a large share of frames. The dashboard looks laggy and subtly wrong rather than obviously broken — the worst failure mode. |
| CANable / CANtact (USB) | Excellent data quality, needs `--source slcan`. |
| Raspberry Pi + MCP2515 hat | Best of all, and lets you leave a logger in the car permanently. `--source socketcan`. |

The app supports all of them. If you want one purchase that just works: **OBDLink CX
(Bluetooth 5, works with macOS and iOS) plus a 26-pin adapter cable.**

## Where the port is

Underneath the **rear of the centre console**, behind a removable trim panel — the
same area you reach for the rear USB ports. On a 2019 car:

1. Open the rear-seat cubby / console lid.
2. Pop the trim cover at the rear base of the console (clips, no screws).
3. You are looking for a small white/black 26-pin connector, usually taped to the
   harness.
4. Unclip it, plug the adapter inline, and route the OBD2 end somewhere tidy.

There are good photo walkthroughs on the Tesla Owners Online "Diagnostic Port and
Data Access" thread — worth two minutes before you start pulling trim.

## Wiring it up

```bash
# macOS: pair the dongle over Bluetooth, then find its serial device
ls /dev/tty.* | grep -i -E 'obdlink|elm|can'

./run.sh --source elm --port /dev/tty.OBDLink-SPP
```

For a Pi or a USB CAN adapter:

```bash
./run.sh --source socketcan --channel can0     # Pi + MCP2515 hat
./run.sh --source slcan --port /dev/tty.usbmodem1234   # CANable
```

Then open `http://<the-machine>:8383` on your phone and add it to the home screen.

## Safety and etiquette

- **This app only ever reads.** It never transmits a frame. Nothing here can change
  how your car behaves.
- **Do not leave a cheap dongle permanently plugged in.** Some keep the bus awake and
  will flatten the 12 V battery over days. The OBDLink units sleep properly; no-name
  clones frequently do not.
- **Don't fiddle while driving.** Plug in parked, then drive.
- Tesla does not support or document any of this. A diagnostic port is not a warranty
  claim waiting to happen, but attaching unknown hardware to a vehicle bus is at your
  own risk.

## Sources

- [OBDLink — diagnose your Model 3 or Model Y with an OBD2 adapter](https://obdlink.nl/en/tesla-model-3-model-y-diagnostic-cable)
- [OHP Tools — Model 3 & Y diagnostic tools and apps](https://ohptools.com/blogs/news/all-you-need-to-know-about-the-tesla-model-3-y-diagnostic-tools-apps)
- [SL Elements — 26-pin CAN-bus OBD-II adapter, Model 3 (>01/2019)](https://sl-elements.com/en/products/26-pin-can-bus-obd-ii-adapter-scan-my-tesla-model-3)
- [joshwardell/model3dbc — the signal definitions this app decodes with](https://github.com/joshwardell/model3dbc)
- [ScanMyTesla](https://www.scanmytesla.com/) — the Android app that pioneered this
