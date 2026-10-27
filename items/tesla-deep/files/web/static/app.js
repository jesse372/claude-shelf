/* tesla-deep dashboard — live CAN telemetry for a 2019 Model 3 Performance */
(() => {
"use strict";

const $ = id => document.getElementById(id);
const fmt = (v, d = 0, dash = "—") =>
  (v === null || v === undefined || Number.isNaN(v)) ? dash : Number(v).toFixed(d);

/* ---------------- tabs ---------------- */
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "raw") loadRaw();
  });
});

/* ---------------- websocket ---------------- */
let ws, retry = 1000;
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    retry = 1000;
    $("conn-dot").className = "dot live";
    $("conn-text").textContent = "live";
  };
  ws.onmessage = e => {
    try { render(JSON.parse(e.data)); }
    catch (err) { console.error("render failed", err); }
  };
  ws.onclose = () => {
    $("conn-dot").className = "dot dead";
    $("conn-text").textContent = "reconnecting…";
    setTimeout(connect, retry);
    retry = Math.min(15000, retry * 2);
  };
  ws.onerror = () => ws.close();
}

/* ---------------- render ---------------- */
function render(s) {
  $("verdict").textContent = s.verdict;
  if (s.vehicle) $("vehicle-name").textContent = s.vehicle.name;

  renderPower(s.power);
  renderChecks(s.readiness);
  renderLimits(s.readiness.limits);
  renderBattery(s.battery);
  renderDrive(s.drivetrain);
  renderChassis(s.chassis);
  drawSpark(s.series);

  const st = s.stats || {};
  const src = (s.status && s.status.source) || "?";
  $("stats").textContent =
    `source ${src} · ${st.frames_per_sec ?? 0} frames/s · ` +
    `${st.live_signals ?? 0} live signals · ${st.unique_messages ?? 0} message types`;
}

function renderPower(p) {
  $("hp-available").textContent = p.hp_available ?? "—";
  $("hp-ceiling").textContent = `of ${p.hp_ceiling ?? "—"} hp potential`;
  $("hp-on-table").textContent = p.hp_on_table ?? "—";
  $("pct-potential").textContent =
    p.pct_of_potential != null
      ? `${p.pct_of_potential}% of potential available · ${fmt(p.max_discharge_kw,0)} kW at the pack`
      : "—";

  // Semi-circular gauge: 251.3 is the arc length of r=80 over 180°.
  const pct = Math.max(0, Math.min(100, p.pct_of_potential ?? 0));
  const fill = $("gauge-fill");
  fill.style.strokeDashoffset = String(251.3 * (1 - pct / 100));
  fill.style.stroke = pct >= 85 ? "var(--good)" : pct >= 60 ? "var(--warn)" : "var(--red)";

  const box = $("causes");
  const causes = p.causes || [];
  if (!causes.length) {
    box.innerHTML = `<div class="allgood">Nothing is holding your car back right now.
      Pack temperature and state of charge are both in the window where a P3D
      delivers everything it has.</div>`;
    return;
  }
  box.innerHTML = causes.map(c => `
    <div class="cause">
      <div class="cause-head">
        <span class="cause-name">${esc(c.cause)}</span>
        <span class="cause-hp">≈ ${c.est_hp} hp</span>
      </div>
      <div class="cause-detail">${esc(c.detail)}</div>
      <div class="cause-fix">${esc(c.fix)}</div>
    </div>`).join("");
}

function renderChecks(r) {
  $("ready-score").textContent = r.score != null ? `${r.score}/100` : "";
  $("checks").innerHTML = (r.checks || []).map(c => `
    <div class="check s-${c.status}">
      <div class="check-top">
        <span class="check-name">${esc(c.name)}</span>
        <span class="check-val">${esc(c.value)}</span>
      </div>
      <div class="check-target">${esc(c.target)}</div>
      ${c.advice ? `<div class="check-advice">${esc(c.advice)}</div>` : ""}
    </div>`).join("");
}

function renderLimits(limits) {
  const box = $("limits");
  if (!limits || !limits.length) {
    box.innerHTML = `<div class="clear">No power limits asserted. The drive unit is
      giving you everything the pack will allow.</div>`;
    return;
  }
  box.innerHTML = limits.map(l => `
    <div class="limit">
      <div class="limit-head">
        <span class="limit-badge b-${l.severity_label}">${l.severity_label.toUpperCase()}</span>
        <span class="limit-name">${esc(l.label)}</span>
        <span class="limit-sig">${esc(l.signal)}</span>
      </div>
      <div class="limit-exp">${esc(l.explanation)}</div>
    </div>`).join("");
}

function renderBattery(b) {
  $("battery-grid").innerHTML = [
    stat("State of charge", fmt(b.soc_ui, 1), "%"),
    stat("Usable now", fmt(b.energy_remaining_kwh, 1), "kWh"),
    stat("Full pack capacity", fmt(b.nominal_full_kwh, 1), "kWh",
         `was ${b.nominal_new_kwh} kWh new`),
    stat("Degradation", fmt(b.degradation_pct, 1), "%", "since new"),
    stat("Pack temp (max)", fmt(b.temp_max_c, 1), "°C"),
    stat("Pack temp (min)", fmt(b.temp_min_c, 1), "°C"),
  ].join("");

  const retained = b.capacity_retained_pct;
  if (retained != null) {
    $("health-fill").style.width = `${Math.max(0, Math.min(100, retained))}%`;
    $("health-caption").textContent =
      `${retained}% of original capacity retained after ${b.degradation_pct}% degradation. ` +
      `Measured from BMS_nominalFullPackEnergy on the bus — the real number, not the ` +
      `rated-range estimate the touchscreen shows you.`;
  }

  const spreadNote = b.brick_spread_mv == null ? "" :
    b.brick_spread_mv <= 20 ? "Tight — a healthy pack." :
    b.brick_spread_mv <= 50 ? "Slightly wide — worth watching over time." :
    "Wide. The whole pack is limited by its weakest brick.";

  $("cell-detail").innerHTML = [
    stat("Brick spread", fmt(b.brick_spread_mv, 1), "mV", spreadNote),
    stat("Highest brick", fmt(b.brick_v_max, 3), "V",
         b.brick_max_num != null ? `brick #${b.brick_max_num}` : ""),
    stat("Lowest brick", fmt(b.brick_v_min, 3), "V",
         b.brick_min_num != null ? `brick #${b.brick_min_num}` : ""),
    stat("Temp spread", fmt(b.temp_spread_c, 1), "°C", "across the pack"),
    stat("SOC min / max", `${fmt(b.soc_min,1)} / ${fmt(b.soc_max,1)}`, "%"),
    stat("Series groups", b.series_groups, "", "96S pack architecture"),
  ].join("");
}

function renderDrive(d) {
  $("front-nm").textContent = fmt(d.front_torque_nm, 0);
  $("rear-nm").textContent = fmt(d.rear_torque_nm, 0);
  $("split-fill").style.width = `${100 - (d.rear_split_pct ?? 50)}%`;

  $("drive-grid").innerHTML = [
    stat("Total torque", fmt(d.total_torque_nm, 0), "Nm"),
    stat("Rear bias", fmt(d.rear_split_pct, 0), "%", "of total torque"),
    stat("Speed", fmt(d.speed_kph, 0), "km/h"),
    stat("Odometer", fmt(d.odometer_km, 0), "km"),
  ].join("");

  $("thermals").innerHTML = [
    therm("Rear stator", d.stator_temp_c, 150),
    therm("Rear rotor magnets", d.rotor_temp_c, 160),
    therm("Inverter IGBT junction", d.igbt_temp_c, 125),
    therm("Inverter PCB", d.inverter_pcb_c, 110),
  ].join("");
}

function renderChassis(c) {
  const t = c.tyres || {corners: {}, target_bar: 2.9};
  ["FL","FR","RL","RR"].forEach(k => {
    const el = $("tyre-" + k);
    if (!el) return;
    const v = t.corners[k];
    el.querySelector("b").textContent = v == null ? "—" : v.toFixed(2);
    const dev = v == null ? null : Math.abs(v - t.target_bar);
    el.className = "corner " + (dev == null ? "" :
      dev <= 0.15 ? "ok" : dev <= 0.3 ? "warn" : "bad");
  });

  const bt = c.brake_temps_c || {};
  $("chassis-grid").innerHTML = [
    stat("Target pressure", fmt(t.target_bar, 2), "bar", "cold, 20\" Performance wheels"),
    stat("Steering angle", fmt(c.steering_angle_deg, 1), "°"),
    stat("Brake FL / FR", `${fmt(bt.FL)} / ${fmt(bt.FR)}`, "°C"),
    stat("Brake RL / RR", `${fmt(bt.RL)} / ${fmt(bt.RR)}`, "°C"),
  ].join("");
}

function stat(label, value, unit, note) {
  return `<div class="stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${esc(String(value))}${unit ? `<span class="stat-unit">${esc(unit)}</span>` : ""}</div>
    ${note ? `<div class="stat-note">${esc(note)}</div>` : ""}
  </div>`;
}

function therm(name, value, limit) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / limit) * 100));
  const col = pct > 85 ? "var(--bad)" : pct > 65 ? "var(--warn)" : "var(--good)";
  return `<div class="therm">
    <div class="therm-top">
      <span class="therm-name">${esc(name)}</span>
      <span class="therm-val" style="color:${col}">${fmt(value,0)} °C <span style="color:var(--faint)">/ ${limit}</span></span>
    </div>
    <div class="therm-track"><div class="therm-fill" style="width:${pct}%;background:${col}"></div></div>
  </div>`;
}

/* ---------------- sparkline ---------------- */
function drawSpark(series) {
  const cv = $("spark-power");
  if (!cv || !series) return;
  const pts = series.max_discharge_kw || [];
  const ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = 160;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (pts.length < 2) {
    ctx.fillStyle = "#5b6478";
    ctx.font = "12px -apple-system,sans-serif";
    ctx.fillText("collecting…", 14, h / 2);
    return;
  }

  const vals = pts.map(p => p[1]);
  const lo = Math.min(...vals) * 0.95, hi = Math.max(...vals) * 1.05;
  const span = Math.max(1, hi - lo);
  const x = i => 14 + (i / (pts.length - 1)) * (w - 28);
  const y = v => h - 22 - ((v - lo) / span) * (h - 44);

  // fill under the curve
  ctx.beginPath();
  ctx.moveTo(x(0), h - 22);
  pts.forEach((p, i) => ctx.lineTo(x(i), y(p[1])));
  ctx.lineTo(x(pts.length - 1), h - 22);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(232,33,39,.30)");
  grad.addColorStop(1, "rgba(232,33,39,0)");
  ctx.fillStyle = grad;
  ctx.fill();

  // the line
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(x(i), y(p[1])) : ctx.moveTo(x(i), y(p[1])));
  ctx.strokeStyle = "#e82127";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.fillStyle = "#8b95a8";
  ctx.font = "10px ui-monospace,monospace";
  ctx.fillText(`${hi.toFixed(0)} kW`, 14, 14);
  ctx.fillText(`${lo.toFixed(0)} kW`, 14, h - 6);
}

/* ---------------- raw signal explorer ---------------- */
let rawTimer = null;
async function loadRaw() {
  const q = $("raw-search").value.trim();
  try {
    const r = await fetch(`/api/signals?q=${encodeURIComponent(q)}&limit=600`);
    const d = await r.json();
    $("raw-caption").textContent =
      `${d.count} signals matching, of ${d.total_known} defined in the DBC. ` +
      `Values update as the car broadcasts them.`;
    $("raw-list").innerHTML = d.signals.map(s => `
      <div class="raw-row">
        <span class="raw-name">${esc(s.name)}
          <span class="raw-msg">${esc(s.message || "")}</span></span>
        <span class="raw-val">${esc(String(s.value))}${s.unit ? `<span class="raw-unit">${esc(s.unit)}</span>` : ""}</span>
      </div>`).join("") || `<div class="raw-row"><span class="raw-name">No matching live signals.</span></div>`;
  } catch (e) {
    $("raw-caption").textContent = "Could not load signals.";
  }
}
$("raw-search").addEventListener("input", () => {
  clearTimeout(rawTimer);
  rawTimer = setTimeout(loadRaw, 200);
});
setInterval(() => {
  if ($("tab-raw").classList.contains("active")) loadRaw();
}, 3000);

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
connect();
})();
