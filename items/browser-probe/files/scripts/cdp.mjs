/* Minimal Chrome DevTools Protocol driver. No dependencies.
   Launch Chrome first with scripts/launch.sh, then:
     import { connect } from "./cdp.mjs";
     const { ev, click, shot, errors, close } = await connect();  */
export async function connect({ port = 9222, device = { width: 390, height: 844, scale: 2 } } = {}) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find(t => t.type === "page");
  if (!page) throw new Error("no page target — is Chrome running? scripts/launch.sh");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    /* A new document means the old page's errors are no longer ours. Without
       this, reusing one Chrome across probes reports the PREVIOUS page's
       failures against the current one — a green app looks broken. */
    if (m.method === "Runtime.executionContextsCleared") errors.length = 0;
    if (m.method === "Runtime.exceptionThrown")
      errors.push("EXC: " + (m.params.exceptionDetails.exception?.description || "").slice(0, 200));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
      errors.push("ERR: " + m.params.entry.text.slice(0, 200));
  };
  const send = (method, params = {}) => new Promise(res => {
    const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  if (device) await send("Emulation.setDeviceMetricsOverride",
    { width: device.width, height: device.height, deviceScaleFactor: device.scale, mobile: true });

  const ev = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    const x = r.result?.exceptionDetails;
    if (x) throw new Error(x.exception?.description || JSON.stringify(x));
    return r.result?.result?.value;
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  /* Page.navigate reports errorText when the document itself never arrives.
     Using location.href instead hides that: an unreachable app loads a Chrome
     error page, throws nothing, and the probe reports a confident green. */
  const goto = async (url, settle = 1600) => {
    const r = await send("Page.navigate", { url });
    if (r.result?.errorText) throw new Error(`navigation failed: ${r.result.errorText} (${url})`);
    await wait(settle);
    const ok = await ev(`document.readyState !== "loading" && document.body && document.body.children.length > 0`);
    if (!ok) throw new Error(`page loaded but is empty: ${url}`);
  };
  const click = async (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(e) e.click(); return !!e;})()`);
  const shot = async (path, settle = 420) => {
    await wait(settle);
    const r = await send("Page.captureScreenshot", { format: "png" });
    (await import("fs")).writeFileSync(path, Buffer.from(r.result.data, "base64"));
  };
  return { ev, click, shot, goto, wait, send, errors, close: () => ws.close() };
}
