// 石膏ボード必要枚数計算のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// ここで固定している数値は、すべて一般社団法人 石膏ボード工業会
// 「石膏ボード施工マニュアル －木製下地・鋼製下地編」由来である。
// 定数を書き換えたら、まずこのテストが落ちる。出典なしの改変を止めるのが目的。

import {
  BOARD_SIZES,
  FASTENING,
  EDGE_INSET_MM,
  placedSize,
  layout,
  areaOnlySheets,
  pointsOnRun,
  fastenersPerBoard,
  fastenerLength,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

export default function cases() {
  const t = [];
  const B1820 = BOARD_SIZES.find((b) => b.id === "910x1820");
  const B2420 = BOARD_SIZES.find((b) => b.id === "910x2420");

  // ── 出典に由来する定数の固定（勝手に動かさないための錠） ──────────────
  t.push(eq("周辺部の留め位置は端部から10mm内側", EDGE_INSET_MM, 10));
  t.push(eq("表3.5 在来軸組・一般壁 = 周辺200/一般300",
    [FASTENING.wall["zairai-ippan"].edge, FASTENING.wall["zairai-ippan"].field], [200, 300]));
  t.push(eq("表3.5 在来軸組・耐力壁（告示仕様）= 150/150",
    [FASTENING.wall["zairai-tairyoku"].edge, FASTENING.wall["zairai-tairyoku"].field], [150, 150]));
  t.push(eq("表3.5 枠組壁工法 = 100/200",
    [FASTENING.wall.wakugumi.edge, FASTENING.wall.wakugumi.field], [100, 200]));
  t.push(eq("表3.5 鋼製下地（壁）= 200/300",
    [FASTENING.wall.kousei.edge, FASTENING.wall.kousei.field], [200, 300]));
  t.push(eq("表3.6 天井・在来軸組 = 150/200",
    [FASTENING.ceiling.zairai.edge, FASTENING.ceiling.zairai.field], [150, 200]));
  t.push(eq("表3.6 天井・鋼製下地 = 150/200",
    [FASTENING.ceiling.kousei.edge, FASTENING.ceiling.kousei.field], [150, 200]));
  t.push(eq("壁と天井で留付間隔は異なる（混同防止）",
    FASTENING.wall["zairai-ippan"].edge === FASTENING.ceiling.zairai.edge, false));
  t.push(eq("代表製品 910×1820 が存在する", [B1820.w, B1820.h], [910, 1820]));
  t.push(eq("代表製品 910×2730 が存在する",
    (() => { const b = BOARD_SIZES.find((x) => x.id === "910x2730"); return [b.w, b.h]; })(), [910, 2730]));

  // ── placedSize（張り方向） ────────────────────────────────────────────
  t.push(eq("縦張りは幅910・高さ1820", placedSize(B1820, "vertical"), { width: 910, height: 1820 }));
  t.push(eq("横張りは幅1820・高さ910", placedSize(B1820, "horizontal"), { width: 1820, height: 910 }));

  // ── layout（割付） ────────────────────────────────────────────────────
  const l1 = layout(1820, 2420, B1820, "vertical");
  t.push(eq("1820×2420の壁に3×6版縦張り → 2列2段=4枚", [l1.cols, l1.rows, l1.sheets], [2, 2, 4]));

  // 境界: ちょうど1枚分の幅は1列、1mm超えたら2列
  t.push(eq("幅ちょうど910mm → 1列", layout(910, 1000, B1820, "vertical").cols, 1));
  t.push(eq("幅911mm → 切り上げて2列", layout(911, 1000, B1820, "vertical").cols, 2));
  // 境界: 高さちょうど1820は1段、1821で2段
  t.push(eq("高さちょうど1820mm → 1段", layout(900, 1820, B1820, "vertical").rows, 1));
  t.push(eq("高さ1821mm → 切り上げて2段", layout(900, 1821, B1820, "vertical").rows, 2));

  const l2 = layout(3640, 2730, B1820, "horizontal");
  t.push(eq("3640×2730に3×6版横張り → 2列3段=6枚", [l2.cols, l2.rows, l2.sheets], [2, 3, 6]));

  t.push(eq("寸法が0以下なら0枚", layout(0, 2400, B1820, "vertical").sheets, 0));
  t.push(eq("寸法が負なら0枚", layout(-100, 2400, B1820, "vertical").sheets, 0));

  // ── 面積割りとの差（本ツールの主張そのもの） ──────────────────────────
  // 3640×2730 = 9.9372㎡、3×6版 = 1.6562㎡ → ちょうど6.0枚ぶんの面積
  t.push(eq("面積割りでは6枚（理論下限）", areaOnlySheets(3640, 2730, B1820), 6));
  t.push(eq("縦張りの割付では8枚必要", layout(3640, 2730, B1820, "vertical").sheets, 8));

  // ── pointsOnRun（留付具の並び） ───────────────────────────────────────
  // 有効長 = 1820 - 10*2 = 1800。1800/300 = 6区間 → 7本
  t.push(eq("長さ1820・間隔300 → 7本", pointsOnRun(1820, 300, 10), 7));
  t.push(eq("長さ1820・間隔200 → 10本", pointsOnRun(1820, 200, 10), 10));
  // 境界: 割り切れる場合に1本多くなること（区間数+1）を固定
  t.push(eq("有効長が間隔の倍数ちょうど（910-20=890 / 89 → 11本）", pointsOnRun(910, 89, 10), 11));
  t.push(eq("両端の逃げで有効長が0以下でも1本は要る", pointsOnRun(15, 200, 10), 1));
  t.push(eq("間隔0は不正 → 0", pointsOnRun(1820, 0, 10), 0));

  // ── fastenersPerBoard ─────────────────────────────────────────────────
  // 910×1820 縦張り / 一般壁(200,300) / 下地455
  //   周辺: 幅方向 pointsOnRun(910,200)=5、高さ方向 pointsOnRun(1820,200)=10
  //         → 2*5 + 2*10 - 4 = 26
  //   一般: 内側の下地 = ceil(910/455)-1 = 1 本、その上に pointsOnRun(1820,300)=7
  //         → 7
  const f = fastenersPerBoard({ width: 910, height: 1820 }, { edge: 200, field: 300, studSpacing: 455 });
  t.push(eq("3×6版・一般壁・下地455 → 周辺26本", f.perimeter, 26));
  t.push(eq("3×6版・一般壁・下地455 → 内側下地1本", f.interiorSupports, 1));
  t.push(eq("3×6版・一般壁・下地455 → 一般部7本", f.field, 7));
  t.push(eq("3×6版・一般壁・下地455 → 合計33本", f.total, 33));

  // 下地が細かいほど本数は増える（単調性）
  const f303 = fastenersPerBoard({ width: 910, height: 1820 }, { edge: 200, field: 300, studSpacing: 303 });
  t.push(eq("下地303のほうが455より本数が多い", f303.total > f.total, true));

  // 耐力壁は周辺も一般も150なので、一般壁より必ず多くなる
  const fT = fastenersPerBoard({ width: 910, height: 1820 }, { edge: 150, field: 150, studSpacing: 455 });
  t.push(eq("耐力壁(150/150)は一般壁(200/300)より本数が多い", fT.total > f.total, true));

  t.push(eq("寸法不正なら null", fastenersPerBoard({ width: 0, height: 1820 }, { edge: 200, field: 300, studSpacing: 455 }), null));

  // ── fastenerLength ────────────────────────────────────────────────────
  const fl = fastenerLength(12.5, "wood");
  t.push(eq("厚12.5の釘は31.3〜37.5mm（ボード厚の2.5〜3倍）", [fl.nailMinMm, fl.nailMaxMm], [31.3, 37.5]));
  t.push(eq("厚12.5のねじは27.5mm以上（ボード厚+15mm）", fl.screwMinMm, 27.5));
  t.push(eq("厚9.5のねじは24.5mm以上", fastenerLength(9.5, "wood").screwMinMm, 24.5));
  t.push(eq("鋼製下地は裏面10mm余長 → 厚12.5で22.5mm以上", fastenerLength(12.5, "steel").screwMinMm, 22.5));
  t.push(eq("厚さ不正なら null", fastenerLength(0, "wood"), null));

  // ── calculate（統合） ─────────────────────────────────────────────────
  const six = [
    { label: "壁A（長辺）", widthMm: 3640, heightMm: 2400 },
    { label: "壁B（短辺）", widthMm: 2730, heightMm: 2400 },
    { label: "壁C（長辺）", widthMm: 3640, heightMm: 2400 },
    { label: "壁D（短辺）", widthMm: 2730, heightMm: 2400 },
  ];

  // 3×6版(1820)縦張り: 長辺 4列×2段=8、短辺 3列×2段=6 → (8+6)*2 = 28
  const r36 = calculate(six, { boardId: "910x1820", orientation: "vertical" });
  t.push(eq("6畳4面・3×6版縦張り → 28枚", r36.sheets, 28));

  // 3×8版(2420)縦張り: 天井2400に1段で届く。長辺 4列×1段=4、短辺 3列×1段=3 → (4+3)*2 = 14
  const r38 = calculate(six, { boardId: "910x2420", orientation: "vertical" });
  t.push(eq("同じ部屋でも3×8版なら14枚（段継ぎが消える）", r38.sheets, 14));
  t.push(eq("長さ2420を選ぶと枚数が半減する", r38.sheets * 2 === r36.sheets, true));

  t.push(eq("2枚張りは枚数が倍", calculate(six, { boardId: "910x2420", layers: 2 }).sheets, 28));
  t.push(eq("予備10%は切り上げ（14→16）",
    calculate(six, { boardId: "910x2420", sparePercent: 10 }).recommendedSheets, 16));
  t.push(eq("予備0%なら推奨=必要枚数", r38.recommendedSheets, 14));

  t.push(eq("面積割りより割付のほうが多い（差が本ツールの主張）", r36.extraVsAreaOnly > 0, true));
  // (3640+2730)*2 = 12740mm の周長 × 高さ2400mm = 30.576㎡
  t.push(eq("延べ面積は約30.58㎡", Math.round(r36.totalAreaSqm * 100) / 100, 30.58));

  // 天井を選ぶと留付間隔が表3.6に切り替わる
  const rc = calculate([{ label: "天井", widthMm: 2730, heightMm: 3640 }],
    { boardId: "910x1820", part: "ceiling", method: "zairai" });
  t.push(eq("天井は表3.6が使われる（周辺150）", rc.spacing.edge, 150));
  t.push(eq("天井の一般部は200", rc.spacing.field, 200));

  // 不正な面は無視される
  const rBad = calculate(
    [{ label: "空", widthMm: 0, heightMm: 2400 }, { label: "有効", widthMm: 1820, heightMm: 2400 }],
    { boardId: "910x2420" },
  );
  t.push(eq("寸法未入力の面は集計から外れる", rBad.rows.length, 1));
  t.push(eq("有効な面だけで2枚", rBad.sheets, 2));
  t.push(eq("面が1つも無ければ0枚", calculate([], {}).sheets, 0));

  // 留付具の総本数 = 1枚あたり × 枚数
  t.push(eq("留付具の総数は1枚あたり×枚数",
    r38.fastenersTotal === r38.fastenersPerBoard.total * r38.sheets, true));

  return t;
}
