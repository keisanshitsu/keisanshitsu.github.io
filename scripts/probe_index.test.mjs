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
  summarizeHistory, parseHistory, shouldRetry, ourHostUrls, negControlTested,
  pickRotatingTool, extractTitle, normalizeUrl, toolPageVerdict, usableHostRows,
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

// ── 履歴の集計（2026-10-03） ──
eq("H1 履歴が空なら故障率は null（0 と書かない）", summarizeHistory([]).broken_rate, null);
eq("H2 3回中1回壊れれば 0.33",
  summarizeHistory([{ state: "not_found" }, { state: "detector_broken" }, { state: "not_found" }]).broken_rate, 0.33);
eq("H3 未知の state は回数に数えない（回していない日を壊れた日にしない）",
  summarizeHistory([{ state: "skipped" }, { state: "not_found" }]).runs, 1);
eq("H4 最後に found した時刻を返す",
  summarizeHistory([{ state: "found", ran_at: "a" }, { state: "not_found", ran_at: "b" }, { state: "found", ran_at: "c" }]).last_found_at, "c");
eq("H5 壊れた行・空行・CRLF を飛ばして読む",
  parseHistory('{"state":"found"}\r\n\r\nnot json\n{"state":"not_found"}\n').length, 2);

// ── 引き直し ──
eq("R1 202（流量制限）は引き直す", shouldRetry(202), true);
eq("R2 200 は引き直さない", shouldRetry(200), false);
eq("R3 通信失敗（null）は引き直さない", shouldRetry(null), false);
eq("R4 引き直しても判定基準は緩めない（202 のままなら不成立）",
  isQueryUsable({ http: 202, result_count: 10 }), false);

// ── どのURLが出たか・陰性対照が検査されたか（2026-10-20） ──
// 10/19 の初の found で、出たのがトップかツールかを記録しておらず確かめられなかった。
eq("U1 当ホストのURLだけを出た順に返す",
  ourHostUrls(["https://github.com/keisanshitsu", "https://keisanshitsu.github.io/tools/shed/",
    "https://www.keisanshitsu.github.io/"], "keisanshitsu.github.io"),
  ["https://keisanshitsu.github.io/tools/shed/", "https://www.keisanshitsu.github.io/"]);
eq("U2 同じURLは1回だけ",
  ourHostUrls(["https://keisanshitsu.github.io/", "https://keisanshitsu.github.io/"], "keisanshitsu.github.io").length, 1);
eq("U3 部分一致のホストは含めない（B4 と同じ向き）",
  ourHostUrls(["https://keisanshitsu.github.io.evil.example/"], "keisanshitsu.github.io"), []);
eq("U4 壊れたURLは飛ばす", ourHostUrls(["ht!tp://[bad"], "keisanshitsu.github.io"), []);
eq("N1 陰性対照 200 は検査された（0件が正常）", negControlTested(200), true);
eq("N2 陰性対照 202 は検査されていない（10/19 の実例）", negControlTested(202), false);
eq("N3 通信失敗も検査されていない", negControlTested(null), false);

// ── ツールのページの照会（2026-11-01 週次） ──
// ホスト名で引いてトップが出た found を、ツールの found に数えない。ここが主眼。
const TOOLS = [
  { id: "T003", path: "docs/tools/b/", published_url: "https://keisanshitsu.github.io/tools/b/" },
  { id: "T002", path: "docs/tools/a/", published_url: "https://keisanshitsu.github.io/tools/a/" },
  { id: "T001", path: "docs/tools/x/" }, // 未公開（published_url なし）
  { id: "T004", path: "docs/tools/c/", published_url: "https://keisanshitsu.github.io/tools/c/" },
];
// 2026-11-08 週次: 日付ではなく履歴で選ぶ（最後に測れた日がいちばん古いもの）。
const probed = (id, at, found = true) => ({ ran_at: at, tool_probe: { id, http: 200, found_tool_page: found } });
// 履歴に1回ずつ積みながら n 回選ぶ。本数が途中で増える（add）場合も再現する
const simulate = (n, add = {}) => {
  const hist = [];
  let tools = [...TOOLS];
  const picked = [];
  for (let i = 0; i < n; i++) {
    if (add[i]) tools = [...tools, add[i]];
    const t = pickRotatingTool(tools, hist);
    picked.push(t.id);
    hist.push(probed(t.id, new Date(Date.UTC(2026, 10, 2 + i)).toISOString()));
  }
  return picked;
};
eq("P1 同じ履歴なら同じツール（決定的）",
  pickRotatingTool(TOOLS, [probed("T002", "2026-11-02T00:00:00Z")]).id,
  pickRotatingTool(TOOLS, [probed("T002", "2026-11-02T00:00:00Z")]).id);
eq("P2 履歴が空なら公開済みの最小 id", pickRotatingTool(TOOLS, []).id, "T002");
eq("P3 一度も測れていないものを先に引く",
  pickRotatingTool(TOOLS, [probed("T002", "2026-11-02T00:00:00Z")]).id, "T003");
eq("P4 全部測ったら、最後に測れた日がいちばん古いもの",
  pickRotatingTool(TOOLS, [probed("T003", "2026-11-02T00:00:00Z"), probed("T002", "2026-11-03T00:00:00Z"),
    probed("T004", "2026-11-04T00:00:00Z")]).id, "T003");
eq("P5 連続3回で公開済み3本を1回ずつ引く", simulate(3).sort(), ["T002", "T003", "T004"]);
eq("P6 本数が途中で増えても一巡するまで重複しない（旧版は日付 % 本数で飛んだ・11/02〜11/08 の実例）",
  simulate(4, { 1: { id: "T005", path: "docs/tools/d/", published_url: "https://keisanshitsu.github.io/tools/d/" } }).sort(),
  ["T002", "T003", "T004", "T005"]);
eq("P7 202 で測れなかった回（null）は引いたことにしない",
  pickRotatingTool(TOOLS, [probed("T002", "2026-11-02T00:00:00Z", null)]).id, "T002");
eq("P8 未公開のツールは引かない", simulate(6).includes("T001"), false);
eq("P9 入力の並び順に依存しない（id 順）",
  pickRotatingTool([...TOOLS].reverse(), [probed("T002", "2026-11-02T00:00:00Z")]).id, "T003");
eq("P10 公開済みが0本なら null", pickRotatingTool([{ id: "T001", path: "x" }], []), null);
eq("P12 2回測ったツールは新しいほうの日で比べる",
  pickRotatingTool(TOOLS, [probed("T002", "2026-11-01T00:00:00Z"), probed("T003", "2026-11-03T00:00:00Z"),
    probed("T004", "2026-11-04T00:00:00Z"), probed("T002", "2026-11-05T00:00:00Z")]).id, "T003");
eq("P11 tool_probe の無い行・壊れた日時は無視する",
  pickRotatingTool(TOOLS, [{ ran_at: "2026-11-01T00:00:00Z", state: "found" }, probed("T002", "not-a-date")]).id, "T002");

eq("T1 <title> を取り出す", extractTitle("<head><title>壁紙の計算 — 巾数</title></head>"), "壁紙の計算 — 巾数");
eq("T2 &amp; を戻す", extractTitle("<title>A &amp; B</title>"), "A & B");
eq("T3 title が無ければ null", extractTitle("<html></html>"), null);

eq("L1 末尾の / の有無を同一視", normalizeUrl("https://keisanshitsu.github.io/tools/a"), normalizeUrl("https://keisanshitsu.github.io/tools/a/"));
eq("L2 index.html を同一視", normalizeUrl("https://keisanshitsu.github.io/tools/a/index.html"), "keisanshitsu.github.io/tools/a/");
eq("L3 別のツールは別物", normalizeUrl("https://keisanshitsu.github.io/tools/ab/") === normalizeUrl("https://keisanshitsu.github.io/tools/a/"), false);

const toolUrl = "https://keisanshitsu.github.io/tools/a/";
eq("V1 トップだけが出た日は false（10/19〜11/01 の実際の状態。トップの found をツールに数えない）",
  toolPageVerdict({ http: 200, result_count: 10, our_urls: ["https://keisanshitsu.github.io/"] }, toolUrl), false);
eq("V2 ツールのURLが出れば true",
  toolPageVerdict({ http: 200, result_count: 10, our_urls: ["https://keisanshitsu.github.io/tools/a/index.html"] }, toolUrl), true);
eq("V3 202（流量制限）は null。測れなかった日を false にしない",
  toolPageVerdict({ http: 202, result_count: 0, our_urls: [] }, toolUrl), null);
eq("V4 200 でも結果0件は null",
  toolPageVerdict({ http: 200, result_count: 0, our_urls: [] }, toolUrl), null);
eq("V5 当ホストが1件も無ければ false",
  toolPageVerdict({ http: 200, result_count: 10, our_urls: [] }, toolUrl), false);
eq("V6 別のツールのページが出ても、そのツールの found にしない",
  toolPageVerdict({ http: 200, result_count: 10, our_urls: ["https://keisanshitsu.github.io/tools/b/"] }, toolUrl), false);
// 2026-11-08 週次: 出なかった（false）は陽性対照が通った日だけ。出た（true）は対照に依らない
eq("V7 陽性対照が落ちた日に出なければ null（false にしない）",
  toolPageVerdict({ http: 200, result_count: 10, our_urls: [] }, toolUrl, false), null);
eq("V8 陽性対照が落ちた日でも、出れば true",
  toolPageVerdict({ http: 200, result_count: 10, our_urls: [toolUrl] }, toolUrl, false), true);
eq("V9 陽性対照が通った日に出なければ false",
  toolPageVerdict({ http: 200, result_count: 10, our_urls: [] }, toolUrl, true), false);

// ホスト単位の判定にツールのクエリを数えない（タイトルで出ないことはホスト未索引の証拠にならない）
const rowsH = [
  { query: "フェンスの計算", http: 200, result_count: 10 },
  { query: "keisanshitsu.github.io", http: 202, result_count: 0 },
];
eq("H1 ツールのクエリだけ成立した日は、ホスト単位では0本（not_found を言わない）",
  usableHostRows(rowsH, "フェンスの計算").length, 0);
eq("H2 その日の verdict は not_found ではない",
  verdict({ posControlFound: true, negControlFound: false, ourFound: false,
    usableQueries: usableHostRows(rowsH, "フェンスの計算").length }).state, "detector_broken");
eq("H3 ツールを引かない日はすべて数える", usableHostRows(rowsH, undefined).length, 1);
eq("H4 ホスト名のクエリが成立すれば数える",
  usableHostRows([...rowsH, { query: "keisanshitsu.github.io", http: 200, result_count: 3 }], "フェンスの計算").length, 1);

const pass = results.filter((r) => r.ok).length;
for (const r of results.filter((r) => !r.ok)) {
  console.log(`[FAIL] ${r.name}: expected=${JSON.stringify(r.expected)} actual=${JSON.stringify(r.actual)}`);
}
console.log(`${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
