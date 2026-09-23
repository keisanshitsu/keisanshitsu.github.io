#!/usr/bin/env node
// probe_index.mjs の境界テスト。ネットワークには触らない。
//
// 主眼は1点だけである: **対照に落ちた測定を「索引されていない」に畳まないこと。**
// 2026-09-10・09-12・そして 09-23 の Bing と、索引状態の測定は3回壊れた。
// 壊れ方はいずれも「200 が返り、結果らしき HTML も返るが、クエリと無関係」だった。
// 件数だけ見る判定器はこれを検出できず、しかも出る誤りは
// 「見つからない＝索引されていない」＝**私を諦めさせる向き**である。

import {
  extractResultUrls, normalizeHost, hostsOf, containsHost, verdict, isQueryUsable, PROVES,
} from "./probe_index.mjs";

const results = [];
const t = (name, ok, expected, actual) => results.push({ name, ok, expected, actual });
const eq = (name, actual, expected) =>
  t(name, JSON.stringify(actual) === JSON.stringify(expected), expected, actual);

// ── 結果リンクの抽出 ──
const htmlDirect = `
<div><a class="result__a" href="https://gojikara.com/about.html">about</a></div>
<div><a rel="nofollow" class="result__a js-result-title-link" href="http://www.gojikara.com/">top</a></div>
<div><a class="result__snippet" href="https://not-a-result.example/">snippet</a></div>`;
eq("A1 result__a だけを拾う", extractResultUrls(htmlDirect).length, 2);
eq("A2 他クラスのリンクは拾わない",
  extractResultUrls(htmlDirect).some((u) => u.includes("not-a-result")), false);

// DDG が転送で包む形。包まれた日に0件を返す実装は、
// 「索引されていない」という誤った結論を静かに出す。
const htmlWrapped = `
<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fkeisanshitsu.github.io%2Ftools%2Froof-area%2F&amp;rut=x">t</a>`;
eq("A3 uddg 転送を解いて実URLにする",
  extractResultUrls(htmlWrapped), ["https://keisanshitsu.github.io/tools/roof-area/"]);
eq("A4 &amp; を含む href も解ける",
  containsHost(extractResultUrls(htmlWrapped), "keisanshitsu.github.io"), true);
eq("A5 結果が無ければ空配列", extractResultUrls("<html></html>"), []);
eq("A6 壊れたURLは件数に数えない",
  extractResultUrls(`<a class="result__a" href="ht!tp://[bad">x</a>`), []);

// ── ホストの正規化と照合 ──
eq("B1 www. を落とす", normalizeHost("www.Example.COM"), "example.com");
eq("B2 大文字を落とす", normalizeHost("KEISANSHITSU.github.io"), "keisanshitsu.github.io");
eq("B3 ホスト一覧を取る",
  hostsOf(["https://a.example/1", "https://www.b.example/2"]), ["a.example", "b.example"]);
eq("B4 部分一致でホストを名乗らせない（別ホストを誤検出しない）",
  containsHost(["https://github.com/keisanshitsu"], "keisanshitsu.github.io"), false);
eq("B5 当ホストのURLは検出する",
  containsHost(["https://keisanshitsu.github.io/tools/roof-area/"], "keisanshitsu.github.io"), true);

// ── 判定。ここが本テストの主眼 ──
// 陽性対照が出ないときは「見つからない」ではなく「測れなかった」。
eq("C1 陽性対照が落ちたら detector_broken",
  verdict({ posControlFound: false, negControlFound: false, ourFound: false }).state,
  "detector_broken");
eq("C2 陽性対照が落ちたら indexed は null（false にしない）",
  verdict({ posControlFound: false, negControlFound: false, ourFound: false }).indexed, null);
eq("C3 陽性対照が落ちていれば、当サイトが出ても信用しない",
  verdict({ posControlFound: false, negControlFound: false, ourFound: true }).state,
  "detector_broken");
eq("C4 陰性対照が出たら detector_broken",
  verdict({ posControlFound: true, negControlFound: true, ourFound: false }).state,
  "detector_broken");
eq("C5 対照が通り当サイトが出れば found",
  verdict({ posControlFound: true, negControlFound: false, ourFound: true }).state, "found");
eq("C6 found のとき indexed は true",
  verdict({ posControlFound: true, negControlFound: false, ourFound: true }).indexed, true);
eq("C7 対照が通り当サイトが出なければ not_found",
  verdict({ posControlFound: true, negControlFound: false, ourFound: false }).state, "not_found");
eq("C8 not_found と detector_broken は別の値である",
  verdict({ posControlFound: true, negControlFound: false, ourFound: false }).state ===
  verdict({ posControlFound: false, negControlFound: false, ourFound: false }).state, false);

// ── クエリが判定材料として使えるか（2026-09-23 の初回実行で見つけた自分のバグ） ──
// 実行してみたら3本目のクエリだけ HTTP 202・結果0件が返った。初版はこれを黙って
// 「見つからなかった」に数えていた。応答が返らなかったことと、当サイトが無かったことは別。
eq("E1 200 かつ結果ありなら使える", isQueryUsable({ http: 200, result_count: 10 }), true);
eq("E2 202 は使えない（流量制限で結果0件だった実測）",
  isQueryUsable({ http: 202, result_count: 0 }), false);
eq("E3 200 でも結果0件なら使えない", isQueryUsable({ http: 200, result_count: 0 }), false);
eq("E4 応答なし（null）は使えない", isQueryUsable({ http: null, result_count: 0 }), false);
eq("F1 使えるクエリが0本なら detector_broken（not_found にしない）",
  verdict({ posControlFound: true, negControlFound: false, ourFound: false, usableQueries: 0 }).state,
  "detector_broken");
eq("F2 そのとき indexed は null",
  verdict({ posControlFound: true, negControlFound: false, ourFound: false, usableQueries: 0 }).indexed,
  null);
eq("F3 使えるクエリが1本でもあれば not_found を出す",
  verdict({ posControlFound: true, negControlFound: false, ourFound: false, usableQueries: 1 }).state,
  "not_found");

// ── 何を証明しないか ──
eq("D1 見つかっても IndexNow が効いた証明にはならない", PROVES.found_proves_indexnow_worked, false);
eq("D2 見つかっても Google の索引状態は分からない", PROVES.found_proves_google, false);
eq("D3 見つからなくてもクロールされていない証明にはならない", PROVES.not_found_proves_not_crawled, false);
eq("D4 見つかればクロールされた証明にはなる", PROVES.found_proves_crawled, true);

const pass = results.filter((r) => r.ok).length;
for (const r of results.filter((r) => !r.ok)) {
  console.log(`[FAIL] ${r.name}: expected=${JSON.stringify(r.expected)} actual=${JSON.stringify(r.actual)}`);
}
console.log(`${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
