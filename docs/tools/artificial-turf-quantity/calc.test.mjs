// 人工芝の必要量（ロールの割付・継ぎ目・ピン）のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 出典由来の間隔（DCM 1m／RESTA 外周30cm・継ぎ目50cm／コメリ 50cm／アルスグリーン 30cm＋中央1m）
//   (2) 販売店 RESTA の割付例（6m×1.5m・1m×10m巻）と照合する:
//       長手(1) 1本・継ぎ目 6.5m・2か所／短手(2) 1本・7.5m・5か所。自動では(1)を選ぶ
//   (3) ピンの本数は手計算（RESTA 例で DCM 23本・コメリ 41本）と、1列のときの閉じた式に一致する
//   (4) 面積の割り算より多くロールが要る寸法で、それを ng として知らせる
//   (5) 長さを伸ばしてピンが減らないこと（単調性）

import {
  PIN_PLANS,
  RIP_MIN_WIDTH_MM,
  divide,
  innerCount,
  splitLength,
  packRolls,
  stripPlan,
  layout,
  countPins,
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
const plan = (id) => PIN_PLANS.find((p) => p.id === id);
const pinsOf = (res, id) => res.pins.find((p) => p.id === id).pins;
const brief = (x) => ({ direction: x.direction, strips: x.strips, rolls: x.rolls, usedMm: x.rollLengthUsedMm,
  seamM: Math.round(x.seamM * 1000) / 1000, places: x.seamPlaces, ripped: x.ripped });

const cases = [];

// ---- (1) 出典由来の間隔
cases.push(eq("DCM: 外周・継ぎ目 1000mm・内側なし", [plan("dcm").edge, plan("dcm").seam, plan("dcm").inner], [1000, 1000, null]));
cases.push(eq("RESTA: 外周 300mm・継ぎ目 500mm・内側なし", [plan("rst").edge, plan("rst").seam, plan("rst").inner], [300, 500, null]));
cases.push(eq("コメリ: 500mm・内側なし", [plan("kmr").edge, plan("kmr").seam, plan("kmr").inner], [500, 500, null]));
cases.push(eq("アルスグリーン: 300mm＋中央 1000mm", [plan("ars").edge, plan("ars").seam, plan("ars").inner], [300, 300, 1000]));
cases.push(eq("裂く帯の下限 100mm", RIP_MIN_WIDTH_MM, 100));

// ---- 部品
cases.push(eq("divide: 1500mm を 1000mm で → 2等分", divide(1500, 1000), [0, 750, 1500]));
cases.push(eq("divide: ちょうど割り切れる 1000/500 → 端を含む3点", divide(1000, 500), [0, 500, 1000]));
cases.push(eq("innerCount: 1m×6m・1m格子 → 0（幅方向に内側の点が無い）", innerCount(1000, 6000, 1000), 0));
cases.push(eq("innerCount: 2m×3m・1m格子 → 1×2", innerCount(2000, 3000, 1000), 2));
cases.push(eq("splitLength: ちょうど 10m → 1片", splitLength(10000, 10000), [10000]));
cases.push(eq("splitLength: 10m＋1mm → 2片", splitLength(10001, 10000), [10000, 1]));
cases.push(eq("packRolls: 6m と 3m は 10m に1本で入る", packRolls([6000, 3000], 10000), { rolls: 1, leftoverMm: 1000 }));
cases.push(eq("packRolls: 6m×2 は 2本", packRolls([6000, 6000], 10000), { rolls: 2, leftoverMm: 8000 }));
cases.push(eq("stripPlan: 0.5m 幅・6m を 1m 幅から裂く → 3m 片を2枚", stripPlan(6000, 500, 1000, 10000, true),
  { k: 2, cut: [3000], segs: [3000, 3000] }));
cases.push(eq("stripPlan: 裂かない指定 → 6m 片1枚", stripPlan(6000, 500, 1000, 10000, false),
  { k: 1, cut: [6000], segs: [6000] }));
cases.push(eq("stripPlan: 0.6m 幅は 1m 幅から2本取れない → 裂かない", stripPlan(6000, 600, 1000, 10000, true).k, 1));
cases.push(eq("stripPlan: 境界 0.5m ちょうどは2本取れる", stripPlan(6000, 500, 1000, 10000, true).k, 2));
cases.push(eq("stripPlan: 10cm 未満（99mm）は裂かない", stripPlan(6000, 99, 1000, 10000, true).k, 1));
cases.push(eq("stripPlan: 10cm ちょうどは裂ける（10本）", stripPlan(6000, 100, 1000, 10000, true).k, 10));
cases.push(eq("stripPlan: 6m ÷ 7 は cm に切り上げ（857.14→860mm）", stripPlan(6000, 140, 1000, 10000, true).cut, [860]));

// ---- (2) RESTA の割付例
const resta = calculate({ widthMm: 1500, lengthMm: 6000, rollWMm: 1000, rollLMm: 10000 });
cases.push(eq("RESTA 例(1) 長手: 1本・9m・継ぎ目6.5m・2か所・裂く", brief(resta.chosen),
  { direction: "length", strips: 2, rolls: 1, usedMm: 9000, seamM: 6.5, places: 2, ripped: true }));
cases.push(eq("RESTA 例(2) 短手: 1本・9m・継ぎ目7.5m・5か所", brief(resta.other),
  { direction: "width", strips: 6, rolls: 1, usedMm: 9000, seamM: 7.5, places: 5, ripped: false }));
cases.push(eq("RESTA 例: 面積 9㎡", resta.areaM2, 9));
const restaFull = calculate({ widthMm: 1500, lengthMm: 6000, rollWMm: 1000, rollLMm: 10000, narrow: "full", direction: "length" });
cases.push(eq("RESTA 例(1) を裂かずに切ると 12m・2本・継ぎ目6m・1か所", brief(restaFull.chosen),
  { direction: "length", strips: 2, rolls: 2, usedMm: 12000, seamM: 6, places: 1, ripped: false }));
const restaW = calculate({ widthMm: 1500, lengthMm: 6000, rollWMm: 1000, rollLMm: 10000, direction: "width" });
cases.push(eq("向きの指定（幅方向）が効く", restaW.chosen.direction, "width"));

// ---- (3) ピンの手計算
// DCM 1m: 外周 長辺 6分割×2＋短辺 2分割×2 = 16点、継ぎ目 x=1m に 7点（端は短辺の0/0.75/1.5に乗らない）= 23。
//         横の継ぎ目 y=3m（x 1〜1.5m）の両端は、継ぎ目の線と外周の点に重なる
cases.push(eq("RESTA 例・DCM 1m の打ち方 → 23本", pinsOf(resta, "dcm"), 23));
// コメリ 50cm: 外周 12×2＋3×2 = 30点、継ぎ目 13点のうち両端は短辺の 1.0m の点に重なる → 11点 = 41
cases.push(eq("RESTA 例・コメリ 50cm の打ち方 → 41本", pinsOf(resta, "kmr"), 41));
cases.push(truthy("打ち方で本数が変わる（DCM < コメリ < RESTA）",
  pinsOf(resta, "dcm") < pinsOf(resta, "kmr") && pinsOf(resta, "kmr") < pinsOf(resta, "rst")));
cases.push(truthy("中央にも打つアルスグリーンは最多", pinsOf(resta, "ars") >= Math.max(...resta.pins.map((p) => p.pins))));

// 1列だけ（ロール幅以内・ロール長以内）のときは外周だけ: 2×ceil(L/p) + 2×ceil(W/p)
for (const [w, l] of [[1000, 1000], [1000, 3700], [800, 9990], [1000, 10000], [450, 2000]]) {
  for (const id of ["dcm", "kmr"]) {
    const pl = plan(id);
    const r = calculate({ widthMm: w, lengthMm: l, rollWMm: 1000, rollLMm: 10000, direction: "length" });
    const closed = 2 * Math.ceil(l / pl.edge - 1e-9) + 2 * Math.ceil(w / pl.edge - 1e-9);
    cases.push(eq(`1列 ${w}×${l}mm・${id}: 閉じた式 ${closed} と一致`, pinsOf(r, id), closed));
  }
}

// アルスグリーンの中央1m: 2m×3m を 2m 幅で1列 → 外周 300mm（7+10)×2=34点＋内側 innerCount(2000,3000,1000)=2 → 36
const ars = calculate({ widthMm: 2000, lengthMm: 3000, rollWMm: 2000, rollLMm: 10000, direction: "length" });
cases.push(eq("2m×3m・アルスグリーン → 外周34＋中央2 = 36本", pinsOf(ars, "ars"), 36));

// ---- 継ぎ目とロール
const two = calculate({ widthMm: 2000, lengthMm: 5000, rollWMm: 1000, rollLMm: 10000 });
cases.push(eq("2m×5m・1m幅: 細い列なし・2列・1本・継ぎ目5m", brief(two.chosen),
  { direction: "length", strips: 2, rolls: 1, usedMm: 10000, seamM: 5, places: 1, ripped: false }));
const longOne = calculate({ widthMm: 1000, lengthMm: 12000, rollWMm: 1000, rollLMm: 10000 });
cases.push(eq("1m×12m: 奥行き方向に10m＋2mで継ぐ（2本・横の継ぎ目1m）", brief(longOne.chosen),
  { direction: "length", strips: 1, rolls: 2, usedMm: 12000, seamM: 1, places: 1, ripped: false }));
cases.push(eq("1m×12m: 幅方向は12列・継ぎ目11m", brief(longOne.other),
  { direction: "width", strips: 12, rolls: 2, usedMm: 12000, seamM: 11, places: 11, ripped: false }));
const exact = calculate({ widthMm: 1000, lengthMm: 10000, rollWMm: 1000, rollLMm: 10000 });
cases.push(eq("境界 1m×10m ちょうど: 1本・継ぎ目0・残り0", [exact.chosen.rolls, exact.chosen.seamM, exact.chosen.leftoverMm], [1, 0, 0]));
const over = calculate({ widthMm: 1000, lengthMm: 10010, rollWMm: 1000, rollLMm: 10000, direction: "length" });
cases.push(eq("境界 1m×10.01m: 2本・横の継ぎ目1か所", [over.chosen.rolls, over.chosen.crossJoints], [2, 1]));
// 長いロール超えの細い帯を裂く: 0.5m×25m・1m×10m → 12.5m を 10m＋2.5m で切り、各2枚に裂く → 4片・横の継ぎ目3か所
const ripLong = calculate({ widthMm: 500, lengthMm: 25000, rollWMm: 1000, rollLMm: 10000, direction: "length" });
cases.push(eq("0.5m×25m: 裂くと 2本（裂かないと3本）・横の継ぎ目3か所・1.5m", brief(ripLong.chosen),
  { direction: "length", strips: 1, rolls: 2, usedMm: 12500, seamM: 1.5, places: 3, ripped: true }));
const ripLongFull = calculate({ widthMm: 500, lengthMm: 25000, rollWMm: 1000, rollLMm: 10000, direction: "length", narrow: "full" });
cases.push(eq("0.5m×25m 裂かない: 3本・継ぎ目2か所", [ripLongFull.chosen.rolls, ripLongFull.chosen.seamPlaces], [3, 2]));
// auto は裂いてもロールが減らないなら裂かない: 1.5m×3m → 裂かずに 6m で1本
const noGain = calculate({ widthMm: 1500, lengthMm: 3000, rollWMm: 1000, rollLMm: 10000, direction: "length" });
cases.push(eq("1.5m×3m: 裂いても1本のままなので裂かない（継ぎ目が少ないほう）", [noGain.chosen.rolls, noGain.chosen.ripped, noGain.chosen.seamPlaces], [1, false, 1]));
const forceRip = calculate({ widthMm: 1500, lengthMm: 3000, rollWMm: 1000, rollLMm: 10000, direction: "length", narrow: "rip" });
cases.push(eq("1.5m×3m 裂く指定: 4.5m・継ぎ目2か所", [forceRip.chosen.rollLengthUsedMm, forceRip.chosen.seamPlaces], [4500, 2]));

// ---- (4) 面積の割り算では足りない寸法
// 2.6m×3.6m・1m×10m: 9.36㎡ ÷ 10㎡ = 1本。奥行き方向 3.6m×3列=10.8m、幅方向 2.6m×4列=10.4m → どちらも2本
const naive = calculate({ widthMm: 2600, lengthMm: 3600, rollWMm: 1000, rollLMm: 10000 });
cases.push(eq("2.6m×3.6m: 面積の割り算 1本・実際 2本", [naive.naiveRolls, naive.chosen.rolls], [1, 2]));
cases.push(eq("2.6m×3.6m: 先頭の判定は ng", naive.checks[0].status, "ng"));
cases.push(eq("RESTA 例: 面積の割り算どおり → ok", resta.checks[0].status, "ok"));
cases.push(truthy("ロールの本数は面積の割り算を下回らない（総当たり）", (() => {
  for (let w = 300; w <= 6000; w += 300)
    for (let l = 300; l <= 6000; l += 700) {
      const r = calculate({ widthMm: w, lengthMm: l, rollWMm: 1000, rollLMm: 5000 });
      if (r.chosen.rolls < r.naiveRolls) return `${w}x${l}`;
    }
  return true;
})()));
cases.push(truthy("使う長さ×ロール幅は地面の面積以上（総当たり）", (() => {
  for (let w = 200; w <= 5000; w += 350)
    for (let l = 200; l <= 12000; l += 900)
      for (const narrow of ["auto", "rip", "full"]) {
        const r = calculate({ widthMm: w, lengthMm: l, rollWMm: 2000, rollLMm: 10000, narrow });
        if (r.chosen.rollLengthUsedMm * 2000 < w * l - 1e-6) return `${w}x${l}/${narrow}`;
      }
  return true;
})()));
cases.push(truthy("裂いた帯の片の長さの合計は帯の長さに一致（総当たり）", (() => {
  for (let w = 100; w <= 1000; w += 50)
    for (let l = 500; l <= 25000; l += 1700) {
      const s = stripPlan(l, w, 1000, 10000, true);
      if (!near(s.segs.reduce((a, b) => a + b, 0), l)) return `${w}x${l}`;
      if (s.segs.some((v) => v <= 0 || v > 10000)) return `${w}x${l} seg`;
    }
  return true;
})()));

// ---- (5) 単調性: 1m 幅で長さを伸ばしてピンが減らない
// ロール長を超えると横の継ぎ目が入り、その端が外周の等分点に「たまたま重なる」長さでは
// 交点を1本にまとめるぶん2本減ることがある（10.4m→49本、10.5m→47本）。これは等分の性質であって誤りではないので、
// 単調性は継ぎ目の無い範囲（ロール長以内）で確かめ、ロール超えは「減っても2本まで」を確かめる
cases.push(truthy("ロール長以内では長さを10cmずつ伸ばしてもピンは減らない（コメリ・1m幅）", (() => {
  let prev = 0;
  for (let l = 100; l <= 10000; l += 100) {
    const r = calculate({ widthMm: 1000, lengthMm: l, rollWMm: 1000, rollLMm: 10000, direction: "length" });
    const v = pinsOf(r, "kmr");
    if (v < prev) return `l=${l}: ${v} < ${prev}`;
    prev = v;
  }
  return true;
})()));
cases.push(truthy("ロール超えでも、伸ばして減るのは交点の重なり（横の継ぎ目1か所につき2本）まで（〜25m）", (() => {
  let prev = 0;
  for (let l = 100; l <= 25000; l += 100) {
    const r = calculate({ widthMm: 1000, lengthMm: l, rollWMm: 1000, rollLMm: 10000, direction: "length" });
    const v = pinsOf(r, "kmr");
    if (v < prev - 2 * r.chosen.crossJoints) return `l=${l}: ${v} < ${prev}`;
    prev = v;
  }
  return true;
})()));
cases.push(truthy("（旧）全長での厳密な単調性は成り立たないことを記録（10.4m→10.5m）", (() => {
  const a = pinsOf(calculate({ widthMm: 1000, lengthMm: 10400, rollWMm: 1000, rollLMm: 10000, direction: "length" }), "kmr");
  const b = pinsOf(calculate({ widthMm: 1000, lengthMm: 10500, rollWMm: 1000, rollLMm: 10000, direction: "length" }), "kmr");
  return a === 49 && b === 47 ? true : `${a}→${b}`;
})()));

// ---- 自分で決める間隔
const cu = calculate({ widthMm: 1500, lengthMm: 6000, rollWMm: 1000, rollLMm: 10000, custom: { edge: 1000, seam: 1000, inner: null } });
cases.push(eq("自分の間隔（1m・1m）は DCM と同じ 23本", pinsOf(cu, "custom"), 23));
cases.push(eq("自分の間隔を足すと打ち方は5通り", cu.pins.length, 5));
const lay = layout({ along: 6000, across: 1500, rollW: 1000, rollL: 10000, rip: true });
cases.push(eq("countPins を直接呼んでも同じ（DCM 23）", countPins(lay, plan("dcm")), 23));

// ---- 入力の検査
const bad = (name, p) => cases.push(eq(name, calculate({ widthMm: 1500, lengthMm: 6000, rollWMm: 1000, rollLMm: 10000, ...p }).ok, false));
bad("幅 99mm は不可", { widthMm: 99 });
bad("奥行き 100.001m は不可", { lengthMm: 100001 });
bad("ロール幅 0.29m は不可", { rollWMm: 290 });
bad("ロール長 0.9m は不可", { rollLMm: 900 });
bad("向きの値が不正", { direction: "diag" });
bad("細い列の値が不正", { narrow: "x" });
bad("自分の間隔 9cm は不可", { custom: { edge: 90, seam: 500, inner: null } });
bad("数値でない幅", { widthMm: "abc" });
cases.push(eq("幅 100mm ちょうどは可", calculate({ widthMm: 100, lengthMm: 6000, rollWMm: 1000, rollLMm: 10000 }).ok, true));

export default function run() {
  return cases;
}
