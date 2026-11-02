// 24時間換気の必要換気量のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 条文由来の定数（令20条の8 のｎ 0.5／0.3、令21条の 2.1m）
//   (2) Vr＝ｎＡｈ の値（手計算と一致）と、表示の切り上げ（必要量を小さく見せない）
//   (3) 二以上の居室の合計（令20条の8 イ（２））は、部屋ごとに丸めた値の和ではなく厳密な和で判定すること
//   (4) 換気設備の判定: 必要量ちょうどは足りる・0.1㎥/h 少ないと足りない
//   (5) 浮動小数の罠（0.1＋0.2 型）で判定が反転しないこと
//   (6) 入力の検証（空行の無視・範囲外）

import {
  N10,
  CEILING_MIN_CM,
  areaC,
  heightCm,
  vrUnits,
  ceilTenth,
  airChanges,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

const one = (area, height, kind = "house", fan) =>
  calculate({ rooms: [{ area, height, kind }], fanM3h: fan });

export default function cases() {
  const t = [];

  // ── (1) 定数 ─────────────────────────
  t.push(eq("住宅等の居室 ｎ＝0.5（令20条の8 第1項第1号イ（１））", N10.house, 5));
  t.push(eq("その他の居室 ｎ＝0.3（同）", N10.other, 3));
  t.push(eq("居室の天井高 2.1m 以上（令21条1項）", CEILING_MIN_CM, 210));

  // ── (2) Vr＝ｎＡｈ ─────────────────────────
  t.push(eq("LDK 20㎡×2.4m・住宅 → 24㎥/h", one(20, 2.4).totalVr, 24));
  t.push(eq("同じ部屋・その他の居室 → 14.4㎥/h", one(20, 2.4, "other").totalVr, 14.4));
  t.push(eq("6畳相当 9.72㎡×2.4m・住宅 → 11.664 を切り上げて 11.7", one(9.72, 2.4).totalVr, 11.7));
  t.push(eq("10.01㎡×2.45m・住宅 → 12.26225 を切り上げて 12.3", one(10.01, 2.45).totalVr, 12.3));
  t.push(eq("3.33㎡×2.5m・その他 → 2.4975 を切り上げて 2.5", one(3.33, 2.5, "other").totalVr, 2.5));
  t.push(eq("割り切れる値は切り上げない（10㎡×2.0m×0.5＝10.0）", one(10, 2.0).totalVr, 10));
  t.push(eq("内部単位: 20㎡×2.4m×0.5＝24㎥/h＝2,400,000", vrUnits("house", areaC(20), heightCm(2.4)), 2400000));
  t.push(eq("ceilTenth: 1単位でも超えたら 0.1 上げる", ceilTenth(2400001), 24.1));
  t.push(eq("ceilTenth: ちょうどは据え置き", ceilTenth(2400000), 24));
  t.push(eq("容積の合計 20㎡×2.4m＝48㎥", one(20, 2.4).totalVolume, 48));

  // ── (3) 二以上の居室の合計 ─────────────────────────
  // 9.72㎡×2.4m（11.664）を2部屋 → 厳密な和 23.328 → 表示 23.4。部屋ごとの表示の和は 11.7×2＝23.4（一致）
  // 3部屋の 0.05 ずつの端数で差が出る例: 1.01㎡×2.1m×0.5＝1.0605 → 表示1.1。3部屋で厳密 3.1815 → 3.2、表示の和は 3.3
  const three = calculate({
    rooms: [1, 2, 3].map(() => ({ area: 1.01, height: 2.1, kind: "house" })),
    fanM3h: 3.2,
  });
  t.push(eq("3部屋の合計は厳密な和の切り上げ（3.1815 → 3.2）", three.totalVr, 3.2));
  t.push(eq("各部屋の表示は 1.1（切り上げ）", three.rooms.map((r) => r.vr), [1.1, 1.1, 1.1]));
  t.push(eq("有効換気量 3.2 は合計 3.1815 以上なので足りる（表示の和 3.3 で判定しない）", three.fan.enough, true));
  const three2 = calculate({
    rooms: [1, 2, 3].map(() => ({ area: 1.01, height: 2.1, kind: "house" })),
    fanM3h: 3.1,
  });
  t.push(eq("3.1 は 3.1815 に足りない", three2.fan.enough, false));
  t.push(eq("不足分は 0.0815 を切り上げて 0.1", three2.fan.shortfall, 0.1));

  // 住宅と住宅以外の混在
  const mixed = calculate({
    rooms: [
      { name: "LDK", area: 20, height: 2.4, kind: "house" },
      { name: "事務室", area: 20, height: 2.4, kind: "other" },
    ],
    fanM3h: 38.4,
  });
  t.push(eq("混在 24＋14.4＝38.4", mixed.totalVr, 38.4));
  t.push(eq("混在で 38.4 ちょうどは足りる", mixed.fan.enough, true));
  t.push(eq("部屋名は入力どおり", mixed.rooms.map((r) => r.name), ["LDK", "事務室"]));

  // ── (4) 換気設備の判定の境界 ─────────────────────────
  t.push(eq("24.0㎥/h（必要量ちょうど）は足りる", one(20, 2.4, "house", 24).fan.enough, true));
  t.push(eq("23.9㎥/h は足りない", one(20, 2.4, "house", 23.9).fan.enough, false));
  t.push(eq("23.9㎥/h の不足は 0.1", one(20, 2.4, "house", 23.9).fan.shortfall, 0.1));
  t.push(eq("換気回数 24/48＝0.50", one(20, 2.4, "house", 24).fan.airChanges, 0.5));
  t.push(eq("換気回数 23.9/48＝0.4979 は切り捨てて 0.49", one(20, 2.4, "house", 23.9).fan.airChanges, 0.49));
  t.push(eq("換気回数 airChanges(240, 480000)＝0.5", airChanges(240, 480000), 0.5));
  t.push(eq("換気設備が空欄なら判定しない", one(20, 2.4).fan, null));

  // ── (5) 浮動小数 ─────────────────────────
  // 0.1+0.2 型: 面積 0.3㎡ を 0.1+0.2 で渡しても 30 に丸まる
  t.push(eq("面積 0.1+0.2 → 0.30㎡", areaC(0.1 + 0.2), 30));
  t.push(eq("天井高 2.4 → 240cm", heightCm(2.4), 240));
  t.push(eq("天井高 2.3 → 230cm（2.3×100＝229.99… を切り捨てない）", heightCm(2.3), 230));
  t.push(eq("面積 4.35 → 435（4.35×100＝434.99… を切り捨てない）", areaC(4.35), 435));
  t.push(eq("10.02㎡×2.4m・住宅 → 12.024 は四捨五入なら 12.0 だが切り上げて 12.1", one(10.02, 2.4).totalVr, 12.1));
  // 33.3㎡×2.4m×0.5＝39.96。浮動小数で直接掛けると 39.959999… になりうる
  t.push(eq("33.3㎡×2.4m・住宅 → 39.96 → 表示 40.0", one(33.3, 2.4).totalVr, 40));
  t.push(eq("33.3㎡×2.4m に 39.96 は足りる", one(33.3, 2.4, "house", 39.96).fan.enough, true));
  t.push(eq("33.3㎡×2.4m に 39.9 は足りない", one(33.3, 2.4, "house", 39.9).fan.enough, false));

  // ── (6) 入力の検証・注意 ─────────────────────────
  t.push(eq("天井 2.09m は令21条の注意を付ける", one(10, 2.09).rooms[0].lowCeiling, true));
  t.push(eq("天井 2.10m は注意しない", one(10, 2.1).rooms[0].lowCeiling, false));
  t.push(eq("空行は無視", calculate({ rooms: [{ area: 20, height: 2.4 }, { area: "", height: "" }] }).rooms.length, 1));
  t.push(eq("全部空ならエラー", calculate({ rooms: [{ area: "", height: "" }] }).ok, false));
  t.push(eq("床面積 0 はエラー", one(0, 2.4).ok, false));
  t.push(eq("床面積が負はエラー", one(-5, 2.4).ok, false));
  t.push(eq("天井 0.5m はエラー", one(10, 0.5).ok, false));
  t.push(eq("床面積だけで天井が空はエラー", calculate({ rooms: [{ area: 10, height: "" }] }).ok, false));
  t.push(eq("換気量 0 はエラー", one(10, 2.4, "house", 0).ok, false));
  t.push(eq("種別の既定は住宅等の居室", calculate({ rooms: [{ area: 20, height: 2.4 }] }).totalVr, 24));
  t.push(eq("名前が空なら『部屋1』", calculate({ rooms: [{ name: " ", area: 20, height: 2.4 }] }).rooms[0].name, "部屋1"));

  return t;
}
