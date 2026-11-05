// カーポートの積雪荷重のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 条文由来の定数（20N・60度・1m）と、LIXIL の表示（600N/m²＝61.2kg/m²＝新雪20cm）
//   (2) 屋根形状係数 μb＝√cos(1.5β): 0度で1（ちょうど）、40度で√0.5、60度以上で0、雪止めありなら勾配によらず1
//   (3) 雪下ろしの軽減は「1mを超える場合」だけ。ちょうど1mは変わらない
//   (4) 積雪荷重は N/m² の整数に切り上げ。判定は「ちょうど」で足りる、1N 少ないと足りない（浮動小数で判定しない）
//   (5) 逆算した垂直積雪量は、その値で足り、1cm 多いと足りないこと（μb が無理数でも）
//   (6) 雪の種類ごとの深さが LIXIL の表（TOS00380 の600N/m²、UD125N の 600〜3000N/m² の4段・12個）と一致し、
//       物理的な重さで割った深さを超えないこと
//   (7) 入力の検証（単位荷重は20未満にできない・範囲外・製品の値が空）

import {
  UNIT_GENERAL_N,
  SLOPE_ZERO_DEG,
  SNOW_OFF_CAP_CM,
  N_PER_KGF,
  MAKER_REF,
  MAKER_N_PER_CM,
  shapeFactor,
  designDepthCm,
  snowLoadN,
  maxDepthCm,
  makerCmToN,
  nToMakerCm,
  depthBySnowType,
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
  zone: "general", unitN: 30, depthCm: 30, slopeDeg: 0, snowGuard: false, snowOff: false,
  productMode: "n", productValue: 600,
};
const calc = (over) => calculate({ ...BASE, ...over });

export default function cases() {
  const t = [];

  // ── (1) 定数 ──────────────────────────────────────
  t.push(eq("令86条2項 一般 20N/(㎡・cm)", UNIT_GENERAL_N, 20));
  t.push(eq("令86条4項 60度", SLOPE_ZERO_DEG, 60));
  t.push(eq("令86条6項 1m", SNOW_OFF_CAP_CM, 100));
  t.push(eq("1kgf＝9.80665N", N_PER_KGF, 9.80665));
  t.push(eq("600N/m²＝新雪20cm → 1cm あたり30N（LIXIL TOS00380・YKK AP RA-16・三協アルミ）", [MAKER_REF.loadN, MAKER_REF.depthCm, MAKER_N_PER_CM], [600, 20, 30]));
  t.push(eq("LIXIL の併記 61.2kg/m²（600N を小数1桁に丸め）", Math.round((600 / N_PER_KGF) * 10) / 10, 61.2));

  // ── (2) 屋根形状係数 ───────────────────────────────
  t.push(eq("μb 0度＝1（ちょうど）", shapeFactor(0, false), 1));
  t.push(near("μb 40度＝√cos60°＝√0.5", shapeFactor(40, false), Math.SQRT1_2, 1e-12));
  t.push(near("μb 30度＝√cos45°", shapeFactor(30, false), Math.sqrt(Math.SQRT1_2), 1e-12));
  t.push(eq("μb 60度＝0（式どおり）", shapeFactor(60, false), 0));
  t.push(eq("μb 60度超＝0（零とすることができる）", shapeFactor(75, false), 0));
  t.push(eq("μb 雪止めありなら勾配によらず1", [shapeFactor(40, true), shapeFactor(75, true)], [1, 1]));
  {
    let mono = true;
    for (let b = 0; b < 60; b++) if (shapeFactor(b + 1, false) > shapeFactor(b, false)) mono = false;
    t.push(eq("μb は 0〜60度で単調に減る", mono, true));
  }

  // ── (3) 雪下ろしの軽減 ─────────────────────────────
  t.push(eq("軽減あり 150cm → 100cm", designDepthCm(150, true), 100));
  t.push(eq("軽減あり ちょうど100cm → 100cm（変わらない）", designDepthCm(100, true), 100));
  t.push(eq("軽減あり 101cm → 100cm", designDepthCm(101, true), 100));
  t.push(eq("軽減あり 80cm → 80cm（1m 以下は減らさない）", designDepthCm(80, true), 80));
  t.push(eq("軽減なし 150cm → 150cm", designDepthCm(150, false), 150));

  // ── (4) 積雪荷重と判定の境界 ───────────────────────
  t.push(eq("一般 30cm 0度 → 600N/m²", snowLoadN(20, 30, 1), 600));
  t.push(eq("多雪 30N 100cm → 3000N/m²", snowLoadN(30, 100, 1), 3000));
  t.push(eq("一般 30cm 40度 → 424.26… を切り上げて 425", snowLoadN(20, 30, Math.SQRT1_2), 425));
  t.push(eq("ちょうど 600 = 600 は足りる", calc({ productValue: 600 }).product.fits, true));
  t.push(eq("599 < 600 は足りない", calc({ productValue: 599 }).product.fits, false));
  t.push(eq("差（N/m²）", [calc({ productValue: 600 }).product.marginN, calc({ productValue: 599 }).product.marginN], [0, -1]));
  t.push(eq("一般区域では単位荷重の入力を無視して20N", calc({ zone: "general", unitN: 35 }).loadN, 600));
  t.push(eq("多雪区域では入力の単位荷重を使う（30N × 30cm）", calc({ zone: "heavy", unitN: 30 }).loadN, 900));
  t.push(near("kgf 換算 600N → 61.18…", calc({}).loadKgf, 600 / 9.80665, 1e-12));
  t.push(eq("積雪荷重をメーカー表示の cm に（600 → 20・601 → 21・425 → 15）", [nToMakerCm(600), nToMakerCm(601), nToMakerCm(425)], [20, 21, 15]));
  t.push(eq("cm 表記 → N/m²（三協 20cm → 600・50cm → 1500／UD125N 30cm → 900・100cm → 3000）",
    [makerCmToN(20), makerCmToN(50), makerCmToN(30), makerCmToN(100)], [600, 1500, 900, 3000]));
  t.push(eq("cm モード 20cm 表記の製品は一般 30cm でちょうど足りる", calc({ productMode: "cm", productValue: 20 }).product.fits, true));
  t.push(eq("cm モード 20cm 表記の製品は一般 31cm で足りない", calc({ productMode: "cm", productValue: 20, depthCm: 31 }).product.fits, false));
  {
    let mono = true;
    for (let d = 1; d < 300; d++) if (snowLoadN(20, d + 1, 1) < snowLoadN(20, d, 1)) mono = false;
    t.push(eq("積雪荷重は垂直積雪量について単調に増える", mono, true));
  }

  // ── (5) 逆算 ──────────────────────────────────────
  t.push(eq("600N・一般・0度 → 30cm まで", maxDepthCm(600, 20, 1), 30));
  t.push(eq("599N・一般・0度 → 29cm まで", maxDepthCm(599, 20, 1), 29));
  t.push(eq("3000N・多雪30N・0度 → 100cm まで", maxDepthCm(3000, 30, 1), 100));
  t.push(eq("600N・一般・40度 → 42cm まで", maxDepthCm(600, 20, Math.SQRT1_2), 42));
  t.push(eq("μb＝0 なら上限なし", maxDepthCm(600, 20, 0), null));
  {
    let consistent = true;
    for (const mu of [1, Math.SQRT1_2, shapeFactor(10, false), shapeFactor(25, false), shapeFactor(55, false)]) {
      for (const p of [1, 59, 600, 601, 1499, 1500, 2999, 3000, 4500]) {
        for (const w of [20, 30, 35]) {
          const d = maxDepthCm(p, w, mu);
          if (snowLoadN(w, d, mu) > p || snowLoadN(w, d + 1, mu) <= p) consistent = false;
        }
      }
    }
    t.push(eq("逆算値で足り、1cm 多いと足りない（μb・単位荷重・耐積雪荷重の組み合わせ 135通り）", consistent, true));
  }
  t.push(eq("雪下ろし軽減あり・3000N・多雪30N → 1m に耐えるので垂直積雪量によらず足りる",
    calc({ zone: "heavy", unitN: 30, depthCm: 150, snowOff: true, productValue: 3000 }).product.anyDepthWithSnowOff, true));
  t.push(eq("雪下ろし軽減あり 150cm → 使う値は100cm・軽減した印あり",
    [calc({ zone: "heavy", unitN: 30, depthCm: 150, snowOff: true }).usedDepthCm, calc({ zone: "heavy", unitN: 30, depthCm: 150, snowOff: true }).reduced],
    [100, true]));
  t.push(eq("雪下ろし軽減あり・2999N → 1m に耐えないので印なし",
    calc({ zone: "heavy", unitN: 30, depthCm: 150, snowOff: true, productValue: 2999 }).product.anyDepthWithSnowOff, false));

  // ── (6) 雪の種類ごとの深さ（LIXIL の表） ───────────
  t.push(eq("600N/m² → 新雪20・締雪12・粗目雪8（TOS00380 の表と一致）", depthBySnowType(600).map((x) => x.cm), [20, 12, 8]));
  t.push(eq("雪の種類の並びと比重", depthBySnowType(600).map((x) => [x.name, x.gravity]), [["新雪", 0.3], ["締雪", 0.5], ["粗目雪", 0.7]]));
  // LIXIL 取扱説明書 UD125N（2026年4月版）の表は4段・12個。600N だけでは物理的な重さ（雪比重×98.0665N）で割っても一致してしまい、
  // 900N の粗目雪と 3000N の3つで表より1cm 多く出る（危ない側）ことを見逃した（2026-11-05 に検出）
  for (const [p, cms] of [[600, [20, 12, 8]], [900, [30, 18, 12]], [1500, [50, 30, 21]], [3000, [100, 60, 42]]]) {
    t.push(eq(`${p}N/m² → 新雪${cms[0]}・締雪${cms[1]}・粗目雪${cms[2]}（UD125N の表と一致）`, depthBySnowType(p).map((x) => x.cm), cms));
  }
  t.push(eq("UD125N の併記 kg/m²（600・900・1500・3000N → 61.2・91.8・153.0・305.9）",
    [600, 900, 1500, 3000].map((p) => Math.round((p / N_PER_KGF) * 10) / 10), [61.2, 91.8, 153, 305.9]));
  t.push(eq("切り捨ての境界 700N → 23・14・10（ちょうど）／699N → 23・13・9", [depthBySnowType(700), depthBySnowType(699)].map((r) => r.map((x) => x.cm)), [[23, 14, 10], [23, 13, 9]]));
  {
    let never = true;
    for (let p = 1; p <= 10000; p++) for (const s of depthBySnowType(p)) if (s.cm > p / (s.gravity * 10 * N_PER_KGF)) never = false;
    t.push(eq("どの耐積雪荷重（1〜10000N）でも、物理的な重さで割った深さを超えない", never, true));
  }

  // ── (7) 入力の検証 ─────────────────────────────────
  t.push(eq("多雪区域で単位荷重19は不可（20以上）", calc({ zone: "heavy", unitN: 19 }).ok, false));
  t.push(eq("多雪区域で単位荷重20は可", calc({ zone: "heavy", unitN: 20 }).ok, true));
  t.push(eq("垂直積雪量 0cm は不可・1cm は可", [calc({ depthCm: 0 }).ok, calc({ depthCm: 1 }).ok], [false, true]));
  t.push(eq("勾配 91度は不可", calc({ slopeDeg: 91 }).ok, false));
  t.push(eq("垂直積雪量が空（NaN）は不可", calc({ depthCm: NaN }).ok, false));
  t.push(eq("製品の値が空なら比較なしで計算する", [calc({ productValue: null }).ok, calc({ productValue: null }).product], [true, null]));
  t.push(eq("製品の値が範囲外は不可", calc({ productValue: 0 }).ok, false));
  t.push(eq("60度超の印（雪止めなし）", [calc({ slopeDeg: 61 }).slopeOver60, calc({ slopeDeg: 61, snowGuard: true }).slopeOver60], [true, false]));

  return t;
}
