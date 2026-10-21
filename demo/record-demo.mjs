import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("./video/", import.meta.url).pathname;
const W = 1280, H = 800;

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT, size: { width: W, height: H } },
  colorScheme: "light",
});

// Visible cursor + caption bar, re-installed on every page load.
await ctx.addInitScript(() => {
  const install = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.style.cssText = "position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,80,40,.35);border:2px solid rgba(255,80,40,.9);pointer-events:none;transition:transform .12s;left:-50px;top:-50px";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.6)"), true);
    addEventListener("mouseup", () => (c.style.transform = ""), true);
    const cap = document.createElement("div");
    cap.id = "__cap";
    cap.style.cssText = "position:fixed;z-index:2147483646;left:50%;bottom:28px;transform:translateX(-50%);max-width:80%;padding:12px 22px;border-radius:14px;background:rgba(15,23,42,.88);color:#fff;font:600 20px/1.35 system-ui,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.3);pointer-events:none;opacity:0;transition:opacity .3s";
    document.body.appendChild(cap);
    try { const t = sessionStorage.getItem("__cap"); if (t) { cap.textContent = t; cap.style.opacity = "1"; } } catch {}
  };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", install) : install();
});

const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
let mouse = { x: W / 2, y: H / 2 };

async function caption(text, ms = 2500) {
  for (let i = 0; i < 5; i++) try { await page.evaluate((t) => {
    try { sessionStorage.setItem("__cap", t); } catch {}
    const el = document.getElementById("__cap");
    if (!el) return;
    el.style.opacity = t ? "1" : "0";
    if (t) el.textContent = t;
  }, text); break; } catch { await page.waitForLoadState("load").catch(() => {}); await wait(300); }
  if (ms) await wait(ms);
}

async function moveTo(locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y, { steps: 25 });
  mouse = { x, y };
  await wait(250);
}
async function click(locator) {
  await moveTo(locator);
  await page.mouse.down(); await wait(80); await page.mouse.up();
  // Fallback: ensure the element really received the click.
}
async function clickL(locator) { await moveTo(locator); await locator.click(); }
async function type(locator, text) { await clickL(locator); await locator.pressSequentially(text, { delay: 140 }); }
async function scroll(px, step = 6) {
  const n = Math.ceil(Math.abs(px) / step);
  for (let i = 0; i < n; i++) { await page.mouse.wheel(0, Math.sign(px) * step); await wait(8); }
  await wait(500);
}
async function go(path) { await page.goto(BASE + path); await page.waitForLoadState("load"); await wait(600); }
async function pickOption(text) {
  const opt = page.getByRole("option").filter({ hasText: text }).first();
  await opt.waitFor({ timeout: 10000 });
  await wait(500);
  await clickL(opt);
}

// ---------- 1. Home ----------
await go("/");
await caption("Ghar Train — live train status, station boards & faster routes", 3500);
await caption("Everything is labelled Live / Estimated / Scheduled / Simulated — this is the demo network", 3500);

// ---------- 2. Search a train ----------
await caption("1 · Track a train: type its number or name", 1200);
await type(page.getByRole("combobox").first(), "90001");
await pickOption("90001");
await page.waitForURL(/\/train\/90001/);
await page.waitForLoadState("load"); await wait(1500);
await caption("Live status: current position, delay, next stop and platform", 3500);
await scroll(450); await caption("Stop-by-stop timeline with times and data-quality badges", 3000);
await scroll(600); await wait(1500);
await scroll(600); await caption("Coach position and a destination alarm to wake you before your stop", 3000);
await scroll(-3000, 30);

const routeLink = page.getByRole("link", { name: /route/i }).filter({ hasNot: page.locator("nav") }).first();
await caption("Open the full route & stoppages", 1200);
await clickL(page.locator(`a[href="/train/90001/route"]`).first());
await page.waitForURL(/\/route/); await page.waitForLoadState("load"); await wait(1500);
await caption("Every stoppage with arrival, departure, halt and distance", 3000);
await scroll(700); await wait(1500);

// ---------- 3. Station board ----------
await go("/");
await caption("2 · Station board: switch to Station and search", 1200);
await clickL(page.getByRole("radio", { name: "Station" }));
await type(page.getByRole("combobox").first(), "Gwal");
await pickOption("GWL");
await page.waitForURL(/\/station\/GWL/); await page.waitForLoadState("load"); await wait(1500);
await caption("Arrivals & departures with platforms — filter by train, destination, platform or time", 4000);
await scroll(500); await wait(1500);
await scroll(-2000, 30);

// ---------- 4. Approaching trains ----------
await go("/station/GWL/approaching");
await caption("3 · Approaching trains: what's about to reach your platform, and from which side", 4000);
await scroll(500); await wait(2000);
await scroll(500); await wait(1500);

// ---------- 5. Faster route planner ----------
await go("/planner");
await caption("4 · Faster route: on a slow train? Find a quicker connection home", 3000);
await type(page.getByRole("combobox").first(), "90001");
await pickOption("90001");
await wait(2500);
await caption("Your current station is picked automatically from live position", 3000);
const stops = page.locator('button[aria-pressed]');
await stops.first().waitFor({ timeout: 10000 });
await caption("Pick your destination — or tap a stop on your train's route", 1500);
await clickL(stops.last());
await wait(800);
await clickL(page.getByText("More options"));
await caption("Set minimum change time and maximum number of changes", 2500);
await clickL(page.getByRole("button", { name: /Find faster options/ }));
await page.waitForURL(/\/planner\?/);
await page.waitForLoadState("load"); await wait(3000);
await caption("Only connections you can actually make — with transfer risk shown", 3500);
await scroll(500); await wait(2000);
await scroll(500); await wait(1500);
await scroll(-3000, 30);

const compare = page.locator('a[href^="/planner/compare"]').first();
if (await compare.count()) {
  await clickL(compare);
  await page.waitForURL(/compare/); await page.waitForLoadState("load"); await wait(1500);
  await caption("Compare options side by side — sort by fastest, fewest changes or lowest risk", 3500);
  for (const name of ["Fewest changes", "Lowest risk", "Fastest"]) {
    const r = page.getByRole("radio", { name });
    if (await r.count()) { await clickL(r); await wait(1200); }
  }
  await scroll(400); await wait(1500);
}

// ---------- 6. Trains between stations ----------
await go("/");
await caption("5 · Trains between two stations on any date", 1200);
await clickL(page.getByRole("radio", { name: "From → To" }));
const boxes = page.getByRole("combobox");
await type(boxes.nth(0), "NDLS"); await pickOption("NDLS");
await type(boxes.nth(1), "BPL"); await pickOption("BPL");
await clickL(page.getByRole("button", { name: /search|find|show/i }).last());
await page.waitForURL(/\/between\?/); await page.waitForLoadState("load"); await wait(1500);
await caption("All trains from A to B with timings and duration", 3000);
await scroll(500); await wait(1500);

// ---------- 7. API docs ----------
await go("/api-docs");
await caption("6 · Ghar Train API — every endpoint documented, with a live Try it button", 3000);
await clickL(page.getByRole("button", { name: "Try it" }).first());
await wait(2500);
await scroll(300); await wait(1500);

await go("/");
await caption("That's Ghar Train — npm run dev and open localhost:3000 to try it", 4000);

const video = page.video();
await ctx.close();
await browser.close();
console.log(await video.path());
