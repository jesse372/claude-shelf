# Hooking up keg level sensors

The board will happily take a live keg level from **any** setup — load cells under the
kegs, flow meters on the lines, a Plaato, Home Assistant, a bare ESP32, a Raspberry Pi,
a shell script on a cron. There is no supported brand and nothing to buy: if it can make
an HTTP request, it can drive the board.

Until a sensor reports, the board uses the slider in the editor exactly as it always has.
**If a sensor goes quiet for six hours the board falls back to the slider**, so a flat
battery or a dropped wifi link leaves you no worse off than before.

---

## Turning it on (once)

```bash
cd worker
npx wrangler secret put DEVICE_TOKEN      # invent a long random string
npx wrangler deploy
```

Until `DEVICE_TOKEN` is set, the level routes refuse everything — it fails closed rather
than leaving an open endpoint on the internet.

The sensor token is **separate from the publishing password on purpose**. A device
screwed to the wall of a shed can report levels and nothing else; even if someone walks
off with it, they cannot touch the beer list.

---

## Reporting a level

Send whatever your hardware actually measures. The Worker does the arithmetic.

### The simplest thing that works

```
GET https://ontap-publish.madlad-taps.workers.dev/level?token=YOURTOKEN&tap=3&percent=62
```

A plain GET, because plenty of small firmwares can manage a URL and little else.

### A batch, as JSON

```bash
curl -X POST https://ontap-publish.madlad-taps.workers.dev/level \
  -H 'Content-Type: application/json' \
  -d '{"token":"YOURTOKEN","readings":[
        {"tap":1,"percent":88},
        {"tap":2,"litres":11.8,"capacity_l":19},
        {"tap":3,"kg":12.4,"empty_kg":4.0,"full_kg":23.0}
      ]}'
```

### What you can send

Give it **any one** of these per tap and it works out the rest:

| You measure | Send | Notes |
|---|---|---|
| A percentage | `percent` (or `pct`, `level`) | 0–100 |
| Litres left | `litres` **and** `capacity_l` | `liters` also accepted |
| Millilitres left | `ml` **and** `capacity_ml` | |
| Weight (load cell) | `kg` **and** `empty_kg` **and** `full_kg` | the empty and full weights of *that* keg |
| Weight in pounds | `lb` **and** `empty_lb` **and** `full_lb` | converted for you |

The tap number can be `tap`, `num`, `tap_number` or `id`. Add `src` (or `device`) to
label where a reading came from — handy when several things report.

Anything that cannot be turned into a percentage is **rejected rather than guessed at**.
A wrong level is worse than no level: it would quietly tell people a keg is full.
Readings are clamped to 0–100, so a scale drifting below tare cannot show −4%.

---

## Worked examples

### ESP32 / Arduino — load cells under the kegs

```cpp
// weight in kg from your HX711, plus the empty and full weights of this keg
String url = "https://ontap-publish.madlad-taps.workers.dev/level"
             "?token=YOURTOKEN&tap=3"
             "&kg="       + String(weightKg, 2) +
             "&empty_kg=4.0&full_kg=23.0&src=esp32";
http.begin(url);
http.GET();
```

Send it every few minutes, not every second — nobody watches a keg drain in real time,
and the board only redraws when a number actually changes.

### Home Assistant / ESPHome

```yaml
rest_command:
  keg_level:
    url: "https://ontap-publish.madlad-taps.workers.dev/level"
    method: POST
    content_type: application/json
    payload: >-
      {"token":"YOURTOKEN","readings":[
        {"tap":3,"kg":{{ states('sensor.keg_3_weight') }},
         "empty_kg":4.0,"full_kg":23.0,"src":"hass"}]}
```

### Flow meters

Flow meters measure what has *left* the keg, so keep a running total and send what is
left:

```
?token=YOURTOKEN&tap=3&litres=11.8&capacity_l=19&src=flowmeter
```

Re-send `litres=19` when you change the keg, or the count carries on from the old one.

### Anything else

```bash
# a cron job, a Pi, a script on the kegerator — the contract is the same
curl -s "https://.../level?token=$TOKEN&tap=1&percent=$PCT&src=cron" > /dev/null
```

---

## Checking it

```bash
curl -s https://ontap-publish.madlad-taps.workers.dev/levels | python3 -m json.tool
```

```json
{
  "taps": { "3": { "pct": 44.2, "at": 1785331200000, "src": "esp32" } },
  "now": 1785331260000
}
```

`at` is when that reading arrived. The board treats anything older than six hours as
stale and goes back to the slider.

Reading levels needs no token — it is the same information the board is already showing
on a screen in the room.
