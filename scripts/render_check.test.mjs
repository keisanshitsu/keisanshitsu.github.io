// render_check.mjs の検査器テスト — 欠陥をわざと注入して検出されることを確かめる
//
//   node scripts/render_check.test.mjs
//
// 初回実行で docs/ の9枚がすべて overflow=0 だった。「もう心配しなくてよい」側の結論なので、
// 測定器のほうを疑う（CLAUDE.md 一般則3）。溢れるページを作って、本当に溢れと測れるかを見る。
// 終了コード: 0 = 全PASS / 1 = FAIL / 2 = ブラウザが無く測定不能（PASS とは数えない）

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { measureOverflow, VIEWPORT } from "./render_check.mjs";

const VP = '<meta name="viewport" content="width=device-width,initial-scale=1">';
const page = (head, body) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">${head}<title>t</title></head><body style="margin:0">${body}</body></html>`;

const fixtures = {
  clean: page(VP, "<p>短い本文</p>"),
  wide_div: page(VP, '<div style="width:600px;height:10px;background:red"></div>'),
  // 全角数字は CJK として文字間で折り返せるため溢れない（初回の fixture はこれで素通りした）。
  // 実際の結果表で溢れうるのは ASCII の桁区切り数字なので、そちらで作る。
  wide_table: page(VP, '<table><tr>' + "<td>999,999,999</td>".repeat(8) + "</tr></table>"),
  js_injected: page(VP, '<script>addEventListener("load",()=>{const d=document.createElement("div");d.style.width="500px";d.style.height="5px";document.body.appendChild(d)})</script>'),
  no_viewport: page("", "<p>viewport 宣言なし</p>"),
  just_fits: page(VP, '<div style="width:375px;height:10px"></div>'),
};

const dir = mkdtempSync(join(tmpdir(), "render-fixture-"));
const files = {};
for (const [k, html] of Object.entries(fixtures)) writeFileSync((files[k] = join(dir, `${k}.html`)), html);

const r = await measureOverflow(Object.values(files));
rmSync(dir, { recursive: true, force: true });
if (!r.available) { console.log(`測定不能: ${r.reason}（PASS とは数えない）`); process.exit(2); }

const by = Object.fromEntries(Object.keys(files).map((k, i) => [k, r.results[i]]));
const checks = [
  ["clean は溢れない", by.clean.overflow <= 1],
  ["clean の表示幅は 375", by.clean.clientWidth === VIEWPORT.width],
  ["600px の div を溢れと検出", by.wide_div.overflow > 1],
  ["溢れ量が概ね正しい（600-375=225）", Math.abs(by.wide_div.overflow - 225) <= 2],
  ["折り返せない表を溢れと検出", by.wide_table.overflow > 1],
  ["load 後に JS が足した要素も検出", by.js_injected.overflow > 1],
  ["viewport 宣言なしは表示幅が 375 にならない（＝verify 側で ERROR にできる）", by.no_viewport.clientWidth !== VIEWPORT.width],
  ["ちょうど 375px は溢れにしない（境界）", by.just_fits.overflow <= 1],
];
let pass = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}`); if (ok) pass++; }
console.log(`${pass}/${checks.length} PASS`);
if (pass !== checks.length) console.log(JSON.stringify(by, null, 1));
process.exit(pass === checks.length ? 0 : 1);
