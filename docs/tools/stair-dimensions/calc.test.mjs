// 階段の寸法計算のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 条文由来の定数（令23条の表5区分・住宅のただし書・屋外の幅・令24条の3m/4m と 1.2m・
//       令25条の 1m・3m・15cm/30cm・令23条3項の10cm・施行規則38条5号/6号の式）
//   (2) 段数の切り替わり（蹴上げ上限ちょうど／1mm 超え）、踊場（高さ制限ちょうど／1mm 超え）、
//       踊場は段の境目にしか置けないので「高さ÷制限の切り上げ」より1か所多くなる場合
//   (3) 高齢者向け基準の3式それぞれの境界（等号で適合・1mm 外で不適合）と、踏面の範囲の端
//   (4) 国交省の説明資料にある「住宅 約57°」（蹴上げ23cm・踏面15cm）と一致すること
//   (5) 使える長さちょうどは収まり、1mm 短いと収まらないこと

import {
  LANDING_DEPTH_MIN_MM,
  HANDRAIL_EXEMPT_HEIGHT_MM,
  HANDRAIL_IGNORE_MM,
  CENTER_RAIL_WIDTH_MM,
  CENTER_RAIL_EXEMPT,
  OUTDOOR_WIDTH_MM,
  KINDS,
  KIND_ORDER,
  ELDERLY,
  minSteps,
  landingCount,
  lawCheck,
  elderlyCheck,
  elderlyTreadRange,
  effectiveWidth,
  minWidthOf,
  centerRailNeeded,
  row,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});
const near = (name, actual, expected, tol = 1e-6) => ({
  name,
  ok: Math.abs(actual - expected) <= tol,
  expected,
  actual,
});

const dims = (k) => [KINDS[k].widthMm, KINDS[k].riseMaxMm, KINDS[k].treadMinMm, KINDS[k].landingHeightMm];

export default function cases() {
  const t = [];

  // ── (1) 条文由来の定数の錠 ─────────────────────────
  t.push(eq("表（一）小学校児童用 140・16・26・踊場3m（令23条・24条）", dims("elementary"), [1400, 160, 260, 3000]));
  t.push(eq("表（二）中学校・劇場等 140・18・26・踊場3m", dims("assembly"), [1400, 180, 260, 3000]));
  t.push(eq("表（三）直上階200㎡超等 120・20・24・踊場4m", dims("large"), [1200, 200, 240, 4000]));
  t.push(eq("表（四）その他 75・22・21・踊場4m", dims("other"), [750, 220, 210, 4000]));
  t.push(eq("住宅（ただし書）蹴上げ23以下・踏面15以上・幅は（四）の75", dims("house"), [750, 230, 150, 4000]));
  t.push(eq("種別の並び", KIND_ORDER, ["house", "other", "large", "assembly", "elementary"]));
  t.push(eq("直階段の踊場の踏幅 1.2m（令24条2項）", LANDING_DEPTH_MIN_MM, 1200));
  t.push(eq("令25条4項 高さ1m以下は不適用", HANDRAIL_EXEMPT_HEIGHT_MM, 1000));
  t.push(eq("令23条3項 手すりの出 10cm まで無いものとみなす", HANDRAIL_IGNORE_MM, 100));
  t.push(eq("令25条3項 幅3m超で中間手すり・ただし書 15cm/30cm",
    [CENTER_RAIL_WIDTH_MM, CENTER_RAIL_EXEMPT.riseMaxMm, CENTER_RAIL_EXEMPT.treadMinMm], [3000, 150, 300]));
  t.push(eq("屋外階段の幅 直通90・その他60（令23条1項ただし書）", [OUTDOOR_WIDTH_MM.direct, OUTDOOR_WIDTH_MM.other], [900, 600]));
  t.push(eq("施行規則38条5号 T≧19.5・R/T≦22/21・55≦T+2R≦65",
    [ELDERLY.unit.treadMinMm, ELDERLY.unit.ratio, ELDERLY.unit.sumMinMm, ELDERLY.unit.sumMaxMm], [195, [22, 21], 550, 650]));
  t.push(eq("施行規則38条6号 T≧24・55≦T+2R≦65（R/T の式なし）",
    [ELDERLY.common.treadMinMm, ELDERLY.common.ratio, ELDERLY.common.sumMinMm, ELDERLY.common.sumMaxMm], [240, null, 550, 650]));
  t.push(eq("高齢者向けの比較は住宅→住戸内・（四）→共用階段・他はなし",
    KIND_ORDER.map((k) => KINDS[k].elderly), ["unit", "common", null, null, null]));

  // ── (2) 段数の切り替わり ─────────────────────────
  t.push(eq("住宅 階高230cm → 10段（蹴上げ23cmちょうどは適合）", minSteps(2300, 230), 10));
  t.push(eq("住宅 階高230.1cm → 11段", minSteps(2301, 230), 11));
  t.push(eq("住宅 階高280cm → 13段", minSteps(2800, 230), 13));
  t.push(eq("（四）階高300cm → 14段（13×22=286 < 300）", minSteps(3000, 220), 14));
  t.push(eq("lawCheck 23cm ちょうど適合・1mm超え不適合",
    [lawCheck("house", 2300, 10, 150).riseOk, lawCheck("house", 2301, 10, 150).riseOk], [true, false]));
  t.push(eq("lawCheck 踏面 住宅15cm・（四）21cm の境界",
    [lawCheck("house", 2000, 9, 150).treadOk, lawCheck("house", 2000, 9, 149).treadOk,
     lawCheck("other", 2000, 10, 210).treadOk, lawCheck("other", 2000, 10, 209).treadOk], [true, false, true, false]));

  // 踊場（令24条）
  t.push(eq("住宅 高さ4mちょうどは踊場なし", landingCount(4000, 18, 4000), 0));
  t.push(eq("住宅 高さ4.001m・18段 → 踊場1か所", landingCount(4001, 18, 4000), 1));
  t.push(eq("高さ8m・35段（蹴上げ228.6mm）→ 1区切り17段まで → 踊場2か所（8÷4 の切り上げ−1 = 1 より多い）",
    landingCount(8000, 35, 4000), 2));
  t.push(eq("高さ8m・36段（蹴上げ222.2mm）→ 1区切り18段 → 踊場1か所", landingCount(8000, 36, 4000), 1));
  t.push(eq("小学校 高さ3mちょうどは踊場なし・3.001m は1か所",
    [landingCount(3000, 19, 3000), landingCount(3001, 19, 3000)], [0, 1]));

  // ── (3) 高齢者向け基準 ─────────────────────────────
  // 階高 2800・13段（R = 215.38mm）
  t.push(eq("2800/13段 で高齢者向けを満たす踏面は 206〜219mm", elderlyTreadRange("unit", 2800, 13), [206, 219]));
  t.push(eq("範囲の端: 206 適合・205 不適合（R/T≦22/21）",
    [elderlyCheck("unit", 2800, 13, 206).ok, elderlyCheck("unit", 2800, 13, 205).ok, elderlyCheck("unit", 2800, 13, 205).ratioOk],
    [true, false, false]));
  t.push(eq("範囲の端: 219 適合・220 不適合（T+2R≦65）",
    [elderlyCheck("unit", 2800, 13, 219).ok, elderlyCheck("unit", 2800, 13, 220).ok, elderlyCheck("unit", 2800, 13, 220).sumOk],
    [true, false, false]));
  t.push(eq("2800/14段（R=200）の範囲は 195〜250mm（下限は T≧19.5 が決める）", elderlyTreadRange("unit", 2800, 14), [195, 250]));
  t.push(eq("T≧19.5 の境界: 195 適合・194 不適合",
    [elderlyCheck("unit", 2800, 14, 195).treadOk, elderlyCheck("unit", 2800, 14, 194).treadOk], [true, false]));
  // R/T ちょうど 22/21: H=2200, n=10 → R=220, T=210 → 21×2200 = 46200 = 22×10×210
  t.push(eq("R/T ちょうど 22/21 は適合（R=220・T=210）", elderlyCheck("unit", 2200, 10, 210).ratioOk, true));
  t.push(eq("R/T 22/21 を1mm 超え（T=209）は不適合", elderlyCheck("unit", 2200, 10, 209).ratioOk, false));
  // T+2R ちょうど 550: H=2000, n=10 → R=200, T=150 → 150+400 = 550
  t.push(eq("T+2R ちょうど55cm は適合・54.9cm は不適合",
    [elderlyCheck("unit", 2000, 10, 150).sumOk, elderlyCheck("unit", 2000, 10, 149).sumOk], [true, false]));
  // 共用階段（6号）: H=3000・14段 R=214.3 → T=240 で T+2R=668.6 > 650
  t.push(eq("共用階段 3000/14段・T=240 は T+2R 超過・15段で適合",
    [elderlyCheck("common", 3000, 14, 240).ok, elderlyCheck("common", 3000, 15, 240).ok], [false, true]));
  t.push(eq("共用階段は R/T の式が無いので ratioOk は常に真", elderlyCheck("common", 3000, 15, 240).ratioOk, true));
  t.push(eq("範囲が無いときは null（2800/10段 は R=280 で T+2R が必ず65cm超）", elderlyTreadRange("unit", 2800, 10), null));

  // ── (4) 角度・水平長さ ─────────────────────────────
  t.push(near("住宅の上限 蹴上げ23・踏面15 は約56.9度（国交省資料の「約57°」）", row("house", 2300, 10, 150).angleDeg,
    (Math.atan(230 / 150) * 180) / Math.PI));
  t.push(eq("約57度に丸まる", Math.round(row("house", 2300, 10, 150).angleDeg), 57));
  const r13 = row("house", 2800, 13, 210);
  t.push(eq("2800/13段・踏面210 → 踏面12枚・水平2,520mm", [r13.treads, r13.runMm, r13.landings], [12, 2520, 0]));
  t.push(near("同 蹴上げ 215.38mm", r13.riseMm, 2800 / 13));
  t.push(near("同 T+2R", r13.sumMm, 210 + 5600 / 13));
  const r18 = row("house", 4001, 18, 210);
  t.push(eq("4001/18段 → 踊場1・踏面16枚・水平 16×210+1200 = 4,560mm", [r18.landings, r18.treads, r18.runMm], [1, 16, 4560]));
  t.push(eq("1段だけ（階高15cm）は踏面0枚・水平0", [row("house", 150, 1, 210).treads, row("house", 150, 1, 210).runMm], [0, 0]));

  // ── (5) 使える長さ ─────────────────────────────────
  t.push(eq("2,520mm ちょうどは収まる・2,519mm は収まらない",
    [row("house", 2800, 13, 210, 2520).fits, row("house", 2800, 13, 210, 2519).fits], [true, false]));
  t.push(eq("2,519mm に収める最大の踏面は 209mm（切り捨て）", row("house", 2800, 13, 210, 2519).maxTreadInAvail, 209));
  t.push(eq("使える長さ未指定なら判定しない", row("house", 2800, 13, 210).fits, null));

  // ── 幅・手すり ─────────────────────────────────────
  t.push(eq("手すりの出 8cm は幅を減らさない", effectiveWidth(780, 1, 80), 780));
  t.push(eq("出 12cm の手すり1本 → 2cm 減", effectiveWidth(780, 1, 120), 760));
  t.push(eq("出 12cm の手すり2本 → 4cm 減", effectiveWidth(780, 2, 120), 740));
  t.push(eq("屋外階段の最小幅: 住宅 直通75（90 より緩い表の値）・その他60・小学校 直通90",
    [minWidthOf("house", "outdoorDirect"), minWidthOf("house", "outdoorOther"), minWidthOf("elementary", "outdoorDirect"),
     minWidthOf("elementary", "indoor")], [750, 600, 900, 1400]));
  t.push(eq("中間手すり: 幅3mちょうどは不要・3.001m は必要",
    [centerRailNeeded(2000, 9, 300, 3000), centerRailNeeded(2000, 9, 300, 3001)], [false, true]));
  t.push(eq("中間手すり ただし書: 蹴上げ15cm以下 かつ 踏面30cm以上なら不要（2100/14段=150・T=300）",
    [centerRailNeeded(2100, 14, 300, 3500), centerRailNeeded(2100, 14, 299, 3500), centerRailNeeded(2101, 14, 300, 3500)],
    [false, true, true]));
  t.push(eq("中間手すり: 高さ1m以下の階段には掛からない", centerRailNeeded(1000, 7, 210, 3500), false));

  // ── calculate（画面から呼ばれる入口） ───────────────
  const c = calculate({ kind: "house", place: "indoor", heightMm: 2800, treadMm: 210, widthMm: 780, railCount: 1, railProjMm: 80 });
  t.push(eq("住宅 階高280cm・踏面21cm → 最少13段・高齢者向けも13段", [c.ok, c.nMin, c.nElderly], [true, 13, 13]));
  t.push(eq("表は最少段数から6行", c.rows.map((r) => r.n), [13, 14, 15, 16, 17, 18]));
  t.push(eq("幅 78cm（出8cmの手すり）→ 有効78cm・最小75cm・適合", [c.width.effWidthMm, c.width.minWidthMm, c.width.ok], [780, 750, true]));
  t.push(eq("高さ2.8m なので手すりは必要", c.handrailNeeded, true));
  const c2 = calculate({ kind: "house", place: "indoor", heightMm: 2800, treadMm: 180 });
  t.push(eq("踏面18cm は 19.5cm 未満なので高齢者向けは何段にしても満たせない", [c2.nElderly, c2.treadLawOk], [null, true]));
  const c3 = calculate({ kind: "other", place: "indoor", heightMm: 3000, treadMm: 240 });
  t.push(eq("（四）階高3m・踏面24cm → 最少14段・共用階段の高齢者向けは15段", [c3.nMin, c3.nElderly], [14, 15]));
  const c4 = calculate({ kind: "house", place: "indoor", heightMm: 2800, treadMm: 300 });
  t.push(eq("踏面30cm だと T+2R を65cm 以下にするには R≦17.5cm → 16段以上（2800/16=175）", c4.nElderly, 16));
  t.push(eq("T+2R ちょうど65cm（R=17.5・T=30）は適合", elderlyCheck("unit", 2800, 16, 300).sumOk, true));
  // 1600/T400: 12段は 4800+3200=8000 > 7800、13段は 5200+3200=8400 ≦ 8450 → 13段。最少は7段なので7行目より先
  const c5 = calculate({ kind: "house", place: "indoor", heightMm: 1600, treadMm: 400 });
  t.push(eq("高齢者向けの段数が6行目より先なら、その段まで表を伸ばす（1600/T400 → 7〜13段）",
    [c5.nMin, c5.nElderly, c5.rows.at(-1).n, c5.rows.length], [7, 13, 13, 7]));
  const c6 = calculate({ kind: "house", place: "indoor", heightMm: 900, treadMm: 210 });
  t.push(eq("高さ90cm の階段は手すりの規定が掛からない（令25条4項）", c6.handrailNeeded, false));

  // 入力検査
  t.push(eq("階高 10cm 未満はエラー", calculate({ kind: "house", heightMm: 99, treadMm: 210 }).ok, false));
  t.push(eq("階高 10cm ちょうどは計算する", calculate({ kind: "house", heightMm: 100, treadMm: 210 }).ok, true));
  t.push(eq("踏面が空はエラー", calculate({ kind: "house", heightMm: 2800, treadMm: NaN }).ok, false));
  t.push(eq("種別が不明はエラー", calculate({ kind: "x", heightMm: 2800, treadMm: 210 }).ok, false));

  // 単調性: 段数を増やすと蹴上げは小さく、法令の適否は一度適合したら崩れない
  {
    let ok = true;
    for (let h = 1000; h <= 6000; h += 37) {
      const r = calculate({ kind: "house", place: "indoor", heightMm: h, treadMm: 200 });
      for (let i = 1; i < r.rows.length; i++) {
        if (!(r.rows[i].riseMm < r.rows[i - 1].riseMm) || !r.rows[i].law.riseOk) ok = false;
      }
      if (!r.rows[0].law.riseOk) ok = false;
      if (r.nMin > 1 && lawCheck("house", h, r.nMin - 1, 200).riseOk) ok = false; // 最少であること
    }
    t.push(eq("階高 1.0〜6.0m: 最少段数は本当に最少で、それ以上は全て蹴上げ適合・蹴上げは単調減少", ok, true));
  }

  return t;
}
