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

// files: 絶対パスの配列。戻り値 { available, browser, results: [{file, overflow, scrollWidth, clientWidth}], reason }
export async function measureOverflow(files) {
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
      results.push({ file, scrollWidth: m.sw, clientWidth: m.cw, innerWidth: m.iw, overflow: m.sw - m.cw });
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
  const r = await measureOverflow(files);
  if (!r.available) { console.log(`測定不能: ${r.reason}`); process.exit(2); }
  for (const x of r.results) console.log(`${x.overflow > 1 ? "NG" : "OK"}  overflow=${x.overflow}px  cw=${x.clientWidth}  ${x.file}`);
  process.exit(r.results.some((x) => x.overflow > 1) ? 1 : 0);
}
