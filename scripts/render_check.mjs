// 375px 実レンダリング検証 — 依存ゼロ版
//
//   node scripts/render_check.mjs [file.html ...]   （引数なしなら docs/ 配下すべて）
//
// 2026-10-01 追加。verify.mjs の「4. 実レンダリング」は puppeteer 前提で、
// node_modules を作らない方針（CLAUDE.md 環境メモ）のため一度も実行されていなかった。
// 公開済み6本はすべて静的検査だけで公開されている。
//
// puppeteer がやっていることの必要部分だけを、インストール済みの Chrome / Edge と
// Node 組み込みの WebSocket（Node 22+）で直接やる:
//   1. --headless --remote-debugging-port=0 で起動し、DevToolsActivePort から接続先を読む
//   2. Emulation.setDeviceMetricsOverride で 375×812・mobile に固定
//   3. file:// を開き、load 後に scrollWidth - clientWidth を測る
//
// 戻り値の約束: ブラウザが見つからない／起動できない場合は { available: false } を返し、
// 例外にしない。「測れなかった」と「溢れていない」を同じ値にしないため、
// 呼び出し側は available を必ず見ること。

import { existsSync, mkdtempSync, readFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

export const VIEWPORT = { width: 375, height: 812 };

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

export function findBrowser() {
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, label) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const v = fn();
    if (v) return v;
    await sleep(100);
  }
  throw new Error(`タイムアウト: ${label}`);
}

// 最小の CDP クライアント。id で応答を、method でイベントを待つ。
function cdp(ws) {
  let seq = 0;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, ng } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? ng(new Error(`${msg.error.message}`)) : ok(msg.result);
    } else if (msg.method) {
      for (const w of [...waiters]) {
        if (w.method === msg.method && w.sessionId === msg.sessionId) {
          waiters.splice(waiters.indexOf(w), 1);
          w.ok(msg.params);
        }
      }
    }
  });
  return {
    send(method, params = {}, sessionId) {
      const id = ++seq;
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise((ok, ng) => {
        pending.set(id, { ok, ng });
        setTimeout(() => pending.has(id) && (pending.delete(id), ng(new Error(`CDP 応答なし: ${method}`))), 15000);
      });
    },
    once(method, sessionId, timeoutMs = 15000) {
      return new Promise((ok, ng) => {
        const w = { method, sessionId, ok };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) { waiters.splice(i, 1); ng(new Error(`イベント待ちタイムアウト: ${method}`)); }
        }, timeoutMs);
      });
    },
  };
}

// 2026-10-02 追加。初期表示だけでは結果表・内訳を測れない（溢れが最も起きやすいのはそこ）。
// ページ内で select の全選択肢・各ボタン・数値入力の大きい値を1つずつ試し、その都度測る。
// 「操作したつもりで何も変わっていない」を見分けるため、表示テキストの異なり数（distinct）も返す。
const EXERCISE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const de = document.documentElement;
  const ov = () => de.scrollWidth - de.clientWidth;
  const states = new Set([document.body.innerText]);
  let worst = { overflow: ov(), action: "初期表示" }, steps = 0;
  const fire = (el) => { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
  const rec = (action) => { steps++; states.add(document.body.innerText); const o = ov(); if (o > worst.overflow) worst = { overflow: o, action }; };
  const name = (el) => el.id ? "#" + el.id : (el.getAttribute("aria-label") || el.className || el.tagName).toString().slice(0, 30);
  for (const s of [...document.querySelectorAll("select")]) {
    const orig = s.value;
    for (const o of [...s.options]) {
      if (o.disabled) continue;
      s.value = o.value; fire(s); await sleep(30); rec("select " + name(s) + "=" + o.value);
    }
    s.value = orig; fire(s); await sleep(30);
  }
  for (const i of [...document.querySelectorAll('input[type="number"]')]) {
    if (!i.isConnected) continue;
    const orig = i.value;
    const big = i.max !== "" ? i.max : String((Number(orig) || 999) * 100);
    i.value = big; fire(i); await sleep(30); rec("input " + name(i) + "=" + big);
    i.value = orig; fire(i); await sleep(30);
  }
  for (const b of [...document.querySelectorAll('button:not([type="submit"]):not([type="reset"])')]) {
    if (!b.isConnected || b.disabled) continue;
    b.click(); await sleep(30); rec("button " + (b.id ? "#" + b.id : b.textContent.trim().slice(0, 20)));
  }
  return JSON.stringify({ steps, distinct: states.size, worst });
})()`;

// files: 絶対パスの配列。戻り値 { available, browser, results: [{file, overflow, scrollWidth, clientWidth, exercised?}], reason }
// exercise: true なら初期表示の測定に加えて操作後の最大溢れを exercised に入れる
export async function measureOverflow(files, { exercise = false } = {}) {
  const browser = findBrowser();
  if (!browser) return { available: false, reason: "Chrome / Edge が見つからない", results: [] };
  if (typeof WebSocket !== "function") return { available: false, reason: "WebSocket が無い（Node 22+ が要る）", results: [] };

  const profile = mkdtempSync(join(tmpdir(), "render-check-"));
  const proc = spawn(browser, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-gpu", "--allow-file-access-from-files", "about:blank",
  ], { stdio: "ignore" });
  let ws;
  try {
    const portFile = join(profile, "DevToolsActivePort");
    const text = await waitFor(() => existsSync(portFile) && readFileSync(portFile, "utf8").trim().includes("\n")
      ? readFileSync(portFile, "utf8") : null, 20000, "DevToolsActivePort");
    const [port, path] = text.trim().split(/\r?\n/);
    ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((ok, ng) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", () => ng(new Error("WebSocket 接続失敗")), { once: true }); });
    const c = cdp(ws);

    const results = [];
    for (const file of files) {
      const { targetId } = await c.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await c.send("Target.attachToTarget", { targetId, flatten: true });
      await c.send("Page.enable", {}, sessionId);
      await c.send("Emulation.setDeviceMetricsOverride", {
        width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 2, mobile: true,
      }, sessionId);
      const loaded = c.once("Page.loadEventFired", sessionId);
      await c.send("Page.navigate", { url: pathToFileURL(file).href }, sessionId);
      await loaded;
      await sleep(150); // load 直後のスクリプトによる DOM 追加を待つ
      const { result } = await c.send("Runtime.evaluate", {
        expression: "JSON.stringify({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, iw: window.innerWidth})",
        returnByValue: true,
      }, sessionId);
      const m = JSON.parse(result.value);
      const row = { file, scrollWidth: m.sw, clientWidth: m.cw, innerWidth: m.iw, overflow: m.sw - m.cw };
      if (exercise) {
        const ex = await c.send("Runtime.evaluate", { expression: EXERCISE, awaitPromise: true, returnByValue: true }, sessionId);
        if (ex.exceptionDetails) throw new Error(`操作スクリプトが例外: ${ex.exceptionDetails.text}`);
        row.exercised = JSON.parse(ex.result.value);
      }
      results.push(row);
      await c.send("Target.closeTarget", { targetId });
    }
    return { available: true, browser, results };
  } catch (e) {
    return { available: false, reason: `ブラウザ操作に失敗: ${e.message}`, results: [] };
  } finally {
    try { ws?.close(); } catch {}
    proc.kill();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

// CLI
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const walk = (d, acc = []) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, acc) : n.endsWith(".html") && acc.push(p); } return acc; };
  const files = process.argv.length > 2 ? process.argv.slice(2).map((f) => resolve(f)) : walk(join(ROOT, "docs"));
  const r = await measureOverflow(files, { exercise: true });
  if (!r.available) { console.log(`測定不能: ${r.reason}`); process.exit(2); }
  const worstOf = (x) => Math.max(x.overflow, x.exercised?.worst.overflow ?? 0);
  for (const x of r.results) {
    const e = x.exercised;
    console.log(`${worstOf(x) > 1 ? "NG" : "OK"}  overflow=${x.overflow}px  操作後最大=${e.worst.overflow}px（${e.worst.action}）  操作${e.steps}回・表示${e.distinct}通り  cw=${x.clientWidth}  ${x.file}`);
  }
  process.exit(r.results.some((x) => worstOf(x) > 1) ? 1 : 0);
}
