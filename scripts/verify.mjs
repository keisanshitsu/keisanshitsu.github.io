// 公開前ゲート — 無人実行できる形の品質検証
//
//   node scripts/verify.mjs
//
// 設計方針: 「ブラウザで目視確認」は headless の自動実行では物理的に不可能である。
// 実行できない規則を憲法に書くと、毎晩破られて憲法全体が形骸化する。
// そこで目視を、機械が実行できる検査に置き換えたのが本スクリプト。
//
// puppeteer が入っていれば 375px の実レンダリングまで検証する（任意）:
//   npm i -D puppeteer
// 入っていない場合は静的検査のみで続行し、その旨を明示する。
//
// 終了コード: 0 = 公開可 / 1 = ERROR あり（push 禁止）

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// 公開されるフォルダ。GitHub Pages が「main ブランチの /docs」を配信するため
// この名前でなければならない（CLAUDE.md「公開の仕組み」参照）。
const SITE = join(ROOT, "docs");
const pipeline = JSON.parse(readFileSync(join(ROOT, "state", "pipeline.json"), "utf8"));

// canonical URL の期待値。公開URLとファイルの位置から機械的に決まるので、
// 人が手で書くと必ずずれる。ずれた canonical は「別ページの複製」と解釈されうる。
const canonicalFor = (file) => {
  const base = (pipeline.site?.published_url ?? "").replace(/\/+$/, "");
  if (!base) return null;
  const rel = relative(SITE, file).replaceAll("\\", "/");
  if (rel === "index.html") return base + "/";
  if (rel.endsWith("/index.html")) return base + "/" + rel.slice(0, -"index.html".length);
  return base + "/" + rel;
};

const errors = [];
const warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);

function walk(dir, ext, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, acc);
    else if (name.endsWith(ext)) acc.push(p);
  }
  return acc;
}

// ── 1. HTML の静的検査 ────────────────────────────────────────────────
const pages = walk(SITE, ".html");
if (pages.length === 0) err("docs/", "HTMLが1枚も無い");

for (const page of pages) {
  const rel = relative(ROOT, page).replaceAll("\\", "/");
  const html = readFileSync(page, "utf8");
  const isTool = rel.includes("/tools/");
  const noindex = /name=["']robots["'][^>]*noindex/i.test(html);

  if (!/<html[^>]+lang=["']ja["']/i.test(html)) err(rel, "<html lang='ja'> が無い");
  if (!/name=["']viewport["'][^>]*width=device-width/i.test(html))
    err(rel, "viewport メタタグが無い。スマホで崩れる");

  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim();
  if (!title) err(rel, "<title> が無い");
  else if (title.length > 62) warn(rel, `title が長い(${title.length}字)。検索結果で切れる`);

  const desc = html.match(/name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1];
  if (!desc && !noindex) err(rel, "meta description が無い");
  else if (desc && (desc.length < 50 || desc.length > 160))
    warn(rel, `description が ${desc.length}字（推奨 50〜160）`);

  const h1 = html.match(/<h1[\s>]/gi)?.length ?? 0;
  if (h1 === 0) err(rel, "<h1> が無い。SEO上の基本欠落");
  if (h1 > 1) warn(rel, `<h1> が ${h1} 個ある。1個にする`);

  for (const bad of ["TODO", "FIXME", "XXX", "lorem ipsum", "ダミー", "仮の値"])
    if (html.toLowerCase().includes(bad.toLowerCase()))
      err(rel, `未完成マーカー "${bad}" が残っている`);

  // 内部リンクの死活。
  // 配信先はプロジェクトサイト（https://<user>.github.io/<repo>/）であり、
  // サイトのルートがドメインのルートと一致しない。したがって "/privacy.html" のような
  // ルート絶対パスは他人のサイト（HG Analytics）を指して404する。
  // 相対パスのみを許可し、ページの位置から解決して実在を確認する。
  const pageDir = dirname(page);
  for (const m of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
    const raw = m[1].trim();
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw)) continue; // 外部URL・mailto・ページ内アンカー
    if (raw.startsWith("/")) {
      err(rel, `ルート絶対リンク ${raw} — 配信先がサブディレクトリなので404する。相対パスにすること`);
      continue;
    }
    let t = raw.split("#")[0].split("?")[0];
    if (t === "") continue;
    if (t.endsWith("/")) t += "index.html";
    const target = resolve(pageDir, t);
    if (!target.startsWith(SITE)) err(rel, `docs の外を指すリンク: ${raw}`);
    else if (!existsSync(target)) err(rel, `内部リンク切れ: ${raw}`);
  }

  // YMYL 必須表記
  if (isTool) {
    if (!/概算/.test(html)) err(rel, "YMYL必須: 「概算」の明示が無い（ドクトリン違反）");
    if (!/出典|根拠/.test(html)) err(rel, "YMYL必須: 出典の記載が無い（ドクトリン違反）");
    if (!/専門家|税務署|年金事務所/.test(html))
      err(rel, "YMYL必須: 最終判断を専門家に委ねる旨の記載が無い");
  }

  // canonical / OGP / 構造化データ（2026-09-10 追加）
  // これらは **初回クロール前に入っていることに価値がある**。したがって
  // 意思決定ルール #4（公開2週間・表示回数0）の発火を待たずに必須とする。
  // 後から足しても、最初のクロールで拾われた形は上書きしにくい。
  const expectedCanon = canonicalFor(page);
  const canonMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  if (expectedCanon) {
    if (!canonMatch) err(rel, `canonical が無い（期待値 ${expectedCanon}）`);
    else if (canonMatch[1] !== expectedCanon)
      err(rel, `canonical が ${canonMatch[1]}。期待値は ${expectedCanon}`);
  }

  if (!noindex) {
    for (const prop of ["og:title", "og:description", "og:url"]) {
      if (!new RegExp(`property=["']${prop}["']`, "i").test(html))
        err(rel, `OGP ${prop} が無い。SNSで共有されたときの表示が壊れる`);
    }
    const ogUrl = html.match(/property=["']og:url["'][^>]*content=["']([^"']+)["']/i);
    if (ogUrl && expectedCanon && ogUrl[1] !== expectedCanon)
      err(rel, `og:url(${ogUrl[1]}) が canonical と食い違う`);
  }

  // JSON-LD は壊れていても画面には出ないので、機械で見るしかない
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(m[1]); }
    catch (e) { err(rel, `JSON-LD が壊れている: ${e.message}`); }
  }

  // 横スクロールを生みやすい書き方の検出（静的ヒューリスティック）
  // max-width は可変なので除外し、固定 width / min-width だけを見る
  for (const m of html.matchAll(/(?<!max-)\b(?:min-)?width\s*:\s*(\d{3,})px/gi))
    if (Number(m[1]) > 375) warn(rel, `固定幅 ${m[0].trim()}。375pxで溢れる恐れ`);
  if (/<table/i.test(html) && !/overflow-x\s*:\s*auto/i.test(html))
    warn(rel, "table があるが overflow-x:auto が無い。狭幅で横スクロールが出る");
}

// ── 2. 計算ロジックのテスト ──────────────────────────────────────────
// 各ツールは *.test.mjs を同居させる。テストの無いツールは公開できない。
const toolDirs = existsSync(join(SITE, "tools"))
  ? readdirSync(join(SITE, "tools")).filter((d) => statSync(join(SITE, "tools", d)).isDirectory())
  : [];

let assertions = 0;
for (const dir of toolDirs) {
  const abs = join(SITE, "tools", dir);
  const tests = walk(abs, ".test.mjs");
  if (tests.length === 0) {
    err(`docs/tools/${dir}`, "計算ロジックのテストが無い（公開前ゲート1を通過できない）");
    continue;
  }
  for (const t of tests) {
    const rel = relative(ROOT, t).replaceAll("\\", "/");
    try {
      const mod = await import(pathToFileURL(t).href);
      const cases = mod.default ?? mod.cases;
      if (typeof cases !== "function") { err(rel, "default export が関数でない"); continue; }
      const results = await cases();
      for (const r of results) {
        assertions++;
        if (!r.ok) err(rel, `失敗: ${r.name} — 期待 ${r.expected} / 実際 ${r.actual}`);
      }
    } catch (e) {
      err(rel, `テスト実行時エラー: ${e.message}`);
    }
  }
}

// ── 3. サイト全体の SEO 基盤 ────────────────────────────────────────
if (!existsSync(join(SITE, "robots.txt"))) err("docs/robots.txt", "存在しない");

const published = pipeline.site?.published_url;
if (published && !existsSync(join(SITE, "sitemap.xml")))
  err("docs/sitemap.xml", "公開URLが確定しているのに sitemap が無い。node scripts/gen_sitemap.mjs");

// 独自ドメインを使うなら docs/CNAME が必須。これが無いと GitHub Pages は
// カスタムドメインを配信せず、名前入りの <user>.github.io URL のまま公開される。
// 「設定したつもりで名前が出ていた」を機械的に防ぐ。
const domain = pipeline.site?.custom_domain;
const cnamePath = join(SITE, "CNAME");
if (domain) {
  if (!existsSync(cnamePath)) {
    err("docs/CNAME", `独自ドメイン ${domain} を使う設定だが CNAME が無い。node scripts/set_domain.mjs ${domain}`);
  } else {
    const cname = readFileSync(cnamePath, "utf8").trim();
    if (cname !== domain)
      err("docs/CNAME", `内容 "${cname}" が pipeline.json の custom_domain "${domain}" と一致しない`);
  }
} else if (existsSync(cnamePath)) {
  warn("docs/CNAME", "CNAME があるのに pipeline.json の custom_domain が未設定。どちらが正か確認する");
}

// Search Console の所有権確認タグ。pipeline.json を正とし、HTML と一致させる。
// これが黙って消えると所有権確認が外れ、計測が止まる。しかも
// 「サイトは見えているのに数字だけ来ない」という気づきにくい壊れ方をするので、
// 機械で守る（2026-09-10 追加）。
const gscToken = pipeline.site?.gsc_verification_token;
if (gscToken) {
  const home = join(SITE, "index.html");
  if (!existsSync(home)) err("docs/index.html", "存在しない");
  else if (!readFileSync(home, "utf8").includes(gscToken))
    err("docs/index.html",
      `Search Console の確認タグ（${gscToken.slice(0, 8)}…）が消えている。所有権確認が外れ計測が止まる`);
}

// ── 3.5. インフラのテスト（計測スクリプト） ──────────────────────────
// 2026-09-09 追加。公開されるツールにはテストを強制していたのに、
// **意思決定の入力そのものを作る fetch_metrics.py には1本も無かった。**
// 実際、35日間その成功経路は一度も実行されず、成功時に "sessions" を
// 出力しない（＝取得成功と未計測が下流から区別できない）欠陥が残っていた。
//
// テストは「書いた」だけでは腐るので、公開前ゲートから毎回実行する。
// ただし Python が無い環境では WARN に留める。この検査のために push は止めない
// （ツールの正しさとは独立した検査であり、止めると verify そのものが迂回される）。
let infraAssertions = 0;
let infraStatus = "未実行";
for (const t of [join(ROOT, "scripts", "fetch_metrics.test.py")]) {
  const rel = relative(ROOT, t).replaceAll("\\", "/");
  if (!existsSync(t)) { err(rel, "インフラのテストが見つからない"); continue; }

  const candidates = process.platform === "win32"
    ? [["py", ["-3", t]], ["python", [t]]]
    : [["python3", [t]], ["python", [t]]];
  let r = null;
  for (const [cmd, args] of candidates) {
    r = spawnSync(cmd, args, {
      encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    if (!r.error) break;
  }
  if (!r || r.error) {
    warn(rel, "Python を実行できないため未検査（py -3 / python3 が無い）");
    infraStatus = "スキップ（Python 未検出）";
    continue;
  }

  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const total = out.match(/(\d+)\/(\d+) PASS/);
  if (r.status === 0) {
    infraAssertions += total ? Number(total[2]) : 0;
    infraStatus = `アサーション ${infraAssertions}件`;
  } else {
    const fails = out.split(/\r?\n/).filter((l) => l.includes("[FAIL]")).map((l) => l.trim());
    err(rel, `失敗: ${fails.join(" / ") || out.trim().slice(0, 300)}`);
    // 「失敗」を「スキップ」と表示しない。検査が落ちたことを要約行から隠さない。
    infraStatus = `失敗 ${fails.length || 1}件`;
  }
}

// ── 3.6. インフラのテスト（通知の到達判定） ──────────────────────────
// 2026-09-10 追加。9/08 に notify_human.ps1 の境界テストを4件書いたが、
// **その場で走らせただけでコミットしなかった**ため、9/10 に同じ向きの欠陥が再発した
// （プロジェクト側の掲示が自分の処理系に触られ「読まれた」と誤判定していた）。
// 判定器の誤りは「もう催促しなくてよい」という方向に効くので、静かに私を黙らせる。
// 走らせ続けない検査は無いのと同じなので、ここから毎回実行する。
let notifyStatus = "未実行";
{
  const t = join(ROOT, "scripts", "notify_human.test.ps1");
  const rel = relative(ROOT, t).replaceAll("\\", "/");
  if (!existsSync(t)) {
    err(rel, "通知判定のテストが見つからない");
    notifyStatus = "欠落";
  } else if (process.platform !== "win32") {
    warn(rel, "Windows 以外のため未検査（PowerShell 5.1 前提）");
    notifyStatus = "スキップ（非Windows）";
  } else {
    const r = spawnSync("powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", t], { encoding: "utf8" });
    if (r.error) {
      warn(rel, "PowerShell を実行できないため未検査");
      notifyStatus = "スキップ（PowerShell 未検出）";
    } else {
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const m = out.match(/(\d+)\/(\d+) PASS/);
      if (r.status === 0) {
        notifyStatus = `アサーション ${m ? m[2] : "?"}件`;
      } else {
        const fails = out.split(/\r?\n/).filter((l) => l.includes("[FAIL]")).map((l) => l.trim());
        err(rel, `失敗: ${fails.join(" / ") || out.trim().slice(0, 300)}`);
        notifyStatus = `失敗 ${fails.length || 1}件`;
      }
    }
  }
}

// ── 3.7. 人間キューの整合（記録と実体の突き合わせ） ──────────────────
// 2026-09-11 追加。2026-09-10 の決定ログには「sitemap 送信の手順を人間キューに
// 戻した」と書いてあったが、実際の SETUP_HUMAN.md には「sitemap」の語が1つも無かった。
// 同じ日に同ファイルを2回書き換えており、2回目の節ごとの差し替えで消えていた。
//
// **この欠落は git では見えない。** SETUP_HUMAN.md は .gitignore 済みで未追跡なので、
// 削除は diff にもコミットにも現れない。決定ログとファイルが食い違っても、
// 突き合わせる仕組みが無ければ誰も気づかない。
//
// 誤りの向きが最悪である: 記録上は「依頼済み・あとは人間待ち」に見えるため、
// 私は催促もせずに待つ側へ倒れる。人間から見れば依頼は存在しない。
// sitemap 送信は discovery の実測で「Google への唯一の確実な入口」と分かっているため、
// これが静かに消えることは流入そのものが永久に始まらないことを意味する。
let queueStatus = "対象外";
{
  const rel = "SETUP_HUMAN.md";
  const queuePath = join(ROOT, rel);
  const submitted = pipeline.discovery?.sitemap_submitted_on ?? null;
  const task = (pipeline.blocked_on_human ?? []).find((t) => t?.id === "STEP1.5-5");
  const needsStep = !submitted && task?.status === "pending";

  if (!needsStep) {
    queueStatus = submitted ? `sitemap 送信済み(${submitted}) — 検査対象外` : "対象外";
  } else if (!existsSync(queuePath)) {
    // ファイルごと無い場合は WARN に留める。今回実際に起きた壊れ方は
    // 「ファイルはあるが手順だけ消える」であり、そちらを確実に止める側へ倒す。
    warn(rel, "人間キューのファイルが見つからない（唯一の依頼経路である）");
    queueStatus = "スキップ（ファイル無し）";
  } else {
    const q = readFileSync(queuePath, "utf8");
    const missing = [];
    if (!/sitemap|サイトマップ/i.test(q)) missing.push("sitemap 送信の手順");
    if (!/search\.google\.com\/search-console|Search Console/i.test(q))
      missing.push("Search Console への導線");
    if (missing.length)
      err(rel,
        `sitemap が未送信なのに人間キューに ${missing.join(" と ")} が無い。` +
        `記録上は依頼済みに見えるが実体が存在しない（2026-09-11 に実際に起きた壊れ方）`);

    // 9/10 に一次情報で誤りと確認した主張。決定ログだけ訂正して
    // 人間が読む文書に残していると、間違った理由が間違った行動リストを生む。
    //
    // ⚠ この検査は初版で自分の訂正文に誤爆した。誤りを撤回するには誤りを引用する
    // 必要があるため、文字列の一致だけでは「主張」と「その撤回」を区別できない。
    // そこで一致箇所の周囲を見て、訂正の目印があれば主張とみなさない。
    // 誤りの向きは「見逃す側」に倒してある——訂正文を ERROR にすると、
    // 直した人間（私）が検査を黙らせるために訂正そのものを消す方向に圧力がかかり、
    // 記録が痩せる。見逃せば次に気づいた者が直せばよい。
    const claimRe = /(登録|STEP\s*1\.5)[^。\n]{0,20}(が?済めば|すれば)[^。\n]{0,12}索引[^。\n]{0,8}(始まり|進み)/g;
    const isRetracted = (text, at) => {
      const ctx = text.slice(Math.max(0, at - 160), at + 260);
      return /誤り|訂正|間違い|ではありません|でした[』」]?\s*$|書いていましたが/.test(ctx);
    };
    for (const m of q.matchAll(claimRe)) {
      if (isRetracted(q, m.index)) continue;
      err(rel,
        "『登録すれば索引が始まる』という記述が残っている。2026-09-10 に一次情報で否定済み" +
        "（索引を始動させるのは sitemap 送信か被リンク）");
      break;
    }

    queueStatus = missing.length ? "不整合" : "整合";
  }
}

// ── 4. 実レンダリング検証（puppeteer があるときだけ） ────────────────
let rendered = false;
try {
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch();
  for (const page of pages) {
    const rel = relative(ROOT, page).replaceAll("\\", "/");
    const tab = await browser.newPage();
    await tab.setViewport({ width: 375, height: 812 });
    await tab.goto(pathToFileURL(page).href, { waitUntil: "load" });
    const over = await tab.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) err(rel, `375px で ${over}px 横に溢れている`);
    await tab.close();
  }
  await browser.close();
  rendered = true;
} catch { /* 未導入なら静的検査のみで続行 */ }

// ── 結果 ─────────────────────────────────────────────────────────────
console.log(`検査: HTML ${pages.length}枚 / ツール ${toolDirs.length}本 / アサーション ${assertions}件`);
console.log(`インフラ検査: fetch_metrics.py — ${infraStatus}`);
console.log(`インフラ検査: notify_human.ps1 — ${notifyStatus}`);
console.log(`人間キューの整合: SETUP_HUMAN.md — ${queueStatus}`);
console.log(rendered
  ? "375px 実レンダリング検証: 実施"
  : "375px 実レンダリング検証: スキップ（npm i -D puppeteer で有効化）");

for (const w of warns) console.log(`  WARN  ${w}`);
for (const e of errors) console.log(`  ERROR ${e}`);

if (errors.length) {
  console.log(`\n公開不可: ERROR ${errors.length}件。修正するまで push しないこと。`);
  process.exit(1);
}
console.log(`\n公開可（WARN ${warns.length}件）`);
