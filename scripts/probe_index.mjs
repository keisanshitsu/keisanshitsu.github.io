#!/usr/bin/env node
// 非Google検索エンジンの索引状態を測る。
//
// なぜ書くのか（2026-09-23）:
// 9/22 に IndexNow で発見経路を 0→1 にしたが、得られた応答は 202
// （"URL received. IndexNow key validation pending."）であって索引の証明ではない。
// meta.production_hold_2026-09-22 の解除条件(b) は
// 「IndexNow 参加エンジンが実際にクロールした証拠を1回でも実測できる」であり、
// **その測り方が存在しなかった。** これはその測定器である。
//
// ⚠ 索引状態の測定は 2026-09-10 と 09-12 に2回失敗している（Bing は site: 演算子を
// 無視し、DuckDuckGo は CAPTCHA を返した）。本日 09-23 も、Bing の HTML と RSS は
// **対照実験に落ちた**——`gojikara.com` を検索して zhihu.com や microsoft.com が返り、
// クエリと無関係の結果を返していた。grep の件数だけ見ていれば「調べた」と書けてしまう。
//
// したがって本スクリプトは **対照実験を毎回同時に走らせ、対照に落ちたら判定を出さない。**
// 「見つからなかった」と「測れなかった」を別の値として返す。ここを畳むと、
// 測定器の故障が「索引されていない」という結論に化ける。
//
// 出典（2026-09-23 に取得して逐語確認）:
//   https://duckduckgo.com/duckduckgo-help-pages/results/sources/
//   "we have more traditional links and images in our search results too,
//    which we largely source from Bing."
//   "We also maintain our own crawler (DuckDuckBot) and many indexes to support our results."
// → DuckDuckGo に出れば「Bing か DuckDuckBot のどちらかが当ホストに到達した」ことになる。
//   Bing は IndexNow 参加エンジンである。ただし **IndexNow が原因だとは証明できない**。

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = "https://html.duckduckgo.com/html/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

// ── 純関数（テスト対象。ネットワークに触らない） ───────────────────────

// DuckDuckGo の HTML 版は、結果リンクを素の href で出すことも、
// //duckduckgo.com/l/?uddg=<encoded> という転送で包むこともある。両方を解く。
// 片方しか解かない実装は、包まれた日に「結果0件」を返し、しかも
// それが「索引されていない」に見える——最も避けたい向きの誤りである。
export function extractResultUrls(html) {
  const out = [];
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"/g;
  for (const m of html.matchAll(re)) {
    let href = m[1].replace(/&amp;/g, "&");
    if (href.startsWith("//")) href = `https:${href}`;
    try {
      const u = new URL(href);
      const wrapped = u.searchParams.get("uddg");
      out.push(wrapped ? wrapped : u.toString());
    } catch {
      /* 解けないものは落とす。件数を水増ししない */
    }
  }
  return out;
}

export function normalizeHost(host) {
  return String(host || "").toLowerCase().replace(/^www\./, "");
}

export function hostsOf(urls) {
  const out = [];
  for (const u of urls) {
    try { out.push(normalizeHost(new URL(u).host)); } catch { /* skip */ }
  }
  return out;
}

export function containsHost(urls, host) {
  return hostsOf(urls).includes(normalizeHost(host));
}

// 1件のクエリが判定材料として使えるか。
// 2026-09-23 の初回実行で、3本目のクエリだけ HTTP 202・結果0件が返った
// （DuckDuckGo 側の流量制限とみられる）。初版はこれを黙って「見つからなかった」に
// 数えていた。**応答が返らなかったことと、当サイトが無かったことは別である。**
// 全クエリがこうなった日に「索引されていない」と結論する穴だったので塞いだ。
export function isQueryUsable(r) {
  return r?.http === 200 && (r?.result_count ?? 0) > 0;
}

// 判定。**対照が通らなければ「見つからない」を返さない。**
//   pos_control … 実在する小規模サイトを名指しで引いて、実際にそのホストが出るか
//   neg_control … 実在しない文字列を引いて、そのホストが出ないか（出たら誤検出器）
//   usableQueries … 上の条件を満たしたクエリの本数。0本なら何も言えない
export function verdict({ posControlFound, negControlFound, ourFound, usableQueries = 1 }) {
  if (!posControlFound) {
    return {
      state: "detector_broken",
      indexed: null,
      why: "陽性対照が出なかった。検索経路そのものが機能していない（クエリ無関係の結果／ブロック）ため、当サイトについては何も言えない",
    };
  }
  if (negControlFound) {
    return {
      state: "detector_broken",
      indexed: null,
      why: "陰性対照が出た。存在しないホストを『見つけた』と言う判定器であり、当サイトの検出も信用できない",
    };
  }
  if (ourFound) {
    return {
      state: "found",
      indexed: true,
      why: "当ホストのURLが実際に検索結果に出た。少なくとも1つのクローラが当ホストに到達し索引している",
    };
  }
  if (usableQueries < 1) {
    return {
      state: "detector_broken",
      indexed: null,
      why: "当サイトを引いたクエリが1本も成立しなかった（HTTP が 200 でない、または結果0件）。応答が返らなかったことを『索引されていない』と読まない",
    };
  }
  return {
    state: "not_found",
    indexed: false,
    why: "対照は通ったが当ホストは出なかった。この時点で索引されていないことを示す。⚠ ただしクロール済みで索引反映待ちの状態と区別できない",
  };
}

// 「見つかった／見つからない」が何を証明し、何を証明しないか。
// ここを機械可読に置くのは、未来の私が state だけ読んで話を大きくするのを防ぐため。
export const PROVES = {
  found_proves_crawled: true,
  found_proves_indexnow_worked: false,
  found_proves_google: false,
  not_found_proves_not_crawled: false,
  source_note:
    "DuckDuckGo の web 結果は largely Bing 由来（＋自社 DuckDuckBot）。Bing は IndexNow 参加エンジンだが、索引の原因が IndexNow かどうかは区別できない。Google は別物であり、ここで何が出ても Google の索引状態は1ミリも分からない",
};

// ── 副作用のある部分 ───────────────────────────────────────────────

async function search(query) {
  const body = new URLSearchParams({ q: query }).toString();
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body,
    });
    const html = await r.text();
    return { query, status: r.status, urls: extractResultUrls(html), bytes: html.length };
  } catch (e) {
    return { query, status: null, urls: [], bytes: 0, error: String(e?.message ?? e) };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pipeline = JSON.parse(readFileSync(join(ROOT, "state", "pipeline.json"), "utf8"));
  const origin = pipeline.site?.published_url;
  if (!origin) throw new Error("site.published_url が pipeline.json に無い");
  const host = normalizeHost(new URL(origin).host);

  // 陽性対照は「実在する小規模サイトをホスト名で引く」。当サイトへのクエリと同じ形にする。
  // 大手（wikipedia 等）を対照にすると、小規模サイトを引けない故障を見逃す。
  const POS_CONTROL_QUERY = "gojikara.com";
  const POS_CONTROL_HOST = "gojikara.com";
  const NEG_CONTROL_QUERY = "zzqqxxnonexistentdomain12345.example";
  const NEG_CONTROL_HOST = "zzqqxxnonexistentdomain12345.example";

  const pos = await search(POS_CONTROL_QUERY);
  await sleep(4000);
  const neg = await search(NEG_CONTROL_QUERY);
  await sleep(4000);

  const queries = [host, ...(process.argv.slice(2).filter((a) => !a.startsWith("--")))];
  const ours = [];
  for (const q of queries) {
    const r = await search(q);
    ours.push({ ...r, our_host_found: containsHost(r.urls, host) });
    await sleep(4000);
  }

  const posFound = containsHost(pos.urls, POS_CONTROL_HOST);
  const negFound = containsHost(neg.urls, NEG_CONTROL_HOST);
  const ourFound = ours.some((r) => r.our_host_found);
  const queryRows = ours.map((r) => ({
    query: r.query, http: r.status, result_count: r.urls.length,
    our_host_found: r.our_host_found, top_hosts: hostsOf(r.urls).slice(0, 5),
  }));
  const usable = queryRows.filter(isQueryUsable);

  const result = {
    ran_at: new Date().toISOString(),
    engine: "DuckDuckGo(html) — web結果は largely Bing 由来",
    host,
    controls: {
      positive: { query: POS_CONTROL_QUERY, expect_host: POS_CONTROL_HOST, found: posFound, http: pos.status, result_count: pos.urls.length },
      negative: { query: NEG_CONTROL_QUERY, expect_absent_host: NEG_CONTROL_HOST, found: negFound, http: neg.status, result_count: neg.urls.length },
    },
    queries: queryRows.map((r) => ({ ...r, usable: isQueryUsable(r) })),
    usable_query_count: usable.length,
    verdict: verdict({
      posControlFound: posFound, negControlFound: negFound, ourFound,
      usableQueries: usable.length,
    }),
    ...PROVES,
  };

  console.log(JSON.stringify(result, null, 2));
  // ⚠ process.exit() は使わない。fetch のハンドルを閉じる前に落とすと Windows の
  // libuv が assertion で死に、終了コードが -1073740791 に化ける（2026-09-22 実測）。
  if (result.verdict.state === "detector_broken") process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error(`[ERROR] ${e.message}`); process.exitCode = 1; });
}
