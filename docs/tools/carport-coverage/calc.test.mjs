// カーポートの建ぺい率のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 条文由来の定数（1m・4m・2m・2.1m・角地の十分の一・十分の三〜十分の八）
//   (2) 4要件の境界（ちょうど＝適合／1cm 足りない＝不適合）と、1つでも欠ければ緩和なしになること
//   (3) 算入面積は四方から1mずつ。間口・奥行が2m以下なら 0
//   (4) 建ぺい率の判定は「ちょうど上限」で収まり、1cm² 超えると超過（浮動小数で判定しない）
//   (5) 解説記事で広く引かれる例（敷地120㎡・60%・母屋65㎡・5.0×5.5m → 27.5㎡／10.5㎡）と一致すること
//   (6) 逆算した最大の奥行は、その奥行でちょうど収まり、1cm 長いと収まらないこと

import {
  RELIEF_EDGE_CM,
  REQ_OPEN_RUN_CM,
  REQ_COLUMN_SPACING_CM,
  REQ_CEILING_CM,
  CORNER_BONUS_PCT,
  RATIO_CHOICES_PCT,
  m2ToCm2,
  requirements,
  includedAreaCm2,
  remainingX100,
  maxDepthCm,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});
const near = (name, actual, expected, tol = 1e-9) => ({ name, ok: Math.abs(actual - expected) <= tol, expected, actual });

const BASE = {
  siteM2: 120, ratioPct: 60, corner: false, houseM2: 65,
  widthCm: 500, depthCm: 550, walls: "none", columnSpacingCm: 300, ceilingCm: 230,
};
const calc = (over) => calculate({ ...BASE, ...over });

export default function cases() {
  const t = [];

  // ── (1) 条文由来の定数 ─────────────────────────────
  t.push(eq("令2条1項2号 端から1m", RELIEF_EDGE_CM, 100));
  t.push(eq("告示1437号 一 4m・二 2m・三 2.1m", [REQ_OPEN_RUN_CM, REQ_COLUMN_SPACING_CM, REQ_CEILING_CM], [400, 200, 210]));
  t.push(eq("法53条3項 角地 十分の一", CORNER_BONUS_PCT, 10));
  t.push(eq("法53条1項 十分の三〜十分の八", RATIO_CHOICES_PCT, [30, 40, 50, 60, 70, 80]));
  t.push(eq("㎡→cm²", [m2ToCm2(1), m2ToCm2(27.5), m2ToCm2(0.01)], [10000, 275000, 100]));

  // ── (2) 4要件の境界 ───────────────────────────────
  const r = (o) => requirements({ openRunCm: 500, columnSpacingCm: 300, ceilingCm: 230, ...o }).all;
  t.push(eq("要件 すべて満たす", r({}), true));
  t.push(eq("連続4m ちょうど／399cm", [r({ openRunCm: 400 }), r({ openRunCm: 399 })], [true, false]));
  t.push(eq("柱の間隔 2m ちょうど／199cm", [r({ columnSpacingCm: 200 }), r({ columnSpacingCm: 199 })], [true, false]));
  t.push(eq("天井高 2.1m ちょうど／209cm", [r({ ceilingCm: 210 }), r({ ceilingCm: 209 })], [true, false]));
  t.push(eq("要件は4項目（階数1を含む）", requirements({ openRunCm: 500, columnSpacingCm: 300, ceilingCm: 230 }).items.length, 4));
  t.push(eq("天井高が足りなければ緩和なし＝屋根全体を算入", calc({ ceilingCm: 209 }).includedCm2, 500 * 550));
  t.push(eq("柱の間隔が足りなければ緩和なし", calc({ columnSpacingCm: 199 }).relieved, false));
  t.push(eq("壁なし: 長いほうの辺で連続長さを判定（250×399 → 不適合）", calc({ widthCm: 250, depthCm: 399 }).relieved, false));
  t.push(eq("壁なし: 250×400 → 適合", calc({ widthCm: 250, depthCm: 400 }).relieved, true));
  t.push(eq("壁あり: 入力した連続長さで判定", [calc({ walls: "some", openRunCm: 400 }).relieved, calc({ walls: "some", openRunCm: 399 }).relieved], [true, false]));

  // ── (3) 算入面積 ──────────────────────────────────
  t.push(eq("5.0×5.5m 緩和あり 3.0×3.5", includedAreaCm2(500, 550, true), 300 * 350));
  t.push(eq("5.0×5.5m 緩和なし 27.5㎡", includedAreaCm2(500, 550, false), 275000));
  t.push(eq("間口2m ちょうど → 0", includedAreaCm2(200, 600, true), 0));
  t.push(eq("間口1.5m（2m未満）→ 0（負にならない）", includedAreaCm2(150, 600, true), 0));
  t.push(eq("間口2.01m → 1cm × (奥行−2m)", includedAreaCm2(201, 600, true), 1 * 400));
  t.push(eq("1台用 2.7×5.0m → 0.7×3.0 = 2.1㎡", includedAreaCm2(270, 500, true), 21000));

  // ── (5) よく引かれる例 ────────────────────────────
  const ex = calc({});
  t.push(eq("例: 上限 72㎡", ex.limitCm2, 720000));
  t.push(eq("例: 緩和あり 算入 10.5㎡", ex.includedCm2, 105000));
  t.push(eq("例: 不算入 17㎡", ex.excludedCm2, 170000));
  t.push(eq("例: 合計 75.5㎡ → 緩和しても超過", [ex.totalCm2, ex.fits], [755000, false]));
  t.push(near("例: 建ぺい率 62.916…%", ex.ratioPct, (100 * 75.5) / 120));
  t.push(eq("例: 残り 7㎡ ／ 超過 3.5㎡", [ex.remainingCm2, ex.afterCm2], [70000, -35000]));
  const exNo = calc({ ceilingCm: 200 });
  t.push(eq("例: 緩和なし 合計 92.5㎡", [exNo.totalCm2, exNo.fits], [925000, false]));
  t.push(eq("例: 角地なら上限 70% → 84㎡ で収まる", [calc({ corner: true }).limitPct, calc({ corner: true }).fits], [70, true]));

  // ── (4) 判定の境界（ちょうど上限）────────────────
  // 敷地 100㎡・60% → 上限 60㎡。母屋 50㎡、残り 10㎡。緩和あり 4.5×6.0 → 2.5×4.0 = 10㎡ ちょうど。
  const just = calc({ siteM2: 100, houseM2: 50, widthCm: 450, depthCm: 600 });
  t.push(eq("ちょうど上限は収まる", [just.totalCm2, just.fits], [600000, true]));
  const over = calc({ siteM2: 100, houseM2: 50, widthCm: 450, depthCm: 601 });
  t.push(eq("奥行1cm 長いと超過", over.fits, false));
  const tiny = calc({ siteM2: 100, houseM2: 50.01, widthCm: 450, depthCm: 600 });
  t.push(eq("母屋が 0.01㎡ 多いと超過", tiny.fits, false));
  // 浮動小数では 0.1+0.2 系の誤差が出る組み合わせ: 敷地 123.45㎡・40% → 上限 49.38㎡ ちょうど
  const fl = calc({ siteM2: 123.45, ratioPct: 40, houseM2: 49.38, widthCm: 200, depthCm: 500 });
  t.push(eq("浮動小数の誤差で超過にしない（49.38㎡ ちょうど＋算入0）", fl.fits, true));
  t.push(eq("既に超えている母屋を検出", calc({ siteM2: 100, houseM2: 61 }).houseAlreadyOver, true));

  // ── (6) 逆算 ──────────────────────────────────────
  // 例: 残り 7㎡、間口 5.0m。緩和あり D ≦ 2 + 7/3 = 4.333m → 433cm
  t.push(eq("例: 間口5.0m なら奥行 4.33m まで（緩和あり）", ex.maxDepthCm, 433));
  t.push(eq("例: 緩和なしなら 1.40m まで", exNo.maxDepthCm, 140));
  for (const [w, site, house, pct] of [[500, 120, 65, 60], [270, 150, 80, 60], [600, 200, 90, 50], [350, 99.99, 40.05, 50]]) {
    const rem = remainingX100(m2ToCm2(site), m2ToCm2(house), pct);
    for (const relieved of [true, false]) {
      const d = maxDepthCm(w, rem, relieved);
      const fitsAt = (dd) => 100 * includedAreaCm2(w, dd, relieved) <= rem;
      t.push(eq(`逆算 W${w} 敷地${site} 母屋${house} ${pct}% ${relieved ? "緩和" : "なし"}: ${d}cm で収まり +1cm で超える`,
        [fitsAt(d), fitsAt(d + 1)], [true, false]));
    }
  }
  t.push(eq("間口2m以下で緩和ありなら奥行の上限なし", maxDepthCm(200, 100, true), null));
  t.push(eq("既に超過なら奥行 0", maxDepthCm(500, -1, true), 0));

  // ── 入力検査 ──────────────────────────────────────
  t.push(eq("指定建ぺい率は選択肢のみ", calc({ ratioPct: 65 }).ok, false));
  t.push(eq("母屋 > 敷地 はエラー", calc({ siteM2: 50, houseM2: 60 }).ok, false));
  t.push(eq("間口 99cm はエラー", calc({ widthCm: 99 }).ok, false));
  t.push(eq("空の入力はエラー", calc({ siteM2: "" }).ok, false));

  return t;
}
