// 防草シートの必要量と固定ピンの本数のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 出典由来の定数（重ね100mm・ピッチ 500/1000mm・50本入り・参考3本/5本・100㎡以下は除く）
//   (2) メーカー技術資料の実例（100㎡正方形・2m幅）と照合する:
//       シート105㎡・テープ50m は一致。ピンは 222本・462本 に対し 228本・468本（6本多い・安全側）。
//       実例を下回らないこと
//   (3) 1列だけのときは配置の式と独立に閉じた式で数えられる。両者が一致すること
//   (4) 面積を広げてピンが減らないこと（単調性）

import {
  OVERLAP_MM,
  PIN_PACK,
  MODES,
  REF_EXCLUDED_AT_OR_BELOW_M2,
  ROLLS,
  divide,
  stripLines,
  lengthPieces,
  packRolls,
  layout,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});
const truthy = (name, actual) => ({ name, ok: actual === true, expected: true, actual });
const near = (a, b) => Math.abs(a - b) < 1e-6;

const BASE = {
  widthMm: 10000,
  lengthMm: 10000,
  rollWMm: 2000,
  rollLMm: 30000,
  overlapMm: 100,
  mode: "exposed",
  upturnMm: 0,
  direction: "length",
};
const calc = (over = {}) => calculate({ ...BASE, ...over });

export default function cases() {
  const t = [];

  // ── 出典由来の定数の錠 ─────────────────────────────
  t.push(eq("重ねは100mm（ザバーン技術資料 P.2）", OVERLAP_MM, 100));
  t.push(eq("むき出し: 外周・継ぎ目500mm／内側1m（P.3）", [MODES.exposed.line, MODES.exposed.inner], [500, 1000]));
  t.push(eq("全体500mm（P.4）", [MODES.dense.line, MODES.dense.inner], [500, 500]));
  t.push(eq("砂利下は1mピッチ（P.8）", [MODES.gravel.line, MODES.gravel.inner], [1000, 1000]));
  t.push(eq("参考必要ピン数量 3本／㎡・5本／㎡", [MODES.exposed.refPerM2, MODES.dense.refPerM2], [3, 5]));
  t.push(eq("参考値は100㎡以下を除く", REF_EXCLUDED_AT_OR_BELOW_M2, 100));
  t.push(eq("固定ピンは50本入り（P.11）", PIN_PACK, 50));
  t.push(eq("ロール寸法5種（製品ページ）", ROLLS.map((r) => `${r.w / 1000}x${r.l / 1000}`), ["1x30", "2x30", "1x50", "2x50", "3x20"]));

  // ── メーカーの実例: 100㎡正方形・2m幅 ─────────────────
  {
    const r = calc();
    const c = r.chosen;
    t.push(eq("実例: シート105㎡（一致）", near(c.sheetAreaM2, 105), true));
    t.push(eq("実例: 接続テープ50m（一致）", near(c.tapeM, 50), true));
    t.push(eq("実例: 帯6本・最後の帯は0.5m（見える幅400mm＋重ね100mm）", [c.strips, c.lastStripWidthMm], [6, 500]));
    t.push(eq("実例: ピン228本（資料は222本・継ぎ目の端にも打つぶん6本多い）", c.pins, 228));
    t.push(truthy("実例: 資料の222本を下回らない", c.pins >= 222));
    t.push(eq("実例: 継ぎ目の線ごとに端を含め21本（10m÷500mm＋1）", c.linePins, 80 + 5 * 21 - 2));
    t.push(truthy("実例: 袋単位では資料の222本を下回らない", c.pinPacks * PIN_PACK >= 222));
  }
  {
    const c = calc({ mode: "dense" }).chosen;
    t.push(eq("実例: 全体500mmでピン468本（資料は462本）", c.pins, 468));
    t.push(truthy("実例: 全体500mmも資料の462本を下回らない", c.pins >= 462));
    t.push(truthy("実例: 全体500mmも袋単位では462本を下回らない", c.pinPacks * PIN_PACK >= 462));
  }
  {
    const c = calc({ mode: "gravel" }).chosen;
    t.push(eq("砂利下100㎡: 140本", c.pins, 140));
    t.push(truthy("砂利下は資料の 1～2本/㎡ の範囲に入る", c.pins / 100 >= 1 && c.pins / 100 <= 2));
  }

  // ── 独立検証: 1列だけなら閉じた式で数えられる ─────────
  const bad = [];
  for (const W of [100, 499, 500, 501, 999, 1000, 1001, 1500, 2000])
    for (const L of [100, 500, 999, 1000, 1001, 2500, 7300, 10000, 29999, 30000])
      for (const mode of Object.keys(MODES)) {
        const m = MODES[mode];
        const cl = (v, p) => Math.ceil(v / p);
        const expected = 2 * (cl(W, m.line) + cl(L, m.line)) + (cl(W, m.inner) - 1) * (cl(L, m.inner) - 1);
        const got = layout({ along: L, across: W, rollW: 2000, rollL: 30000, overlap: 100, mode, upturn: 0 }).pins;
        if (got !== expected) bad.push({ W, L, mode, got, expected });
      }
  t.push(eq("1列の独立検証 270通り: 配置で数えた本数が閉じた式と一致", bad, []));

  // ── 線の等分: 実際の間隔がピッチを超えない ─────────────
  {
    const over = [];
    for (const len of [1, 499, 500, 501, 1000, 1234, 9999, 10000, 10001])
      for (const p of [500, 1000]) {
        const pts = divide(len, p);
        if (pts.some((x, i) => i > 0 && x - pts[i - 1] > p + 1e-9)) over.push({ len, p });
        if (pts[0] !== 0 || pts[pts.length - 1] !== len) over.push({ len, p, ends: false });
      }
    t.push(eq("等分した間隔はピッチ以下で、両端に必ず打つ", over, []));
  }

  // ── 帯の並べ方の境界 ───────────────────────────────
  t.push(eq("幅2000ちょうど・ロール2m: 1列", stripLines(2000, 2000, 100).n, 1));
  t.push(eq("幅2001・ロール2m: 2列（最後は101mm）", [stripLines(2001, 2000, 100).n, stripLines(2001, 2000, 100).widths[1]], [2, 101]));
  t.push(eq("幅3900（2000＋1900）: 2列ちょうど", stripLines(3900, 2000, 100).n, 2));
  t.push(eq("幅3901: 3列", stripLines(3901, 2000, 100).n, 3));
  t.push(eq("長さ30000ちょうど・ロール30m: 継がない", lengthPieces(30000, 30000, 100).pieces, [30000]));
  t.push(eq("長さ35000: 30m＋5.1m（重ね100mm）・継ぎ目は29.9m", [lengthPieces(35000, 30000, 100).pieces, lengthPieces(35000, 30000, 100).joints], [[30000, 5100], [29900]]));
  {
    const c = calc({ widthMm: 2000, lengthMm: 35000 }).chosen;
    t.push(eq("2m×35m: 長手方向の継ぎ目1本・テープ2m", [c.endJoints, c.tapeM], [1, 2]));
    t.push(eq("2m×35m: シート面積 ＝ 70㎡＋重ね0.2㎡", near(c.sheetAreaM2, 70.2), true));
    t.push(eq("2m×35m: ロール2本", c.rolls, 2));
  }

  // ── ロールの割付け ─────────────────────────────────
  t.push(eq("10m片×3 は30mロール1本に収まる", packRolls([10000, 10000, 10000], 30000), { rolls: 1, leftoverMm: 0 }));
  t.push(eq("10m片×4 は2本（残り20m）", packRolls([10000, 10000, 10000, 10000], 30000), { rolls: 2, leftoverMm: 20000 }));
  t.push(eq("30m片＋0.1m片 は2本", packRolls([30000, 100], 30000).rolls, 2));

  // ── 敷く向きの自動選択 ─────────────────────────────
  {
    // 犬走り 0.8m×10m・1mロール: 縦に1本で敷くのが正しい（横に11本の細切れは選ばない）
    const r = calc({ widthMm: 800, lengthMm: 10000, rollWMm: 1000, direction: "auto" });
    t.push(eq("犬走り0.8×10m: 自動で縦1本（継ぎ目0）", [r.chosen.direction, r.chosen.strips, r.chosen.seams], ["length", 1, 0]));
    t.push(truthy("犬走り0.8×10m: 1㎡あたり4本を超える（小面積では目安が使えない）", r.chosen.pins / r.areaM2 > 4));
    t.push(truthy("100㎡以下では参考値を使えない旨が出る", r.checks.some((c) => c.title.includes("使えません"))));
  }
  {
    const r = calc({ widthMm: 10000, lengthMm: 10001 });
    t.push(truthy("100.01㎡では参考値（3本／㎡）を併記する", r.checks.some((c) => c.title.includes("参考値"))));
  }
  t.push(truthy("100㎡ちょうどは参考値の対象外（「以下を除く」）", calc().checks.some((c) => c.title.includes("使えません"))));
  {
    // 自動選択は (ロール数, ピン数) の辞書順で、もう一方の向きより悪くならない
    const worse = [];
    for (const W of [800, 1500, 3000, 4500, 9000])
      for (const L of [2000, 5000, 12000, 31000, 60000])
        for (const rollWMm of [1000, 2000]) {
          const a = calc({ widthMm: W, lengthMm: L, rollWMm, direction: "auto" });
          const c = a.chosen, o = a.other;
          if (c.rolls > o.rolls || (c.rolls === o.rolls && c.pins > o.pins)) worse.push({ W, L, rollWMm });
        }
    t.push(eq("自動選択 50通り: ロール数→ピン数で劣る向きを選ばない", worse, []));
  }

  // ── 単調性: 面積を広げてピンが減らない ───────────────
  {
    const dec = [];
    for (const mode of Object.keys(MODES)) {
      let prev = 0;
      for (let L = 500; L <= 20000; L += 250) {
        const p = calc({ widthMm: 4500, lengthMm: L, mode }).chosen.pins;
        if (p < prev) dec.push({ mode, L, p, prev });
        prev = p;
      }
    }
    t.push(eq("奥行きを250mmずつ伸ばしてピンが減らない（3つの打ち方×79通り）", dec, []));
  }

  // ── 立ち上げ: シートは増え、ピンは変わらない ───────────
  {
    const a = calc({ widthMm: 1000, lengthMm: 5000, rollWMm: 2000 });
    const b = calc({ widthMm: 1000, lengthMm: 5000, rollWMm: 2000, upturnMm: 50 });
    t.push(eq("立ち上げ5cm（継ぎ目が増えない幅）: ピンは同じ", b.chosen.pins, a.chosen.pins));
    t.push(eq("立ち上げ5cm: シートは1.1×5.1m＝5.61㎡", near(b.chosen.sheetAreaM2, 5.61), true));
    const c1 = calc({ widthMm: 1000, lengthMm: 5000, rollWMm: 1000, upturnMm: 50, direction: "length" });
    t.push(eq("立ち上げ5cm: 幅1.1mは1mロールでは2列になる", c1.chosen.strips, 2));
  }

  // ── 重ねの基準 ─────────────────────────────────────
  t.push(eq("重ね9cm は基準未満（ng）", calc({ overlapMm: 90 }).checks.some((c) => c.status === "ng"), true));
  t.push(eq("重ね10cm ちょうどは ng を出さない", calc({ overlapMm: 100 }).checks.some((c) => c.status === "ng"), false));

  // ── 入力エラー ──────────────────────────────────
  t.push(eq("幅0はエラー", calc({ widthMm: 0 }).ok, false));
  t.push(eq("幅99mmはエラー・100mmは可", [calc({ widthMm: 99 }).ok, calc({ widthMm: 100 }).ok], [false, true]));
  t.push(eq("200m超はエラー", calc({ lengthMm: 200001 }).ok, false));
  t.push(eq("数でない値はエラー", calc({ widthMm: NaN }).ok, false));
  t.push(eq("重ね4cmはエラー・5cmは可", [calc({ overlapMm: 40 }).ok, calc({ overlapMm: 50 }).ok], [false, true]));
  t.push(eq("重ねがロール幅の半分以上はエラー", calc({ rollWMm: 1000, overlapMm: 500 }).ok, false));
  t.push(eq("不明な打ち方はエラー", calc({ mode: "x" }).ok, false));
  t.push(eq("上限200m×200m（全体500mm）も計算できる", calc({ widthMm: 200000, lengthMm: 200000, mode: "dense" }).ok, true));
  t.push(eq("50m×50m（全体500mm）は計算できる", calc({ widthMm: 50000, lengthMm: 50000, mode: "dense" }).ok, true));

  return t;
}
