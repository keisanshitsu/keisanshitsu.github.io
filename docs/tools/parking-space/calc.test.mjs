// 駐車スペースの寸法と台数のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 一次情報由来の定数（指針 表-2.4.1・表-2.4.2、施行規則 別表第一）
//   (2) 並列は幅を足して奥行は最大、縦列は奥行を足して幅は最大
//   (3) 「ちょうど」で収まり、1cm 足りないと収まらない（幅・奥行・天井それぞれ）
//   (4) 車庫証明の目安（車体・隙間0）と指針の枠は別物で、前者が収まっても後者は収まらないことがある
//   (5) 区分の上限を超える寸法はエラー（軽・小型）。普通自動車には上限を課さない
//   (6) 指針の枠を格子に並べた台数（記事でよく使われる 5.0m×6.0m に普通車2台）

import { GUIDE, CLASS_MAX, CLASS_LABEL, footprint, gridCount, withinClass, calculate } from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

// 1台目: 5ナンバーの上限いっぱい、2台目: 軽の上限いっぱい
const SMALL = { cls: "small", lengthCm: 470, widthCm: 170, heightCm: 200 };
const KEI = { cls: "kei", lengthCm: 340, widthCm: 148, heightCm: 200 };
const NORMAL = { cls: "normal", lengthCm: 480, widthCm: 185, heightCm: 170 };
const BASE = { spaceWidthCm: 500, spaceDepthCm: 600, ceilingCm: "", layout: "parallel", cars: [SMALL, KEI] };
const calc = (over) => calculate({ ...BASE, ...over });

export default function cases() {
  const t = [];

  // ── (1) 定数 ──────────────────────────────────────
  t.push(eq("指針 表-2.4.1 軽 3.6×2.0", [GUIDE.kei.lengthCm, GUIDE.kei.widthCm], [360, 200]));
  t.push(eq("指針 表-2.4.1 小型乗用車 5.0×2.3", [GUIDE.small.lengthCm, GUIDE.small.widthCm], [500, 230]));
  t.push(eq("指針 表-2.4.1 普通乗用車 6.0×2.5", [GUIDE.normal.lengthCm, GUIDE.normal.widthCm], [600, 250]));
  t.push(eq("指針 表-2.4.2 車室 2.1/2.1/2.2", [GUIDE.kei.ceilingCm, GUIDE.small.ceilingCm, GUIDE.normal.ceilingCm], [210, 210, 220]));
  t.push(eq("別表第一 軽 3.40/1.48/2.00", CLASS_MAX.kei, { lengthCm: 340, widthCm: 148, heightCm: 200 }));
  t.push(eq("別表第一 小型 4.70/1.70/2.00", CLASS_MAX.small, { lengthCm: 470, widthCm: 170, heightCm: 200 }));
  t.push(eq("普通自動車は上限なし", CLASS_MAX.normal, null));
  t.push(eq("種別名は別表第一の呼び方", CLASS_LABEL.small, "小型自動車"));

  // ── (2) 並べ方 ────────────────────────────────────
  const two = [{ widthCm: 170, lengthCm: 470 }, { widthCm: 148, lengthCm: 340 }];
  t.push(eq("並列: 幅は合計・奥行は最大", footprint(two, "parallel"), { widthCm: 318, depthCm: 470 }));
  t.push(eq("縦列: 幅は最大・奥行は合計", footprint(two, "series"), { widthCm: 170, depthCm: 810 }));
  t.push(eq("1台なら並列も縦列も同じ",
    footprint([two[0]], "parallel"), footprint([two[0]], "series")));

  // ── (3) 境界: ちょうどで収まり、1cm 足りないと収まらない ──
  // 車体: 並列で 170+148=318 × 470
  t.push(eq("車体 幅ちょうど 318cm で収まる", calc({ spaceWidthCm: 318, spaceDepthCm: 470 }).garage.fits, true));
  t.push(eq("車体 幅 317cm で収まらない", calc({ spaceWidthCm: 317, spaceDepthCm: 470 }).garage.fits, false));
  t.push(eq("車体 奥行 469cm で収まらない", calc({ spaceWidthCm: 318, spaceDepthCm: 469 }).garage.fits, false));
  // 指針: 並列で 230+200=430 × 500
  t.push(eq("指針 幅ちょうど 430cm で収まる", calc({ spaceWidthCm: 430, spaceDepthCm: 500 }).guide.fits, true));
  t.push(eq("指針 幅 429cm で収まらない", calc({ spaceWidthCm: 429, spaceDepthCm: 500 }).guide.fits, false));
  t.push(eq("指針 奥行 499cm で収まらない", calc({ spaceWidthCm: 430, spaceDepthCm: 499 }).guide.fits, false));
  // 縦列: 車体 170 × 810、指針 230 × 860
  t.push(eq("縦列 車体 810cm ちょうど",
    [calc({ layout: "series", spaceWidthCm: 170, spaceDepthCm: 810 }).garage.fits,
     calc({ layout: "series", spaceWidthCm: 170, spaceDepthCm: 809 }).garage.fits], [true, false]));
  t.push(eq("縦列 指針 230×860 ちょうど",
    [calc({ layout: "series", spaceWidthCm: 230, spaceDepthCm: 860 }).guide.fits,
     calc({ layout: "series", spaceWidthCm: 229, spaceDepthCm: 860 }).guide.fits], [true, false]));
  // 天井: 車体は全高の最大 200、指針は 2.1m（軽・小型）
  t.push(eq("天井 200cm: 車体は収まり、指針 2.1m には足りない",
    [calc({ ceilingCm: 200 }).garage.fits, calc({ ceilingCm: 200 }).guide.fits], [true, false]));
  t.push(eq("天井 199cm: 車体も収まらない", calc({ ceilingCm: 199 }).garage.fits, false));
  t.push(eq("天井 210cm: 指針も収まる", calc({ ceilingCm: 210 }).guide.fits, true));
  t.push(eq("普通車がいると指針の天井は 2.2m",
    [calc({ cars: [NORMAL], ceilingCm: 219 }).guide.fits, calc({ cars: [NORMAL], ceilingCm: 220 }).guide.fits], [false, true]));
  // 欠陥注入（max→min）で素通りしたので追加（2026-10-20）: 区分が混ざるときは高いほうの 2.2m で判定する
  t.push(eq("軽+普通の混在: 指針の天井は高いほう 2.2m",
    [calc({ cars: [KEI, NORMAL], ceilingCm: 219, spaceWidthCm: 450 }).guide.fits,
     calc({ cars: [KEI, NORMAL], ceilingCm: 220, spaceWidthCm: 450 }).guide.fits], [false, true]));
  t.push(eq("屋根なしなら天井は判定しない", calc({ ceilingCm: "" }).garage.spareHeightCm, null));
  t.push(eq("屋根ありで全高が空ならエラー",
    calc({ ceilingCm: 230, cars: [{ ...SMALL, heightCm: "" }] }).ok, false));

  // ── (4) 車体は収まるが指針の枠には足りない ─────────
  const r = calc({});
  t.push(eq("5.0×6.0m に小型+軽 並列: 車体の余り 幅182・奥行130", [r.garage.spareWidthCm, r.garage.spareDepthCm], [182, 130]));
  t.push(eq("同: 指針の余り 幅70・奥行100", [r.guide.spareWidthCm, r.guide.spareDepthCm], [70, 100]));
  const tight = calc({ spaceWidthCm: 400, spaceDepthCm: 500 });
  t.push(eq("4.0×5.0m: 車体は収まるが指針は幅が30cm足りない",
    [tight.garage.fits, tight.guide.fits, tight.guide.spareWidthCm], [true, false, -30]));
  t.push(eq("車ごと: 枠の中で両脇に残る幅（小型 230−170=60・軽 200−148=52）",
    r.perCar.map((c) => c.sideSpareCm), [60, 52]));
  t.push(eq("車ごと: 枠の中で前後に残る長さ（500−470=30・360−340=20）",
    r.perCar.map((c) => c.endSpareCm), [30, 20]));

  // ── (5) 区分の上限 ────────────────────────────────
  t.push(eq("軽の上限ちょうどはOK", withinClass("kei", { lengthCm: 340, widthCm: 148, heightCm: 200 }), true));
  t.push(eq("軽で幅 149cm は区分外", withinClass("kei", { lengthCm: 340, widthCm: 149, heightCm: 200 }), false));
  t.push(eq("小型で長さ 471cm は区分外", withinClass("small", { lengthCm: 471, widthCm: 170, heightCm: 200 }), false));
  t.push(eq("小型で高さ 201cm は区分外", withinClass("small", { lengthCm: 470, widthCm: 170, heightCm: 201 }), false));
  t.push(eq("高さ未入力なら長さ・幅だけで見る", withinClass("small", { lengthCm: 470, widthCm: 170, heightCm: null }), true));
  t.push(eq("普通車は大きくてもOK", withinClass("normal", { lengthCm: 520, widthCm: 199, heightCm: 190 }), true));
  t.push(eq("区分外の寸法は計算しない", calc({ cars: [{ ...KEI, widthCm: 160 }] }).ok, false));

  // ── (6) 何台入るか ────────────────────────────────
  t.push(eq("5.0×6.0m に普通車の枠は 2×1＝2台", calc({}).capacity.normal, { across: 2, deep: 1, total: 2, ceilingOk: null }));
  t.push(eq("4.99m 幅なら普通車は1台", calc({ spaceWidthCm: 499 }).capacity.normal.total, 1));
  t.push(eq("5.0×6.0m に軽の枠は 2×1＝2台（奥行 7.2m 未満）", calc({}).capacity.kei.total, 2));
  t.push(eq("6.0×7.2m に軽の枠は 3×2＝6台", calc({ spaceWidthCm: 600, spaceDepthCm: 720 }).capacity.kei.total, 6));
  t.push(eq("格子: 境界ちょうど", gridCount(460, 500, 230, 500), { across: 2, deep: 1, total: 2 }));
  t.push(eq("格子: 入らなければ 0", gridCount(229, 500, 230, 500).total, 0));
  t.push(eq("屋根 2.15m: 軽・小型の枠は天井OK、普通は不足",
    [calc({ ceilingCm: 215 }).capacity.kei.ceilingOk, calc({ ceilingCm: 215 }).capacity.small.ceilingOk,
     calc({ ceilingCm: 215 }).capacity.normal.ceilingOk], [true, true, false]));

  // ── 単調性: スペースを広げて収まらなくなることはない ──
  let mono = true;
  for (let w = 300; w <= 600; w += 7) for (let d = 400; d <= 900; d += 11) {
    const a = calc({ spaceWidthCm: w, spaceDepthCm: d });
    const b = calc({ spaceWidthCm: w + 1, spaceDepthCm: d + 1 });
    if ((a.garage.fits && !b.garage.fits) || (a.guide.fits && !b.guide.fits)) mono = false;
    if (a.guide.fits && !a.garage.fits) mono = false; // 指針の枠は車体より常に大きいので、指針が収まれば車体も収まる
  }
  t.push(eq("単調性と包含（指針が収まれば車体も収まる）", mono, true));

  // ── 入力検査 ──────────────────────────────────────
  t.push(eq("車0台はエラー", calc({ cars: [] }).ok, false));
  t.push(eq("車4台はエラー", calc({ cars: [SMALL, SMALL, KEI, KEI] }).ok, false));
  t.push(eq("区分なしはエラー", calc({ cars: [{ ...SMALL, cls: "" }] }).ok, false));
  t.push(eq("空の間口はエラー", calc({ spaceWidthCm: "" }).ok, false));
  t.push(eq("間口 99cm はエラー", calc({ spaceWidthCm: 99 }).ok, false));
  t.push(eq("3台並列 普通×3 は幅 7.5m で指針ちょうど",
    calc({ cars: [NORMAL, NORMAL, NORMAL], spaceWidthCm: 750, spaceDepthCm: 600 }).guide.fits, true));

  return t;
}
