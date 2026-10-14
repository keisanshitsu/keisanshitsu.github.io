// セットバック（2項道路）の計算のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 条文由来の定数（中心線から2m・6m区域3m・崖地側4m・接道2m・前面道路12m・各号の数値）
//   (2) 2項道路になるのは幅員4m「未満」だけ（ちょうど4m は後退なし）。6m区域の4m以上6m未満は判定しない
//   (3) 両側に宅地なら (2m − 幅員/2)、崖地側なら (4m − 幅員)。cm 単位の奇数幅でも mm で割り切れる
//   (4) 有効敷地面積 ＝ 敷地 − 後退距離 × 間口（令2条1項1号）
//   (5) 前面道路による容積率はみなし幅員（4m／6m）で計算し、指定容積率と小さいほうを取る
//   (6) 解説記事で広く引かれる例（幅員2m・間口10m・100㎡ → 後退1m・10㎡・90㎡）と一致すること

import {
  CENTER_STD_MM,
  CENTER_SIX_MM,
  CLIFF_MM,
  TWO_KOU_MAX_MM,
  SIX_ZONE_WIDTH_MM,
  FRONTAGE_MIN_MM,
  ROAD_RULE_MAX_MM,
  FAR_CHOICES_PCT,
  ROAD_FACTOR_TENTHS,
  COVERAGE_CHOICES_PCT,
  m2ToMm2,
  setbackOf,
  roadFarPct,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

const BASE = {
  roadCm: 200, zone: "std", side: "both", frontageCm: 1000, siteM2: 100,
  coveragePct: 60, farPct: 200, roadFactorTenths: 4,
};
const calc = (over) => calculate({ ...BASE, ...over });
const M2 = 1e6;

export default function cases() {
  const t = [];

  // ── (1) 条文由来の定数 ─────────────────────────────
  t.push(eq("法42条2項 中心線から2m／6m区域3m／崖地側4m", [CENTER_STD_MM, CENTER_SIX_MM, CLIFF_MM], [2000, 3000, 4000]));
  t.push(eq("法42条 幅員4m未満の道／6m区域", [TWO_KOU_MAX_MM, SIX_ZONE_WIDTH_MM], [4000, 6000]));
  t.push(eq("法43条1項 接道2m・法52条2項 12m未満", [FRONTAGE_MIN_MM, ROAD_RULE_MAX_MM], [2000, 12000]));
  t.push(eq("法52条1項 十分の五〜十分の百三十", FAR_CHOICES_PCT,
    [50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300]));
  t.push(eq("法52条2項 十分の四・六・八", ROAD_FACTOR_TENTHS, [4, 6, 8]));
  t.push(eq("法53条1項 十分の三〜十分の八", COVERAGE_CHOICES_PCT, [30, 40, 50, 60, 70, 80]));
  t.push(eq("㎡→mm²", [m2ToMm2(1), m2ToMm2(0.01), m2ToMm2(90.5)], [1e6, 1e4, 90.5e6]));

  // ── (2) 2項道路になる幅員の境界 ─────────────────────
  t.push(eq("幅員399cm → 後退5mm", setbackOf(3990, "std", "both"), { kind: "setback", setbackMm: 5, deemedWidthMm: 4000 }));
  t.push(eq("幅員ちょうど4m → 後退なし", setbackOf(4000, "std", "both").kind, "wide"));
  t.push(eq("幅員4m超 → みなし幅員は現況", setbackOf(5000, "std", "both"), { kind: "wide", setbackMm: 0, deemedWidthMm: 5000 }));
  t.push(eq("6m区域・幅員399cm → 3m − 1.995m", setbackOf(3990, "six", "both"), { kind: "setback", setbackMm: 1005, deemedWidthMm: 6000 }));
  t.push(eq("6m区域・幅員ちょうど4m → 判定しない", setbackOf(4000, "six", "both").kind, "unsupported"));
  t.push(eq("6m区域・幅員599cm → 判定しない", setbackOf(5990, "six", "both").kind, "unsupported"));
  t.push(eq("6m区域・幅員ちょうど6m → 後退なし", setbackOf(6000, "six", "both").kind, "wide"));
  t.push(eq("6m区域 × 崖地側 → 判定しない", setbackOf(2500, "six", "cliff").kind, "unsupported"));

  // ── (3) 後退距離 ──────────────────────────────────
  t.push(eq("両側: 幅員2.0m → 1.0m", setbackOf(2000, "std", "both").setbackMm, 1000));
  t.push(eq("両側: 幅員2.7m → 0.65m", setbackOf(2700, "std", "both").setbackMm, 650));
  t.push(eq("両側: 奇数cm 2.55m → 0.725m（整数mm）", setbackOf(2550, "std", "both").setbackMm, 725));
  t.push(eq("崖地側: 幅員2.5m → 1.5m（拡幅分をすべて負う）", setbackOf(2500, "std", "cliff"), { kind: "setback", setbackMm: 1500, deemedWidthMm: 4000 }));
  t.push(eq("崖地側: 幅員399cm → 1cm", setbackOf(3990, "std", "cliff").setbackMm, 10));
  t.push(eq("崖地側でも4m以上なら後退なし", setbackOf(4000, "std", "cliff").kind, "wide"));
  t.push(eq("6m区域: 幅員2.0m → 2.0m", setbackOf(2000, "six", "both").setbackMm, 2000));

  // ── (4) 有効敷地面積・(6) 記事の例 ───────────────────
  const a = calc({});
  t.push(eq("記事の例: 後退1m・後退面積10㎡・有効90㎡", [a.setbackMm, a.setbackAreaMm2 / M2, a.effectiveMm2 / M2], [1000, 10, 90]));
  const b = calc({ frontageCm: 800, siteM2: 64 });
  t.push(eq("記事の例2: 8m×8m・幅員2m → 8㎡減って56㎡", [b.setbackAreaMm2 / M2, b.effectiveMm2 / M2], [8, 56]));
  t.push(eq("崖地側 2.5m・間口12m・150㎡ → 18㎡・132㎡",
    (() => { const r = calc({ roadCm: 250, side: "cliff", frontageCm: 1200, siteM2: 150 }); return [r.setbackAreaMm2 / M2, r.effectiveMm2 / M2]; })(), [18, 132]));
  t.push(eq("後退なしの道では有効＝敷地", (() => { const r = calc({ roadCm: 450 }); return [r.kind, r.effectiveMm2 / M2]; })(), ["wide", 100]));
  t.push(eq("後退面積が敷地以上 → エラー", calc({ siteM2: 10, frontageCm: 1000 }).ok, false));
  t.push(eq("後退面積が敷地をわずかに下回る → 計算できる", calc({ siteM2: 10.01, frontageCm: 1000 }).effectiveMm2, 10000));

  // ── (5) 前面道路による容積率 ─────────────────────────
  t.push(eq("4m × 4/10 ＝ 160%", roadFarPct(4000, 4), 160));
  t.push(eq("6m × 6/10 ＝ 360%", roadFarPct(6000, 6), 360));
  t.push(eq("4m × 8/10 ＝ 320%", roadFarPct(4000, 8), 320));
  t.push(eq("11.99m は対象（12m未満）", roadFarPct(11990, 4), 479.6));
  t.push(eq("ちょうど12m は対象外", roadFarPct(12000, 4), null));
  t.push(eq("記事の例: 指定200%・4m×0.4 → 160%で頭打ち", [a.roadFarPct, a.farLimitPct, a.roadRuleBinds], [160, 160, true]));
  t.push(eq("建てられる建築面積 90×60% ＝ 54㎡", a.maxBuildingMm2 / M2, 54));
  t.push(eq("建てられる延べ面積 90×160% ＝ 144㎡", a.maxFloorMm2 / M2, 144));
  t.push(eq("誤った計算（後退・道路制限を無視）100×60%・200%", [a.naiveBuildingMm2 / M2, a.naiveFloorMm2 / M2], [60, 200]));
  t.push(eq("指定容積率が小さければ指定のまま（150% < 160%）",
    (() => { const r = calc({ farPct: 150 }); return [r.farLimitPct, r.roadRuleBinds]; })(), [150, false]));
  t.push(eq("ちょうど等しい（160% と 160%）なら頭打ち扱いにしない",
    (() => { const r = calc({ roadFactorTenths: 4, farPct: 200, zone: "std" }); const s = calculate({ ...BASE, farPct: 150, roadFactorTenths: 4 }); return [r.roadRuleBinds, s.roadRuleBinds]; })(), [true, false]));
  t.push(eq("6m区域: みなし6m × 4/10 ＝ 240%", calc({ zone: "six", farPct: 300 }).farLimitPct, 240));
  t.push(eq("後退なしの5m道路 × 4/10 ＝ 200%", calc({ roadCm: 500, farPct: 300 }).farLimitPct, 200));
  t.push(eq("後退なしの12m道路 → 指定容積率のまま", calc({ roadCm: 1200, farPct: 300 }).farLimitPct, 300));

  // ── 接道（法43条1項）───────────────────────────────
  t.push(eq("間口ちょうど2m → 接道を満たす", calc({ frontageCm: 200 }).frontageOk, true));
  t.push(eq("間口199cm → 満たさない", calc({ frontageCm: 199 }).frontageOk, false));

  // ── 入力チェック ─────────────────────────────────
  t.push(eq("幅員が空 → エラー", calc({ roadCm: NaN }).ok, false));
  t.push(eq("幅員が下限未満 → エラー", calc({ roadCm: 49 }).ok, false));
  t.push(eq("建ぺい率が選択肢外 → エラー", calc({ coveragePct: 65 }).ok, false));
  t.push(eq("容積率が選択肢外 → エラー", calc({ farPct: 250 }).ok, false));
  t.push(eq("乗数が選択肢外 → エラー", calc({ roadFactorTenths: 5 }).ok, false));
  t.push(eq("6m区域の4〜6m道路はエラーで理由を返す", (() => { const r = calc({ zone: "six", roadCm: 450 }); return [r.ok, /第4項/.test(r.errors[0])]; })(), [false, true]));
  t.push(eq("zone・side は不正値を既定に寄せる", calc({ zone: "x", side: "y" }).setbackMm, 1000));

  return t;
}
