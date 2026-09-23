#!/usr/bin/env node
// IndexNow への URL 送信。
//
// なぜこれを書くのか（2026-09-22）:
// 発見経路は48日間ゼロのままで、Google への唯一の入口（sitemap 送信）は
// 人間の操作が要る。だが **Google 以外には、人間の作業ゼロで開ける入口があった。**
// IndexNow はアカウント登録も本人確認も不要で、ホスト直下に鍵ファイルを置き
// URL のリストを POST するだけで受理される。参加エンジンは Bing / Yandex /
// Naver / Seznam / Amazon / Yep（Google は不参加）。
//   一次情報: https://www.indexnow.org/documentation
//
// この経路は 2026-09-13 に一度発見されながら、9日間実行されないまま置かれていた。
// 「Google が居ないのでボトルネックは解消しない」は正しいが、
// **解消しないことは、やらない理由にならない。** ゼロを1にするのはこれだけである。
//
// ⚠ 本スクリプトが証明するのは「受理された」までで、「索引された」ではない。
// 202 は仕様上 "URL received. IndexNow key validation pending." である。
// 応答コードを状態と読み替えない（CLAUDE.md「応答コードは結果の報告であって
// 状態そのものではない。GET して実際を見る」）。

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = "https://api.indexnow.org/indexnow";

// ── 純関数（テスト対象。ネットワークに触らない） ───────────────────────

// 鍵の妥当性。仕様は「最低8・最大128文字、a-z A-Z 0-9 と - のみ」。
// 長さだけを見て文字種を見ない実装は、鍵ファイル名に使えない文字を通してしまう。
export function validateKey(key) {
  if (typeof key !== "string") return { ok: false, reason: "鍵が文字列でない" };
  if (key.length < 8 || key.length > 128) {
    return { ok: false, reason: `鍵の長さが ${key.length} 文字（8〜128 の範囲外）` };
  }
  if (!/^[a-zA-Z0-9-]+$/.test(key)) {
    return { ok: false, reason: "鍵に使えない文字が含まれる（a-z A-Z 0-9 - のみ）" };
  }
  return { ok: true, reason: null };
}

export function hostOf(url) {
  return new URL(url).host;
}

// sitemap.xml を唯一の出典にする。
// ツールのURLをここで別途列挙すると、9/18 の T006 と同じ事故（サイトのどこからも
// 辿り着けないページが生まれる）を別の場所で再現することになる。出典は1つにする。
export function urlsFromSitemap(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

// 送信対象は「鍵ファイルと同じホストのURL」だけ。
// 仕様上、他ホストのURLが混ざると 422 でリスト全体が弾かれる。
export function partitionByHost(urls, host) {
  const same = [];
  const other = [];
  for (const u of urls) {
    let h = null;
    try { h = hostOf(u); } catch { h = null; }
    (h === host ? same : other).push(u);
  }
  return { same, other };
}

// --probe 用。送るのはトップ1件だけにする。
//
// なぜ1件か（2026-09-23）: probe の目的は索引の催促ではなく、
// **鍵が検証済みかどうかを応答コードから読むこと**である。仕様上
// 200 = "URL submitted successfully"（鍵は検証済み）、
// 202 = "URL received. IndexNow key validation pending."。
// そして鍵の検証は "search engines will crawl the key file to verify ownership" で行われる。
// つまり 200 に変われば、**参加エンジンが当ホストへ実際に取りに来た**ことの証拠になる。
//   一次情報: https://www.indexnow.org/documentation
// 変更の無いURLを毎日全件送るのは仕様上スパム扱い（429）に向かう行為なので、
// 観測のための送信は最小の1件に絞る。
export function selectProbeUrls(urls, origin) {
  const hit = urls.find((u) => u === origin || u === `${origin}/`);
  return hit ? [hit] : urls.slice(0, 1);
}

export function buildPayload({ host, key, keyLocation, urlList }) {
  const body = { host, key, urlList };
  // keyLocation はホスト直下に置いた場合は不要。空文字を送ると 403 の原因になる。
  if (keyLocation) body.keyLocation = keyLocation;
  return body;
}

// 応答の解釈。**200 と 202 を同じ「成功」に畳まない。**
// 202 は鍵の検証がまだ済んでいない状態であり、鍵ファイルが配信されていなければ
// 後から黙って捨てられる。畳むと「送った＝届いた」と記録してしまう。
export function classifyResponse(status) {
  const table = {
    200: { accepted: true, key_validated: true, meaning: "OK。URL を受理し鍵も検証済み" },
    202: { accepted: true, key_validated: false, meaning: "Accepted。受理したが鍵の検証は保留中" },
    400: { accepted: false, key_validated: false, meaning: "Bad Request。形式が不正" },
    403: { accepted: false, key_validated: false, meaning: "Forbidden。鍵が無効（ファイルが無い／中身が一致しない）" },
    422: { accepted: false, key_validated: false, meaning: "Unprocessable。URL がホストに属さない、または鍵が形式と不一致" },
    429: { accepted: false, key_validated: false, meaning: "Too Many Requests。送りすぎ（スパム判定）" },
  };
  return table[status] ?? {
    accepted: false, key_validated: false, meaning: `未知の応答コード ${status}`,
  };
}

// 索引されたことの証明にはならない、を機械可読に残す。
// 人間（と未来の私）が「受理＝流入が始まる」と読み替えるのを防ぐ。
export const PROVES = {
  proves_received: true,
  proves_crawled: false,
  proves_indexed: false,
  proves_google: false,
  note: "IndexNow に Google は参加していない。受理は索引でも流入でもない",
};

// ── 副作用のある部分 ───────────────────────────────────────────────

// 鍵ファイルが **実際に配信されているか** を GET して確かめる。
// これを省くと 403 の原因が「鍵が違う」のか「まだ Pages が反映していない」のか
// 切り分けられない。POST の前に必ず実体を見る。
async function verifyKeyFileLive(origin, key) {
  const url = new URL(`/${key}.txt`, origin).toString();
  try {
    const r = await fetch(url, { redirect: "follow" });
    const text = (await r.text()).trim();
    return { url, status: r.status, live: r.status === 200 && text === key, body_matches: text === key };
  } catch (e) {
    return { url, status: null, live: false, body_matches: false, error: String(e?.message ?? e) };
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const probe = process.argv.includes("--probe");
  const pipeline = JSON.parse(readFileSync(join(ROOT, "state", "pipeline.json"), "utf8"));

  const origin = pipeline.site?.published_url;
  const key = pipeline.discovery?.indexnow?.key;
  if (!origin) throw new Error("site.published_url が pipeline.json に無い");

  const keyCheck = validateKey(key ?? "");
  if (!keyCheck.ok) throw new Error(`鍵が不正: ${keyCheck.reason}`);

  const keyFile = join(ROOT, "docs", `${key}.txt`);
  if (!existsSync(keyFile)) throw new Error(`鍵ファイルがローカルに無い: docs/${key}.txt`);
  if (readFileSync(keyFile, "utf8").trim() !== key) {
    throw new Error("鍵ファイルの中身が pipeline.json の鍵と一致しない");
  }

  const host = hostOf(origin);
  const xml = readFileSync(join(ROOT, "docs", "sitemap.xml"), "utf8");
  const { same: allUrls, other } = partitionByHost(urlsFromSitemap(xml), host);
  if (allUrls.length === 0) throw new Error("sitemap.xml から送信対象のURLが取れない");
  const urlList = probe ? selectProbeUrls(allUrls, origin.replace(/\/$/, "")) : allUrls;

  const result = {
    ran_at: new Date().toISOString(),
    endpoint: ENDPOINT,
    host,
    mode: probe ? "probe（鍵の検証状態を読むための最小送信）" : "full",
    url_count: urlList.length,
    urls: urlList,
    skipped_other_host: other,
    dry_run: dryRun,
    ...PROVES,
  };

  // 実体の確認 → それから POST。順番を入れ替えない。
  result.key_file = await verifyKeyFileLive(origin, key);
  if (!result.key_file.live) {
    result.submitted = false;
    result.reason = "鍵ファイルが配信されていないため送信しない（push と Pages のビルドを待つ）";
    console.log(JSON.stringify(result, null, 2));
    // ⚠ ここで process.exit(1) を呼ぶと、fetch が握っているハンドルを閉じる前に
    // プロセスを落とすため Windows の libuv が assertion で死に、終了コードが
    // -1073740791 になる（2026-09-22 に実測）。**呼び出し側が読むのは終了コードである。**
    // 「失敗した」を伝えるはずの値が、クラッシュの値に化けていた。
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    result.submitted = false;
    result.reason = "--dry-run のため送信しない";
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(buildPayload({ host, key, urlList })),
  });
  result.submitted = true;
  result.status = res.status;
  result.verdict = classifyResponse(res.status);
  result.response_body = (await res.text()).slice(0, 500);

  console.log(JSON.stringify(result, null, 2));
  if (!result.verdict.accepted) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error(`[ERROR] ${e.message}`); process.exitCode = 1; });
}
