// 土間コンクリートの材料一式のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 出典由来の定数（重ね200mm・φ6×150・24/18 N・通路70mm・目地 5/3・3/4m・L/C・シート寸法と重量・一層200mm）
//   (2) 体積は 面積 × 厚さ。知恵袋等でよく引かれる例（2.5×5×0.1＝1.25㎥・5.5×6×0.1＝3.3㎥）と一致すること
//   (3) メッシュの1方向の枚数は境界（ちょうど・1mm超え）で正しく切り替わること
//   (4) メッシュは面積割りより少なくならないこと（重ねがあるので）
//   (5) 面積・厚さを増やして量が減らないこと（単調性）

import {
  MESH_OVERLAP_MM,
  MESH_SPEC,
  USES,
  SOILS,
  BASE_SOIL,
  SHEETS,
  LIFT_MAX_MM,
  piecesAlong,
  meshLayout,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});
const truthy = (name, actual) => ({ name, ok: actual === true, expected: true, actual });

const BASE = {
  widthMm: 5000,
  lengthMm: 6000,
  slabMm: 100,
  baseMm: 100,
  use: "parking",
  soil: "sand",
  extraPct: 0,
  mesh: true,
  sheetWMm: 1000,
  sheetLMm: 2000,
  overlapMm: 200,
};
const calc = (over = {}) => calculate({ ...BASE, ...over });

export default function cases() {
  const t = [];

  // ── 出典由来の定数の錠 ─────────────────────────────
  t.push(eq("メッシュの重ね 200mm（標準仕様書 22.5.4(4)(ｳ)）", MESH_OVERLAP_MM, 200));
  t.push(eq("メッシュ φ6・網目150mm（22.5.3(6)）", [MESH_SPEC.wireMm, MESH_SPEC.pitchMm], [6, 150]));
  t.push(eq("強度 駐車場24・通路18 N/mm²（表22.5.1）", [USES.parking.strengthN, USES.walkway.strengthN], [24, 18]));
  t.push(eq("通路の版厚 70mm（22.5.2(1)）", USES.walkway.defaultSlabMm, 70));
  t.push(eq("駐車場は版厚の既定値を持たない（仕様書でも特記）", USES.parking.defaultSlabMm, undefined));
  t.push(eq("目地 駐車場 5m/3m・通路 3m/4m（表22.5.3）",
    [USES.parking.joints, USES.walkway.joints],
    [{ longitudinalM: 5, transverseM: 3 }, { longitudinalM: 3, transverseM: 4 }]));
  t.push(eq("土量変化率 L（林野庁 表2.1）", [SOILS.sand.L, SOILS.clay.L, SOILS.gravel.L], [1.2, 1.25, 1.2]));
  t.push(eq("土量変化率 C（同）", [SOILS.sand.C, SOILS.clay.C, SOILS.gravel.C], [0.9, 0.9, 0.9]));
  t.push(eq("砕石は礫質土を準用", BASE_SOIL, SOILS.gravel));
  t.push(eq("シート寸法と重量（昭和産業 φ6×150）",
    SHEETS.map((s) => [s.w, s.l, s.kg]), [[1000, 2000, 6.22], [2000, 4000, 24.42]]));
  t.push(eq("一層の仕上り厚さ上限 200mm（22.3.4(1)）", LIFT_MAX_MM, 200));

  // ── 体積（よく引かれる例と一致） ──────────────────────
  t.push(eq("2.5m×5m×10cm＝1.25㎥", calc({ widthMm: 2500, lengthMm: 5000 }).concreteM3, 1.25));
  t.push(eq("5.5m×6m×10cm＝3.3㎥", calc({ widthMm: 5500, lengthMm: 6000 }).concreteM3, 3.3));
  t.push(eq("9畳相当 15㎡×10cm＝1.5㎥", calc({ widthMm: 3000, lengthMm: 5000 }).concreteM3, 1.5));
  t.push(eq("割増10%で 3.0→3.3㎥", calc({ extraPct: 10 }).concreteOrderM3, 3.3));
  t.push(eq("割増0%なら設計数量と同じ", calc().concreteOrderM3, calc().concreteM3));

  // ── 砕石・残土 ──────────────────────────────────
  const r = calc();
  t.push(eq("砕石 締固め後 5×6×0.1＝3㎥", r.baseCompactedM3, 3));
  t.push(eq("砕石 敷く前の目安 3×1.2/0.9＝4㎥", r.baseLooseM3, 4));
  t.push(eq("掘る深さ＝コンクリート＋砕石", r.digDepthMm, 200));
  t.push(eq("掘削（地山）5×6×0.2＝6㎥", r.excavationM3, 6));
  t.push(eq("残土（砂質土）6×1.2＝7.2㎥", r.soilLooseM3, 7.2));
  t.push(eq("残土（粘性土）6×1.25＝7.5㎥", calc({ soil: "clay" }).soilLooseM3, 7.5));
  t.push(eq("砕石0なら砕石0・層0", [calc({ baseMm: 0 }).baseCompactedM3, calc({ baseMm: 0 }).baseLifts], [0, 0]));
  t.push(eq("砕石200mmは1層（境界）", calc({ baseMm: 200 }).baseLifts, 1));
  t.push(eq("砕石201mmは2層（境界）", calc({ baseMm: 201 }).baseLifts, 2));

  // ── メッシュ 1方向の境界 ────────────────────────────
  t.push(eq("シートより短い→1枚", piecesAlong(1500, 2000, 200), 1));
  t.push(eq("ちょうどシート長→1枚", piecesAlong(2000, 2000, 200), 1));
  t.push(eq("1mm超え→2枚", piecesAlong(2001, 2000, 200), 2));
  t.push(eq("2000+1800＝3800ちょうど→2枚", piecesAlong(3800, 2000, 200), 2));
  t.push(eq("3801→3枚", piecesAlong(3801, 2000, 200), 3));
  t.push(eq("重ね0なら単純割り 4000/2000→2枚", piecesAlong(4000, 2000, 0), 2));

  // ── メッシュ 割付け（5×6m・1×2m・重ね200） ───────────────
  // 縦置き: 奥行6m/2m → 1+⌈4000/1800⌉=4、幅5m/1m → 1+⌈4000/800⌉=6 → 24
  // 横置き: 奥行6m/1m → 1+⌈5000/800⌉=8、幅5m/2m → 1+⌈3000/1800⌉=3 → 24
  const lay = meshLayout(5000, 6000, 1000, 2000, 200);
  t.push(eq("5×6m: 縦置き 4×6＝24枚", [lay.chosen.nL, lay.chosen.nW, lay.chosen.sheets], [4, 6, 24]));
  t.push(eq("5×6m: 横置きも24枚（同数なら縦置き）", lay.other.sheets, 24));
  t.push(eq("5×6m: 重量 24×6.22＝149.28kg", r.mesh.weightKg, 149.28));
  t.push(eq("5×6m: 面積割りでは15枚（9枚足りない）", r.mesh.naiveSheets, 15));
  // 向きで差が出る例: 2.5×5m。縦置き 奥行5/2→1+⌈3000/1800⌉=3、幅2.5/1→1+⌈1500/800⌉=3 → 9
  //                         横置き 奥行5/1→1+⌈4000/800⌉=6、幅2.5/2→1+⌈500/1800⌉=2 → 12
  const lay2 = meshLayout(2500, 5000, 1000, 2000, 200);
  t.push(eq("2.5×5m: 少ないほう（縦置き9枚）を採る", [lay2.chosen.orient, lay2.chosen.sheets, lay2.other.sheets], ["long-along-length", 9, 12]));
  t.push(eq("2×4mシート 5×6m: 重量あり", calc({ sheetWMm: 2000, sheetLMm: 4000 }).mesh.weightKg !== null, true));
  t.push(eq("規格外寸法は重量を出さない", calc({ sheetWMm: 1200, sheetLMm: 2400 }).mesh.weightKg, null));
  t.push(eq("メッシュなしなら null", calc({ mesh: false }).mesh, null));

  // ── 面積割り以上（全条件で） ────────────────────────
  let notBelow = true;
  for (const w of [500, 1000, 2400, 3000, 5000, 7300])
    for (const l of [800, 2000, 4100, 6000, 10000])
      for (const s of SHEETS) {
        const m = calc({ widthMm: w, lengthMm: l, sheetWMm: s.w, sheetLMm: s.l }).mesh;
        if (m.sheets * s.w * s.l < w * l) notBelow = false;
      }
  t.push(truthy("メッシュの総面積は地面の面積を下回らない（60条件）", notBelow));

  // ── 単調性 ────────────────────────────────────
  let mono = true;
  let prev = null;
  for (let l = 1000; l <= 20000; l += 100) {
    const x = calc({ lengthMm: l });
    if (prev && (x.mesh.sheets < prev.mesh.sheets || x.concreteM3 < prev.concreteM3 || x.soilLooseM3 < prev.soilLooseM3)) mono = false;
    prev = x;
  }
  t.push(truthy("奥行きを10cmずつ伸ばして量が減らない（191条件）", mono));

  // ── チェック項目 ─────────────────────────────────
  const titles = (x) => x.checks.map((c) => c.title).join("|");
  t.push(truthy("駐車場は 24 N/mm²", titles(calc()).includes("24 N/mm²")));
  t.push(truthy("通路は 18 N/mm²", titles(calc({ use: "walkway", slabMm: 70 })).includes("18 N/mm²")));
  t.push(eq("通路 70mm はNGを出さない（境界）", calc({ use: "walkway", slabMm: 70 }).checks.some((c) => c.status === "ng"), false));
  t.push(eq("通路 69mm はNG", calc({ use: "walkway", slabMm: 69 }).checks.some((c) => c.status === "ng"), true));
  t.push(truthy("150mm はメッシュ位置1/2", calc({ slabMm: 150 }).checks.some((c) => c.detail.includes("1/2程度"))));
  t.push(truthy("200mm はメッシュ位置1/3", calc({ slabMm: 200 }).checks.some((c) => c.detail.includes("1/3程度"))));

  // ── 入力検証 ──────────────────────────────────
  t.push(eq("幅0は拒否", calc({ widthMm: 0 }).ok, false));
  t.push(eq("幅100m は受理（境界）", calc({ widthMm: 100000 }).ok, true));
  t.push(eq("厚さ5cm 受理・4.9cm 拒否", [calc({ slabMm: 50 }).ok, calc({ slabMm: 49 }).ok], [true, false]));
  t.push(eq("重ねがシート短辺以上は拒否", calc({ overlapMm: 1000 }).ok, false));
  t.push(eq("メッシュなしなら重ねは問わない", calc({ mesh: false, overlapMm: 5000 }).ok, true));
  t.push(eq("NaN は拒否", calc({ lengthMm: NaN }).ok, false));
  t.push(eq("割増51%は拒否", calc({ extraPct: 51 }).ok, false));

  return t;
}
