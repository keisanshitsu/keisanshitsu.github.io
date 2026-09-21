// ブロック塀の計算のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// このツールが守らなければならないのは、大きく3つある。
//   (1) 出典由来の定数そのもの（施行令62条の8 の数値・JIS のモジュール寸法）
//   (2) **高さ1.2m以下で第五号・第七号が適用除外になる**という条文冒頭の括弧書き。
//       実務で最も見落とされる箇所であり、ここを落とすと「控壁が無いから不適合」と
//       誤って表示する。逆に、1.2mを1mmでも超えたら適用されなければならない
//   (3) 施行令（最低基準）と 日本建築学会 設計規準（推奨）を混ぜないこと。
//       混ぜると「法には適合しているのに不適合と出る」か、その逆が起きる

import {
  MODULE_L_MM,
  MODULE_H_MM,
  JOINT_MM,
  THICKNESS_RANGE_MM,
  THICKNESS_CHOICES_MM,
  REI,
  GAKKAI,
  FOOTING_TYPES,
  gakkaiVerticalSpacingMm,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});
const truthy = (name, actual) => ({ name, ok: actual === true, expected: true, actual });

/** 基準となる入力。個々のテストは必要な項目だけ上書きする */
const BASE = {
  lengthMm: 10000,
  courses: 8,
  thicknessMm: 150,
  footingRiseMm: 50,
  copingMm: 0,
  hasButtress: true,
  rebarDiaMm: 10,
  vSpacingMm: 400,
  hSpacingMm: 600,
  footingType: "I",
  footingDepthMm: 350,
  footingEmbedMm: 300,
  lossPercent: 5,
};
const calc = (over = {}) => calculate({ ...BASE, ...over });
const checkNo = (res, no) => res.checks.find((c) => c.no === no);

export default function cases() {
  const t = [];

  // ── 出典由来の定数の錠 ──────────────────────────────────────────
  // JIS A 5406 の基本形ブロックは製品 390×190、標準目地幅 10mm。
  // モジュール ＝ 製品寸法 ＋ 目地幅 なので 400×200 になる（工業会資料）。
  t.push(eq("横モジュールは 400mm", MODULE_L_MM, 400));
  t.push(eq("縦モジュールは 200mm", MODULE_H_MM, 200));
  t.push(eq("標準目地幅は 10mm", JOINT_MM, 10));
  t.push(eq("モジュール − 目地 = 製品寸法 390×190", [MODULE_L_MM - JOINT_MM, MODULE_H_MM - JOINT_MM], [390, 190]));
  t.push(eq("正味厚さの規格範囲は 100〜200mm", [THICKNESS_RANGE_MM.min, THICKNESS_RANGE_MM.max], [100, 200]));
  t.push(truthy("選択肢の厚さはすべて規格範囲に収まる",
    THICKNESS_CHOICES_MM.every((v) => v >= THICKNESS_RANGE_MM.min && v <= THICKNESS_RANGE_MM.max)));

  // 施行令 第62条の8 の数値。改正されない限り動かしてはならない。
  t.push(eq("一号 高さの上限 2.2m", REI.maxHeightMm, 2200));
  t.push(eq("二号 厚さ 150mm（高さ2m以下は100mm）", [REI.minThicknessMm, REI.minThicknessUpTo2mMm, REI.thicknessThresholdMm], [150, 100, 2000]));
  t.push(eq("三・四号 鉄筋径は9mm以上", REI.minRebarDiaMm, 9));
  t.push(eq("四号 鉄筋の間隔は80cm以下", REI.maxRebarSpacingMm, 800));
  t.push(eq("五号 控壁は3.4m以下ごと", REI.maxButtressSpanMm, 3400));
  t.push(eq("五号 控壁の突出は高さの1/5以上", REI.buttressProjectionRatio, 1 / 5));
  t.push(eq("七号 基礎の丈35cm・根入れ30cm", [REI.minFootingDepthMm, REI.minFootingEmbedMm], [350, 300]));
  t.push(eq("適用除外の境界は高さ1.2m", REI.exemptionHeightMm, 1200));

  // 学会 設計規準（施行令より厳しい側にしか置かない）
  t.push(eq("設計規準の最小厚さ 120mm", GAKKAI.minThicknessMm, 120));
  t.push(truthy("設計規準の厚さは施行令の緩和値より厳しい", GAKKAI.minThicknessMm > REI.minThicknessUpTo2mMm));
  t.push(eq("設計規準の控壁突出 400mm以上", GAKKAI.buttressProjectionMinMm, 400));
  t.push(eq("設計規準の端部〜控壁 800mm以下", GAKKAI.endToButtressMaxMm, 800));
  t.push(eq("設計規準のEXP.J 30m以内ごと", GAKKAI.expansionJointMaxMm, 30000));
  t.push(eq("設計規準の縦筋定着 40d", GAKKAI.rebarAnchorageFactor, 40));
  t.push(eq("基礎の形状は3種類", Object.keys(FOOTING_TYPES).sort(), ["I", "L", "invT"]));

  // ── 基準ケース 長さ10m・8段・厚150 ───────────────────────────────
  const base = calc();
  t.push(truthy("基準ケースの計算が成功する", base.ok));
  t.push(eq("8段のブロック高さは1600mm", base.dimensions.wallHeightMm, 1600));
  t.push(eq("塀の高さは 基礎立上り50 + 1600 = 1650mm", base.dimensions.heightMm, 1650));
  t.push(eq("1段あたり25個・総数200個", [base.blocks.perCourse, base.blocks.total], [25, 200]));
  t.push(eq("ロス5%込みで210個", base.blocks.withLoss, 210));
  t.push(eq("壁面積 16㎡", base.dimensions.wallAreaM2, 16));
  t.push(eq("縦筋26本・間隔400mm", [base.rebar.vCount, base.rebar.vSpacingMm], [26, 400]));
  t.push(eq("縦筋1本の長さ = 1600 + 40×10 = 2.0m", base.rebar.vEachM, 2));
  t.push(eq("横筋は3段ごと=600mmで3本", [base.rebar.hEveryCourses, base.rebar.hSpacingMm, base.rebar.hCount], [3, 600, 3]));
  t.push(eq("鉄筋の総長さ 82.0m", base.rebar.totalM, 82));
  t.push(eq("I形基礎 150×350 の断面で 0.53㎥", [base.footing.sectionM2, base.footing.volumeM3], [0.0525, 0.53]));
  t.push(eq("基準ケースは施行令に適合", [base.verdict, base.ngCount], ["適合", 0]));

  // ── 条文冒頭の括弧書き: 高さ1.2m以下は第五号・第七号が適用されない ────────
  // ここが本ツール最大の差別化であり、最も壊れてはいけない箇所。
  const exact1200 = calc({ courses: 6, footingRiseMm: 0 });
  t.push(eq("高さちょうど1200mmは適用除外（境界を含む）",
    [exact1200.dimensions.heightMm, exact1200.dimensions.exemptUnder1200], [1200, true]));
  t.push(eq("1200mmでは第五号が na", checkNo(exact1200, 5).status, "na"));
  t.push(eq("1200mmでは第七号が na", checkNo(exact1200, 7).status, "na"));
  t.push(truthy("適用除外であることを注記する", exact1200.notes.some((n) => n.includes("1.2m以下"))));
  t.push(eq("1200mmでも控壁なしを不適合にしない",
    calc({ courses: 6, footingRiseMm: 0, hasButtress: false }).verdict, "適合"));

  const over1200 = calc({ courses: 6, footingRiseMm: 1 });
  t.push(eq("1201mmでは適用除外にならない",
    [over1200.dimensions.heightMm, over1200.dimensions.exemptUnder1200], [1201, false]));
  t.push(truthy("1201mmでは第五号・第七号が判定される",
    ["ok", "ng"].includes(checkNo(over1200, 5).status) && ["ok", "ng"].includes(checkNo(over1200, 7).status)));
  t.push(eq("1201mmで控壁を設けないと第五号が不適合",
    calc({ courses: 6, footingRiseMm: 1, hasButtress: false }).checks.find((c) => c.no === 5).status, "ng"));

  // ── 一号 高さの上限 2.2m ────────────────────────────────────────
  t.push(eq("高さ2200mmちょうどは適合", checkNo(calc({ courses: 11, footingRiseMm: 0 }), 1).status, "ok"));
  t.push(eq("高さ2250mmは不適合", checkNo(calc({ courses: 11, footingRiseMm: 50 }), 1).status, "ng"));

  // ── 二号 厚さの分岐は「高さ2m以下」──────────────────────────────
  const h2000 = calc({ courses: 10, footingRiseMm: 0, thicknessMm: 100 });
  t.push(eq("高さ2000mmちょうどなら厚さ100mmで適合",
    [h2000.dimensions.heightMm, checkNo(h2000, 2).status], [2000, "ok"]));
  const h2050 = calc({ courses: 10, footingRiseMm: 50, thicknessMm: 100 });
  t.push(eq("高さ2050mmでは厚さ100mmは不適合（150mm必要）",
    [h2050.dimensions.heightMm, checkNo(h2050, 2).status], [2050, "ng"]));
  t.push(eq("高さ2050mmでも厚さ150mmなら適合",
    checkNo(calc({ courses: 10, footingRiseMm: 50, thicknessMm: 150 }), 2).status, "ok"));

  // ── 三・四号 鉄筋 ──────────────────────────────────────────────
  t.push(eq("径9mm未満は第三号が不適合", checkNo(calc({ rebarDiaMm: 6 }), 3).status, "ng"));
  t.push(eq("径9mmちょうどは適合（境界を含む）", checkNo(calc({ rebarDiaMm: 9 }), 3).status, "ok"));
  t.push(eq("縦筋間隔800mmちょうどは第四号が適合",
    checkNo(calc({ lengthMm: 8000, vSpacingMm: 800 }), 4).status, "ok"));
  // 横筋の間隔は段の整数倍にしか置けない。800mm指定なら4段ごと＝800mmで境界に一致する。
  const h800 = calc({ hSpacingMm: 800 });
  t.push(eq("横筋800mm指定は4段ごと=800mmになる",
    [h800.rebar.hEveryCourses, h800.rebar.hSpacingMm], [4, 800]));
  t.push(eq("横筋800mmでも第四号は適合（境界を含む）", checkNo(h800, 4).status, "ok"));
  const h799 = calc({ hSpacingMm: 799 });
  t.push(eq("799mm指定は切り捨てて3段ごと=600mm（安全側に丸める）",
    [h799.rebar.hEveryCourses, h799.rebar.hSpacingMm], [3, 600]));
  t.push(eq("横筋を毎段入れると本数は段数と等しい",
    calc({ hSpacingMm: 200 }).rebar.hCount, BASE.courses));

  // ── 五号 控壁の本数と区間長 ────────────────────────────────────
  // 施行令は「3.4m以下ごと」しか言わないが、設計規準は端部にも控壁を求める。
  // 両方を別々に出し、混ぜないこと。
  t.push(eq("長さ10mなら施行令ベース2本・設計規準ベース4本",
    [base.buttress.countByRei, base.buttress.countByGakkai], [2, 4]));
  // ⚠ 本数と配置は同じ出典で揃える。以前は「学会の本数(4)」を「等間隔」で割って
  // 2.0m と表示していたが、これはどちらの配置とも一致しない数字だった。
  // 施行令の配置: 2本を等間隔 → 10/3 = 3.33m
  t.push(eq("施行令どおり2本を等間隔なら区間3.33m", base.buttress.spanReiM, 3.33));
  // 学会の配置: 両端800mmに寄せ、残り8.4mを3等分 → 2.8m（2.0m ではない）
  t.push(eq("学会どおり4本・両端800mmなら最大区間2.8m", base.buttress.spanGakkaiM, 2.8));
  t.push(truthy("学会の配置は端が寄るぶん内側が等間隔より長くなる",
    base.buttress.spanGakkaiM > base.dimensions.lengthM / (base.buttress.countByGakkai + 1)));
  t.push(eq("高さ1650の突出は施行令330mm・設計規準400mm",
    [base.buttress.projectionReiMm, base.buttress.projectionGakkaiMm], [330, 400]));
  t.push(truthy("設計規準の突出は常に施行令以上",
    [1300, 1650, 2000, 2200].every((h) => {
      const r = calc({ courses: Math.round((h - 50) / 200), footingRiseMm: 50 });
      return r.buttress.projectionGakkaiMm >= r.buttress.projectionReiMm;
    })));
  t.push(eq("長さ3.4mちょうどは施行令ベースで控壁0本",
    calc({ lengthMm: 3400 }).buttress.countByRei, 0));
  t.push(eq("長さ3.4m超は施行令ベースで控壁1本",
    calc({ lengthMm: 3401 }).buttress.countByRei, 1));
  t.push(eq("長さ1.6m以下なら設計規準ベースは1本で足りる",
    calc({ lengthMm: 1600 }).buttress.countByGakkai, 1));
  t.push(eq("長さ1.6m超は端部2本が要る",
    calc({ lengthMm: 1601 }).buttress.countByGakkai, 2));
  // どちらの配置でも上限3.4mを割らないことを、両方について確かめる。
  // 片方だけ確かめると、もう片方の配置で不足する本数を「適合」と表示しうる。
  t.push(truthy("施行令の配置ではどの長さでも区間長が3.4mを超えない",
    [1000, 3400, 3401, 7000, 10000, 20000, 34000].every((L) => calc({ lengthMm: L }).buttress.spanReiM <= 3.4)));
  t.push(truthy("学会の配置でもどの長さでも区間長が3.4mを超えない",
    [1000, 1600, 1601, 3400, 3401, 7000, 10000, 20000, 34000, 50000]
      .every((L) => calc({ lengthMm: L }).buttress.spanGakkaiM <= 3.4)));
  t.push(eq("長さ1.6m・控壁1本なら最大区間は0.8m", calc({ lengthMm: 1600 }).buttress.spanGakkaiM, 0.8));
  t.push(eq("控壁を設けないなら区間は塀の全長そのもの",
    calc({ lengthMm: 10000, hasButtress: false }).buttress.spanReiM, 10));

  // ── 七号 基礎 ─────────────────────────────────────────────────
  t.push(eq("丈350・根入れ300ちょうどは適合（境界を含む）",
    checkNo(calc({ footingDepthMm: 350, footingEmbedMm: 300 }), 7).status, "ok"));
  t.push(eq("丈349は不適合", checkNo(calc({ footingDepthMm: 349 }), 7).status, "ng"));
  t.push(eq("根入れ299は不適合", checkNo(calc({ footingEmbedMm: 299 }), 7).status, "ng"));

  // 基礎の断面（設計規準 表2 の張り出し寸法）
  const invT = calc({ footingType: "invT" });
  t.push(eq("逆T形は両側13cm張り出して幅410mm", invT.footing.baseWidthMm, 410));
  t.push(eq("逆T形の断面 150×200 + 410×150 = 0.0915㎡", invT.footing.sectionM2, 0.0915));
  const lshape = calc({ footingType: "L" });
  t.push(eq("L形は片側40cm張り出して幅550mm", lshape.footing.baseWidthMm, 550));
  t.push(eq("L形の断面 150×200 + 550×150 = 0.1125㎡", lshape.footing.sectionM2, 0.1125));
  t.push(truthy("張り出しのある基礎はI形よりコンクリートが増える",
    invT.footing.volumeM3 > base.footing.volumeM3 && lshape.footing.volumeM3 > invT.footing.volumeM3));
  t.push(eq("張り出し厚150mmより丈が浅い指定は拒否",
    [calc({ footingType: "invT", footingDepthMm: 149 }).ok], [false]));

  // ── 設計規準 表5 縦筋の間隔 ────────────────────────────────────
  t.push(eq("控壁あり・高さ1600以下 → 800mm", gakkaiVerticalSpacingMm(1600, true), { d10: 800, d13: 800 }));
  t.push(eq("控壁あり・高さ1601 → 400mm", gakkaiVerticalSpacingMm(1601, true), { d10: 400, d13: 400 }));
  t.push(eq("控壁なし・高さ1200以下 → 800mm", gakkaiVerticalSpacingMm(1200, false), { d10: 800, d13: 800 }));
  t.push(eq("控壁なし・高さ1201〜1600 → D10は400・D13は800", gakkaiVerticalSpacingMm(1201, false), { d10: 400, d13: 800 }));
  t.push(eq("控壁あり・2.2m超は表の範囲外", gakkaiVerticalSpacingMm(2201, true), null));
  t.push(eq("控壁なし・1.6m超は表の範囲外", gakkaiVerticalSpacingMm(1601, false), null));

  // ── 施行令と設計規準を混ぜていないこと ───────────────────────────
  // 厚さ100mm・高さ2m以下は「法には適合するが規準は満たさない」。
  // この状態で verdict を不適合にしてはならない（法の判定に推奨値を混ぜない）。
  const thin = calc({ courses: 8, thicknessMm: 100 });
  t.push(eq("厚さ100mm・高さ1650mmは施行令に適合", [checkNo(thin, 2).status, thin.verdict], ["ok", "適合"]));
  t.push(truthy("同じ条件で設計規準側は警告を出す",
    thin.advice.some((a) => a.title.includes("120mm") && a.status === "warn")));

  // ── 注記 ──────────────────────────────────────────────────────
  t.push(truthy("400で割り切れない長さは端部の調整を注記する",
    calc({ lengthMm: 10100 }).notes.some((n) => n.includes("半切り"))));
  t.push(eq("10100mmは1段26個に切り上げる", calc({ lengthMm: 10100 }).blocks.perCourse, 26));
  t.push(truthy("30m超はエキスパンションジョイントを助言する",
    calc({ lengthMm: 40000 }).advice.some((a) => a.title.includes("エキスパンション"))));
  t.push(truthy("30mちょうどでは助言しない",
    !calc({ lengthMm: 30000 }).advice.some((a) => a.title.includes("エキスパンション"))));
  t.push(truthy("高さ1.8m超でD10なら端部D13を助言する",
    calc({ courses: 9, footingRiseMm: 50 }).advice.some((a) => a.title.includes("D13"))));
  t.push(truthy("高さ1.8m以下では端部D13を助言しない",
    !calc({ courses: 8, footingRiseMm: 50 }).advice.some((a) => a.title.includes("D13"))));

  // ── ロス率 ────────────────────────────────────────────────────
  t.push(eq("ロス0%なら総数と同じ", calc({ lossPercent: 0 }).blocks.withLoss, 200));
  t.push(eq("ロス10%で220個", calc({ lossPercent: 10 }).blocks.withLoss, 220));
  t.push(eq("端数は切り上げる（3%なら206個）", calc({ lossPercent: 3 }).blocks.withLoss, 206));

  // ── 笠木 ──────────────────────────────────────────────────────
  t.push(eq("笠木100mmは塀の高さに加算される", calc({ copingMm: 100 }).dimensions.heightMm, 1750));
  // 笠木は高さに算入されるので、これだけで適用除外が外れることがある。
  // 1200mm ちょうどは除外されたままで、1201mm から外れる（境界は「以下」）。
  t.push(eq("笠木150mmで高さ1200mm → まだ適用除外",
    [calc({ courses: 5, footingRiseMm: 50, copingMm: 150 }).dimensions.heightMm,
     calc({ courses: 5, footingRiseMm: 50, copingMm: 150 }).dimensions.exemptUnder1200], [1200, true]));
  t.push(eq("笠木151mmで高さ1201mm → 適用除外が外れる",
    [calc({ courses: 5, footingRiseMm: 50, copingMm: 151 }).dimensions.heightMm,
     calc({ courses: 5, footingRiseMm: 50, copingMm: 151 }).dimensions.exemptUnder1200], [1201, false]));

  // ── 入力の検証 ────────────────────────────────────────────────
  const bad = [
    ["長さ0は拒否", { lengthMm: 0 }],
    ["長さ負は拒否", { lengthMm: -1 }],
    ["段数0は拒否", { courses: 0 }],
    ["段数が小数は拒否", { courses: 5.5 }],
    ["厚さ99mmは規格外なので拒否", { thicknessMm: 99 }],
    ["厚さ201mmは規格外なので拒否", { thicknessMm: 201 }],
    ["基礎立上りが負は拒否", { footingRiseMm: -1 }],
    ["笠木が負は拒否", { copingMm: -1 }],
    ["鉄筋径0は拒否", { rebarDiaMm: 0 }],
    ["縦筋間隔0は拒否", { vSpacingMm: 0 }],
    ["横筋間隔が1段未満は拒否", { hSpacingMm: 199 }],
    ["基礎の丈0は拒否", { footingDepthMm: 0 }],
    ["根入れが負は拒否", { footingEmbedMm: -1 }],
    ["ロス率が負は拒否", { lossPercent: -1 }],
    ["未知の基礎形状は拒否", { footingType: "T" }],
    ["長さが数値でないのは拒否", { lengthMm: NaN }],
  ];
  for (const [name, over] of bad) {
    const res = calc(over);
    t.push(eq(name, [res.ok, res.errors.length > 0], [false, true]));
  }
  t.push(eq("厚さ100mm・200mmは境界として受け付ける",
    [calc({ thicknessMm: 100 }).ok, calc({ thicknessMm: 200 }).ok], [true, true]));
  t.push(eq("横筋間隔200mm（1段）は受け付ける", calc({ hSpacingMm: 200 }).ok, true));

  return t;
}
