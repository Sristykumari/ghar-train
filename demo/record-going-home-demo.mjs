import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("./video-home/", import.meta.url).pathname;
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


const LEFT = ["KSV", "PWL", "NDLS", "FDB"]; // Mathura: towards Delhi on my left, towards Agra / Kota on my right

// ---------- Intro ----------
await go("/");
await caption("New in Ghar Train: “Going home”", 2500);
await caption("Find the trains that go to your home — and which side of the platform they come from", 3500);

// ---------- Open the station ----------
await caption("1 · Search the station you're at", 1200);
await clickL(page.getByRole("radio", { name: "Station" }));
await type(page.getByRole("combobox").first(), "Mathura");
await pickOption("MTJ");
await page.waitForURL(/\/station\/MTJ/); await page.waitForLoadState("load"); await wait(1500);
await caption("2 · Open “Approaching trains”", 1500);
await clickL(page.locator('a[href="/station/MTJ/approaching"]').first());
await page.waitForURL(/approaching/); await page.getByText("Going home?").waitFor(); await wait(1200);

// ---------- Set left / right ----------
await caption("3 · Stand on the platform facing the tracks, and tell us which way each direction goes", 3500);
const groups = page.getByRole("radiogroup", { name: /Side for trains towards/ });
async function answer(g) {
  const code = (await g.locator("xpath=..").locator(".font-mono").first().innerText()).trim();
  await clickL(g.getByRole("radio", { name: LEFT.includes(code) ? /My left/ : /My right/ }));
  await wait(500);
}
await answer(groups.first());
// Mathura is a junction: answer the remaining directions too.
await clickL(page.getByRole("button", { name: "Change" }).first());
await wait(400);
const n = await groups.count();
for (let i = 1; i < n; i++) await answer(groups.nth(i));
await clickL(page.getByRole("button", { name: "Done" }));
await wait(800);
await caption("Saved on this phone for Mathura — you only do this once per station", 3000);

// ---------- Set home ----------
const homeCard = page.locator("section", { hasText: "Going home?" });
await moveTo(homeCard);
await caption("4 · Save your home station once", 1500);
await type(page.getByRole("combobox", { name: "Your home station" }), "Gwalior");
await pickOption("GWL");
await page.getByText(/Going home to/).waitFor(); await wait(800);
const card = page.locator("section", { hasText: "Going home to" });
await moveTo(card.getByText(/Trains to|Next train home|No train/).first());
await caption("Now it tells you which side trains to your home come in from — and leave towards", 4000);
await moveTo(card.getByText("Next train home"));
await caption("The next train home: platform, arrival time and countdown", 3500);

// ---------- Filter ----------
const homeFilter = page.getByRole("radio", { name: /To GWL/ });
await caption("5 · Tap “🏠 To GWL” to see only the trains that stop at your home", 2000);
await clickL(homeFilter);
await wait(800);
await scroll(350);
await caption("Every card says where the train comes from and which side it arrives on", 3500);
await scroll(-1200, 20);

// ---------- Open a train ----------
await caption("6 · Tap a train for its full live status", 1500);
await clickL(card.locator('a[href^="/train/"]').first());
await page.waitForURL(/\/train\//); await page.waitForLoadState("load"); await wait(1500);
await caption("Live position, delay and every stop — including your home station", 3500);
await page.goBack(); await page.getByText(/Going home to/).waitFor(); await wait(800);

// ---------- Change / remove ----------
await moveTo(page.getByRole("button", { name: "Change" }).first());
await caption("Your home is remembered on this device — use Change or Remove any time", 3500);

await caption("Ghar Train — know your side, catch your train home 🏠", 3500);

const video = page.video();
await ctx.close();
await browser.close();
console.log(await video.path());
