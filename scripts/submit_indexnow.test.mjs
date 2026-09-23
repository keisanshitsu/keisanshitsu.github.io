#!/usr/bin/env node
// submit_indexnow.mjs の境界テスト。ネットワークには触らない。
//
// なぜ書くのか: 2026-09-09 の教訓「公開されるツールにはテストを義務づけていたのに、
// 意思決定の入力を作るスクリプトには1本も無かった」。発見経路を開く／開かないを
// 判定するこのスクリプトは、まさにその種類の入力である。
//
// とくに 202 の扱いを固定する。202 を 200 と同じ「成功」に畳むと
// 「送った＝届いた」と記録してしまい、**私を黙らせる向き**に誤る。

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateKey, hostOf, urlsFromSitemap, partitionByHost,
  buildPayload, classifyResponse, selectProbeUrls, PROVES,
} from "./submit_indexnow.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const t = (name, ok, expected, actual) => results.push({ name, ok, expected, actual });
const eq = (name, actual, expected) =>
  t(name, JSON.stringify(actual) === JSON.stringify(expected), expected, actual);

// ── validateKey の境界（仕様: 8〜128文字 / a-zA-Z0-9- のみ） ──
eq("A1 7文字は不可", validateKey("a".repeat(7)).ok, false);
eq("A2 8文字は可（下端）", validateKey("a".repeat(8)).ok, true);
eq("A3 128文字は可（上端）", validateKey("a".repeat(128)).ok, true);
eq("A4 129文字は不可", validateKey("a".repeat(129)).ok, false);
eq("A5 アンダースコアは不可", validateKey("abcdefg_h").ok, false);
eq("A6 ハイフンは可", validateKey("abcd-efgh").ok, true);
eq("A7 文字列でなければ不可", validateKey(null).ok, false);

// ── sitemap からの抽出 ──
const xml = `<?xml version="1.0"?><urlset>
  <url><loc>https://example.github.io/</loc></url>
  <url><loc>  https://example.github.io/tools/a/  </loc></url>
</urlset>`;
eq("B1 loc を2件抽出する", urlsFromSitemap(xml).length, 2);
eq("B2 前後の空白を落とす", urlsFromSitemap(xml)[1], "https://example.github.io/tools/a/");
eq("B3 loc が無ければ空配列", urlsFromSitemap("<urlset></urlset>"), []);

// ── ホストでの仕分け（他ホストが混ざると 422 でリスト全体が落ちる） ──
const part = partitionByHost(
  ["https://a.example/1", "https://b.example/2", "not-a-url"], "a.example");
eq("C1 同一ホストだけ送信対象", part.same, ["https://a.example/1"]);
eq("C2 他ホストは除外", part.other.includes("https://b.example/2"), true);
eq("C3 壊れたURLも除外側へ", part.other.includes("not-a-url"), true);

// ── payload ──
const p1 = buildPayload({ host: "h", key: "k", urlList: ["u"] });
eq("D1 keyLocation が無ければキー自体を入れない", Object.hasOwn(p1, "keyLocation"), false);
const p2 = buildPayload({ host: "h", key: "k", keyLocation: "https://h/k.txt", urlList: ["u"] });
eq("D2 keyLocation を渡せば入る", p2.keyLocation, "https://h/k.txt");

// ── 応答の解釈。ここが本テストの主眼 ──
eq("E1 200 は受理かつ鍵検証済み", classifyResponse(200),
  { accepted: true, key_validated: true, meaning: "OK。URL を受理し鍵も検証済み" });
eq("E2 202 は受理だが鍵は未検証", classifyResponse(202).key_validated, false);
eq("E3 202 も accepted ではある", classifyResponse(202).accepted, true);
eq("E4 403 は不受理", classifyResponse(403).accepted, false);
eq("E5 422 は不受理", classifyResponse(422).accepted, false);
eq("E6 未知コードは不受理側へ倒す", classifyResponse(500).accepted, false);

// ── probe の送信対象（2026-09-23 追加） ──
// probe は「鍵が検証されたか」を応答コードから読むためのもので、催促ではない。
// 変更の無いURLを毎日全件送るのは仕様上スパム（429）へ向かう行為なので1件に絞る。
{
  const urls = [
    "https://keisanshitsu.github.io/",
    "https://keisanshitsu.github.io/tools/roof-area/",
    "https://keisanshitsu.github.io/tools/block-wall/",
  ];
  eq("H1 probe はトップ1件だけを選ぶ",
    selectProbeUrls(urls, "https://keisanshitsu.github.io"),
    ["https://keisanshitsu.github.io/"]);
  eq("H2 送信件数は必ず1件", selectProbeUrls(urls, "https://keisanshitsu.github.io").length, 1);
  eq("H3 トップが sitemap に無くても1件に絞る（全件送りに化けない）",
    selectProbeUrls(urls.slice(1), "https://other.example").length, 1);
}

// ── 「受理」を「索引」と読み替えさせない ──
eq("F1 索引の証明ではない", PROVES.proves_indexed, false);
eq("F2 クロールの証明でもない", PROVES.proves_crawled, false);
eq("F3 Google には効かないと明示する", PROVES.proves_google, false);

// ── 実体との整合: pipeline.json の鍵と docs/<key>.txt が一致すること ──
// 片方だけ書き換えると 403 になり、しかも原因が分からなくなる。
{
  const pipeline = JSON.parse(readFileSync(join(ROOT, "state", "pipeline.json"), "utf8"));
  const key = pipeline.discovery?.indexnow?.key ?? "";
  eq("G1 pipeline.json の鍵が仕様を満たす", validateKey(key).ok, true);
  const f = join(ROOT, "docs", `${key}.txt`);
  eq("G2 鍵ファイルがホスト直下に実在する", existsSync(f), true);
  eq("G3 鍵ファイルの中身が鍵と一致する",
    existsSync(f) ? readFileSync(f, "utf8").trim() : "(無し)", key);
  eq("G4 published_url のホストが取れる",
    hostOf(pipeline.site?.published_url ?? "https://x/"), "keisanshitsu.github.io");
}

const pass = results.filter((r) => r.ok).length;
for (const r of results.filter((r) => !r.ok)) {
  console.log(`[FAIL] ${r.name}: expected=${JSON.stringify(r.expected)} actual=${JSON.stringify(r.actual)}`);
}
console.log(`${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
