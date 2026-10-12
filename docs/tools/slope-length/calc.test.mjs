// スロープの長さ・踊場・幅のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 条文由来の定数（1/8・1/12・1/15・16cm・75cm・150cm・1/20・幅 120/90・150/120・令25条の1m）
//   (2) 勾配の切り替わり（16cm ちょうど／1mm 超え）、踊場の数（75cm・150cm ちょうど／1mm 超え）、
//       敷地内の通路の「1/20 を超えるものに限る」（1/20 ちょうどは踊場不要）
//   (3) 解説記事で広く引かれる例（段差30cm → 1/12 で3.6m・1/15 で4.5m）と一致すること
//   (4) 全長は高低差について単調非減少（maxRiseWithin の二分探索の前提）
//   (5) 逆算（確保できる長さ → 最大高低差）は、その高低差がちょうど収まり、1mm 上は収まらないこと

import {
  LANDING_RISE_MAX_MM,
  LANDING_DEPTH_MIN_MM,
  LOW_RISE_MM,
  GENTLE_DENOM,
  HANDRAIL_EXEMPT_RISE_MM,
  STANDARDS,
  STANDARD_ORDER,
  landingCount,
  layout,
  minimumLayout,
  maxRiseWithin,
  toDegrees,
  toPercent,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});
const truthy = (name, actual) => ({ name, ok: actual === true, expected: true, actual });
const near = (name, actual, expected, tol = 1e-3) => ({
  name,
  ok: Math.abs(actual - expected) <= tol,
  expected,
  actual,
});

export default function cases() {
  const t = [];

  // ── (1) 条文由来の定数の錠 ─────────────────────────
  t.push(eq("踊場 75cm以内ごと・踏幅150cm以上（施行令19条2項4号ハ）", [LANDING_RISE_MAX_MM, LANDING_DEPTH_MIN_MM], [750, 1500]));
  t.push(eq("16cm 以下の緩和（施行令19条2項4号ロ ただし書）", LOW_RISE_MM, 160));
  t.push(eq("敷地内の通路の踊場は 1/20 超に限る（7号ニ(3)・誘導11条6号ハ）", GENTLE_DENOM, 20));
  t.push(eq("令25条4項 高さ1m以下は手すり不要", HANDRAIL_EXEMPT_RISE_MM, 1000));
  t.push(eq("建築基準法 令26条 1/8（高さによらず）", [STANDARDS.bsl.denom(100, "site"), STANDARDS.bsl.denom(2000, "building")], [8, 8]));
  t.push(eq("円滑化基準 1/12・16cm以下は 1/8", [STANDARDS.enkatsu.denom(160), STANDARDS.enkatsu.denom(161)], [8, 12]));
  t.push(eq("誘導基準 建物内 1/12（6条二）・敷地内 1/15（11条6号ロ）・16cm緩和なし",
    [STANDARDS.yudo.denom(100, "building"), STANDARDS.yudo.denom(100, "site")], [12, 15]));
  t.push(eq("幅 円滑化 120/90（4号イ・7号ニ(1)）", [STANDARDS.enkatsu.widthMm(false), STANDARDS.enkatsu.widthMm(true)], [1200, 900]));
  t.push(eq("幅 誘導 150/120（6条一・11条6号イ）", [STANDARDS.yudo.widthMm(false), STANDARDS.yudo.widthMm(true)], [1500, 1200]));
  t.push(eq("幅 令26条は扱わない（23条準用は用途で異なる）", STANDARDS.bsl.widthMm(false), null));
  t.push(eq("基準の並び", STANDARD_ORDER, ["bsl", "enkatsu", "yudo"]));

  // ── (3) よく引かれる例 ─────────────────────────────
  const r300 = calculate({ riseMm: 300, place: "site", beside: false });
  t.push(eq("段差30cm 敷地内: 1/8→2.4m・1/12→3.6m・1/15→4.5m",
    r300.minimum.map((m) => m.totalMm), [2400, 3600, 4500]));
  t.push(eq("段差30cm 敷地内: 踊場なし", r300.minimum.map((m) => m.landings), [0, 0, 0]));
  const r600 = calculate({ riseMm: 600, place: "building", beside: false });
  t.push(eq("高低差60cm 円滑化 1/12 → 7.2m（踊場なし）", r600.minimum[1].totalMm, 7200));

  // ── (2) 境界: 16cm の勾配切り替え ───────────────────
  t.push(eq("円滑化 16cm ちょうど → 1/8 で 1280mm", minimumLayout("enkatsu", 160, "site", false).totalMm, 1280));
  t.push(eq("円滑化 16.1cm → 1/12 で 1932mm", minimumLayout("enkatsu", 161, "site", false).totalMm, 1932));
  t.push(eq("誘導（敷地内）は 16cm でも 1/15", minimumLayout("yudo", 160, "site", false).denom, 15));

  // ── (2) 境界: 踊場の数 ──────────────────────────────
  t.push(eq("landingCount 750/751/1500/1501/2250/2251",
    [750, 751, 1500, 1501, 2250, 2251].map(landingCount), [0, 1, 1, 2, 2, 3]));
  t.push(eq("建物内 円滑化 751mm: 9012 + 1500 = 10512",
    minimumLayout("enkatsu", 751, "building", false).totalMm, 10512));
  t.push(eq("建物内 円滑化 750mm: 踊場0・9000",
    [minimumLayout("enkatsu", 750, "building", false).landings, minimumLayout("enkatsu", 750, "building", false).totalMm], [0, 9000]));
  t.push(eq("令26条は踊場の高さ間隔を定めない（2m でも踊場0）", minimumLayout("bsl", 2000, "building", false).landings, 0));

  // ── (2) 境界: 敷地内の通路の 1/20 ────────────────────
  t.push(eq("敷地内 円滑化 900mm を 1/20 → 踊場不要", layout("enkatsu", 900, 20, "site", false).landings, 0));
  t.push(eq("敷地内 円滑化 900mm を 1/19 → 踊場1", layout("enkatsu", 900, 19, "site", false).landings, 1));
  t.push(eq("建物内 円滑化 900mm を 1/20 → 踊場1（建物内に 1/20 の緩和はない）", layout("enkatsu", 900, 20, "building", false).landings, 1));
  t.push(eq("敷地内 誘導 900mm を 1/20 → 踊場不要／1/15 → 踊場1",
    [layout("yudo", 900, 20, "site", false).landings, layout("yudo", 900, 15, "site", false).landings], [0, 1]));

  // ── 手すり ──────────────────────────────────────────
  t.push(eq("令25条準用: 1000mm 不要・1001mm 必要",
    [STANDARDS.bsl.handrail(1000).need, STANDARDS.bsl.handrail(1001).need], [false, true]));
  t.push(eq("施行令13条: 16cm 1/12 不要・16.1cm 必要・16cm 1/8 必要",
    [STANDARDS.enkatsu.handrail(160, 12).need, STANDARDS.enkatsu.handrail(161, 12).need, STANDARDS.enkatsu.handrail(160, 8).need],
    [false, true, true]));
  t.push(eq("誘導 敷地内: 20cm を 1/20 は不要・1/19 は両側必要",
    [STANDARDS.yudo.handrail(200, 20, "site").need, STANDARDS.yudo.handrail(200, 19, "site").need], [false, true]));
  t.push(eq("誘導 建物内: 20cm は 1/20 でも両側必要（6条四に 1/20 の限定なし）",
    STANDARDS.yudo.handrail(200, 20, "building").need, true));

  // ── 指定勾配の適否 ─────────────────────────────────
  const c12 = calculate({ riseMm: 300, place: "site", beside: true, denom: 12 });
  t.push(eq("30cm を 1/12: 令26条○・円滑化○・誘導（敷地内1/15）×", c12.chosen.map((x) => x.gradientOk), [true, true, false]));
  const c15 = calculate({ riseMm: 300, place: "site", beside: true, denom: 15 });
  t.push(eq("30cm を 1/15: すべて○", c15.chosen.map((x) => x.gradientOk), [true, true, true]));
  const c7 = calculate({ riseMm: 100, place: "site", beside: true, denom: 7 });
  t.push(eq("10cm を 1/7: すべて×（1/8 より急）", c7.chosen.map((x) => x.gradientOk), [false, false, false]));
  t.push(eq("併設の幅は円滑化90cm・誘導120cm", c12.chosen.map((x) => x.widthMm), [null, 900, 1200]));

  // ── (5) 逆算 ───────────────────────────────────────
  t.push(eq("3.6m 敷地内 円滑化 → 30cm まで", maxRiseWithin("enkatsu", 3600, "site"), 300));
  t.push(eq("1931mm 円滑化 → 16cm（16.1cm は 1932mm 要る）", maxRiseWithin("enkatsu", 1931, "site"), 160));
  t.push(eq("1932mm 円滑化 → 16.1cm", maxRiseWithin("enkatsu", 1932, "site"), 161));
  t.push(eq("建物内 10511mm 円滑化 → 75cm（75.1cm は踊場込み10512mm）", maxRiseWithin("enkatsu", 10511, "building"), 750));
  t.push(eq("建物内 10512mm 円滑化 → 75.1cm", maxRiseWithin("enkatsu", 10512, "building"), 751));
  t.push(eq("長さ 5mm では 1mm も解消できない（1/8 で 8mm 要る）", maxRiseWithin("bsl", 5, "site"), 0));
  {
    let bad = 0;
    for (const key of STANDARD_ORDER) {
      for (const place of ["building", "site"]) {
        for (let L = 100; L <= 40000; L += 337) {
          const r = maxRiseWithin(key, L, place);
          if (r > 0 && minimumLayout(key, r, place, false).totalMm > L) bad++;
          if (minimumLayout(key, r + 1, place, false).totalMm <= L) bad++;
        }
      }
    }
    t.push(eq("逆算の結果はちょうど収まり、1mm 上は収まらない（3基準×2場所×119長さ）", bad, 0));
  }

  // ── (4) 単調性と下限 ───────────────────────────────
  {
    let nonMono = 0;
    let belowBsl = 0;
    for (const key of STANDARD_ORDER) {
      for (const place of ["building", "site"]) {
        let prev = -1;
        for (let h = 10; h <= 3000; h++) {
          const m = minimumLayout(key, h, place, false);
          if (m.totalMm < prev) nonMono++;
          prev = m.totalMm;
          if (m.runMm < h * 8) belowBsl++;
        }
      }
    }
    t.push(eq("全長は高低差について単調非減少（3基準×2場所×2991値）", nonMono, 0));
    t.push(eq("どの基準でも水平長さは 高低差×8 を下回らない", belowBsl, 0));
  }
  {
    // 3基準の強さの順: 令26条 ≦ 円滑化 ≦ 誘導（同じ場所なら長さはこの順に長くなる）
    let bad = 0;
    for (const place of ["building", "site"]) {
      for (let h = 10; h <= 3000; h += 7) {
        const [a, b, c] = STANDARD_ORDER.map((k) => minimumLayout(k, h, place, false).totalMm);
        if (!(a <= b && b <= c)) bad++;
      }
    }
    t.push(eq("全長は 令26条 ≦ 円滑化 ≦ 誘導 の順", bad, 0));
  }

  // ── 換算 ───────────────────────────────────────────
  t.push(near("1/12 は約4.76度", toDegrees(12), 4.7636, 1e-3));
  t.push(near("1/8 は約7.13度", toDegrees(8), 7.1250, 1e-3));
  t.push(near("1/12 は約8.33%", toPercent(12), 8.3333, 1e-3));
  t.push(near("斜面長 30cm×1/12: √(3600²+300²)", minimumLayout("enkatsu", 300, "site", false).slopeLengthMm, Math.sqrt(3600 ** 2 + 300 ** 2)));

  // ── 入力検証 ───────────────────────────────────────
  t.push(eq("高低差 9mm はエラー", calculate({ riseMm: 9, place: "site" }).ok, false));
  t.push(eq("高低差 10mm は可", calculate({ riseMm: 10, place: "site" }).ok, true));
  t.push(eq("高低差 3001mm はエラー", calculate({ riseMm: 3001, place: "site" }).ok, false));
  t.push(eq("場所が不正ならエラー", calculate({ riseMm: 300, place: "roof" }).ok, false));
  t.push(eq("勾配の分母 12.5 はエラー", calculate({ riseMm: 300, place: "site", denom: 12.5 }).ok, false));
  t.push(eq("勾配の分母 51 はエラー", calculate({ riseMm: 300, place: "site", denom: 51 }).ok, false));
  t.push(eq("勾配の指定なしなら chosen は null", calculate({ riseMm: 300, place: "site", denom: "" }).chosen, null));
  t.push(eq("確保できる長さ 0 は「指定なし」", calculate({ riseMm: 300, place: "site", availableMm: 0 }).minimum[0].fitsAvailable, null));
  {
    const r = calculate({ riseMm: 300, place: "site", availableMm: 4000 });
    t.push(eq("4m 確保・30cm: 令26条○ 円滑化○ 誘導×", r.minimum.map((m) => m.fitsAvailable), [true, true, false]));
    t.push(eq("4m 確保: 解消できる最大 50cm/33.3cm/26.6cm", r.minimum.map((m) => m.maxRiseInAvailable), [500, 333, 266]));
  }
  t.push(truthy("NaN はエラー", calculate({ riseMm: NaN, place: "site" }).ok === false));

  return t;
}
