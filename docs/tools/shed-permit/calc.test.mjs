// 物置の建築確認と建ぺい率・容積率のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 条文由来の定数（10㎡・200㎡・角地の十分の一・十分の三〜十分の八）
//   (2) 第6条第2項の3条件（増築・防火地域外・合計10㎡以内）が1つでも欠ければ、区域内では「要る」になること
//       10㎡ ちょうどは不要、1cm² 超えると要る（浮動小数で判定しない）
//   (3) 2個置くときは合計で判定すること（相模原市リーフレット「２個以上設置する場合はその合計」）
//   (4) 区域の外: 空き地なら 200㎡ 以下で不要・超えると要る、母屋のある敷地で 10㎡ 超は断定しない（check）
//       区域の外では防火の入力を使わない
//   (5) 建ぺい率・容積率は「ちょうど上限」で収まり、1cm² 超えると超過。置ける残りは小さいほう
//   (6) よくある例（敷地120㎡・60%/200%・母屋 建築60㎡/延べ110㎡・物置 2.2×1.6m）と一致すること

import {
  EXEMPT_LIMIT_CM2,
  SMALL_SCALE_LIMIT_CM2,
  CORNER_BONUS_PCT,
  RATIO_CHOICES_PCT,
  m2ToCm2,
  permit,
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
  zone: "inside", fire: false, hasHouse: true,
  w1Cm: 220, d1Cm: 160, second: false, w2Cm: 0, d2Cm: 0,
  siteM2: 120, ratioPct: 60, corner: false, houseBuildM2: 60, farPct: 200, houseFloorM2: 110,
};
const calc = (over) => calculate({ ...BASE, ...over });
const st = (over) => calc(over).permit.status;

export default function cases() {
  const t = [];

  // ── (1) 条文由来の定数 ─────────────────────────────
  t.push(eq("法6条2項 十平方メートル", EXEMPT_LIMIT_CM2, 100000));
  t.push(eq("法6条1項1号・2号 二百平方メートル", SMALL_SCALE_LIMIT_CM2, 2000000));
  t.push(eq("法53条3項 角地 十分の一", CORNER_BONUS_PCT, 10));
  t.push(eq("法53条1項 十分の三〜十分の八", RATIO_CHOICES_PCT, [30, 40, 50, 60, 70, 80]));
  t.push(eq("㎡→cm²", [m2ToCm2(1), m2ToCm2(10), m2ToCm2(0.01)], [10000, 100000, 100]));

  // ── (2) 第6条第2項の3条件 ─────────────────────────
  t.push(eq("区域内・増築・防火外・3.52㎡ → 不要", st({}), "not_required"));
  t.push(eq("不要の根拠は 6条2項", calc({}).permit.rule, "6-2"));
  t.push(eq("10㎡ ちょうど（250×400）→ 不要", st({ w1Cm: 250, d1Cm: 400 }), "not_required"));
  t.push(eq("10.01㎡（250×401 = 100,250cm²）→ 要る", st({ w1Cm: 250, d1Cm: 401 }), "required"));
  t.push(eq("permit 直接: 100000 不要／100001 要る",
    [permit({ zone: "inside", fire: false, hasHouse: true, totalCm2: 100000 }).status,
     permit({ zone: "inside", fire: false, hasHouse: true, totalCm2: 100001 }).status], ["not_required", "required"]));
  t.push(eq("防火・準防火地域なら 1㎡ でも要る", st({ fire: true, w1Cm: 100, d1Cm: 100 }), "required"));
  t.push(eq("防火の理由は fire", calc({ fire: true }).permit.why, "fire"));
  t.push(eq("空き地（新築）なら 1㎡ でも要る", st({ hasHouse: false, w1Cm: 100, d1Cm: 100 }), "required"));
  t.push(eq("新築の理由は new", calc({ hasHouse: false }).permit.why, "new"));
  t.push(eq("10㎡ 超の理由は over10", calc({ w1Cm: 300, d1Cm: 400 }).permit.why, "over10"));
  t.push(eq("区域内で要るときの根拠は 6条1項3号", calc({ fire: true }).permit.rule, "6-1-3"));

  // ── (3) 2個は合計 ─────────────────────────────────
  // 2.2×1.6（3.52㎡）＋ 2.6×2.5（6.5㎡）＝ 10.02㎡ → 要る。1個ずつなら どちらも 10㎡ 以下
  t.push(eq("1個ずつなら10㎡以下でも、合計 10.02㎡ → 要る",
    st({ second: true, w2Cm: 260, d2Cm: 250 }), "required"));
  t.push(eq("合計 10㎡ ちょうど（3.5㎡ + 6.5㎡）→ 不要",
    st({ w1Cm: 250, d1Cm: 140, second: true, w2Cm: 260, d2Cm: 250 }), "not_required"));
  t.push(eq("2個目を置かないなら 2個目の寸法は無視", calc({ second: false, w2Cm: 9999, d2Cm: 9999 }).shedCm2, 220 * 160));

  // ── (4) 区域の外 ──────────────────────────────────
  t.push(eq("区域外・増築・10㎡以下 → 不要（6条2項）", [st({ zone: "outside" }), calc({ zone: "outside" }).permit.rule], ["not_required", "6-2"]));
  t.push(eq("区域外では防火の入力を使わない", [st({ zone: "outside", fire: true }), calc({ zone: "outside", fire: true }).input.fire], ["not_required", false]));
  t.push(eq("区域外・増築・10㎡超 → 断定しない（check）", st({ zone: "outside", w1Cm: 300, d1Cm: 400 }), "check"));
  t.push(eq("区域外・空き地・12㎡ → 不要（1号・2号に当たらない）", st({ zone: "outside", hasHouse: false, w1Cm: 300, d1Cm: 400 }), "not_required"));
  t.push(eq("区域外・空き地・200㎡ ちょうど → 不要／200.01㎡ → 要る",
    [permit({ zone: "outside", hasHouse: false, totalCm2: 2000000 }).status,
     permit({ zone: "outside", hasHouse: false, totalCm2: 2000001 }).status], ["not_required", "required"]));

  // ── (6) よくある例 ────────────────────────────────
  const ex = calc({});
  t.push(eq("例: 物置 3.52㎡", ex.shedCm2, 35200));
  t.push(eq("例: 10㎡ までの残り 6.48㎡", ex.exemptRoomCm2, 64800));
  t.push(eq("例: 建ぺい率 上限 72㎡・合計 63.52㎡ で収まる", [ex.buildLimitCm2, ex.buildTotalCm2, ex.buildFits], [720000, 635200, true]));
  t.push(near("例: 建ぺい率 52.933…%", ex.buildRatioPct, (100 * 63.52) / 120));
  t.push(eq("例: 容積率 上限 240㎡・合計 113.52㎡ で収まる", [ex.floorLimitCm2, ex.floorTotalCm2, ex.floorFits], [2400000, 1135200, true]));
  t.push(eq("例: 置ける残りは建ぺい率側の 12㎡", [ex.roomCm2, ex.binding], [120000, "build"]));
  t.push(eq("例: 置いたあとの残り 8.48㎡", ex.afterCm2, 84800));

  // ── (5) 判定の境界 ────────────────────────────────
  // 敷地 100㎡・60% → 上限 60㎡。母屋 56.48㎡ + 物置 3.52㎡ = 60㎡ ちょうど
  t.push(eq("建ぺい率 ちょうど上限は収まる", calc({ siteM2: 100, houseBuildM2: 56.48 }).buildFits, true));
  t.push(eq("建ぺい率 0.01㎡ 超えると超過", calc({ siteM2: 100, houseBuildM2: 56.49 }).buildFits, false));
  // 容積率: 敷地 100㎡・100% → 上限 100㎡。延べ 96.48 + 3.52 = 100 ちょうど
  t.push(eq("容積率 ちょうど上限は収まる", calc({ siteM2: 100, farPct: 100, houseFloorM2: 96.48, houseBuildM2: 50 }).floorFits, true));
  t.push(eq("容積率 0.01㎡ 超えると超過", calc({ siteM2: 100, farPct: 100, houseFloorM2: 96.49, houseBuildM2: 50 }).floorFits, false));
  t.push(eq("容積率が厳しいときは容積率側が残りを決める",
    calc({ siteM2: 100, farPct: 100, houseFloorM2: 98, houseBuildM2: 50 }).binding, "floor"));
  t.push(eq("容積率側の残り 2㎡", calc({ siteM2: 100, farPct: 100, houseFloorM2: 98, houseBuildM2: 50 }).roomCm2, 20000));
  // 浮動小数では誤差が出る組み合わせ: 敷地 123.45㎡・40% → 上限 49.38㎡ ちょうど
  t.push(eq("浮動小数の誤差で超過にしない（45.86 + 3.52 = 49.38㎡）",
    calc({ siteM2: 123.45, ratioPct: 40, houseBuildM2: 45.86 }).buildFits, true));
  t.push(eq("角地なら上限 70%", calc({ corner: true }).limitPct, 70));
  t.push(eq("既に超えている母屋を検出", calc({ siteM2: 100, houseBuildM2: 61 }).houseAlreadyOver, true));
  t.push(eq("空き地なら母屋の値は 0 として扱う", calc({ hasHouse: false, houseBuildM2: 9999, houseFloorM2: 9999 }).buildTotalCm2, 35200));

  // ── 入力検査 ──────────────────────────────────────
  t.push(eq("指定建ぺい率は選択肢のみ", calc({ ratioPct: 65 }).ok, false));
  t.push(eq("指定容積率 49% はエラー／50% は可", [calc({ farPct: 49 }).ok, calc({ farPct: 50 }).ok], [false, true]));
  t.push(eq("母屋 > 敷地 はエラー", calc({ siteM2: 50, houseBuildM2: 60 }).ok, false));
  t.push(eq("間口 29cm はエラー", calc({ w1Cm: 29 }).ok, false));
  t.push(eq("2個目を置くなら寸法が要る", calc({ second: true, w2Cm: NaN, d2Cm: 100 }).ok, false));
  t.push(eq("空の入力はエラー", calc({ siteM2: "" }).ok, false));

  return t;
}
