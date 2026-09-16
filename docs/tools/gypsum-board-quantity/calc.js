// 石膏ボード（プラスターボード）の必要枚数・留付具本数の計算ロジック
//
// このファイルはブラウザとテストの両方から読み込まれる。
// 「テストしたコード」と「出荷したコード」を必ず同一にするため、
// 計算式をHTML側に複製してはならない。
//
// 根拠（2026-09-15 確認）:
//   一般社団法人 石膏ボード工業会「石膏ボード施工マニュアル －木製下地・鋼製下地編」
//     https://www.gypsumboard-a.or.jp/pdf/Construct_Manual.pdf
//     - 「代表製品の長さ及び幅」の表（長さ 910/1820/2420/2730 × 幅 455/606/910/1210）
//     - 表３．５「取付け方法」（壁）… 留付間隔 周辺部/一般部
//     - 表３．６「取付け方法」（天井）… 同上
//     - 「ボード周辺部は端部から10mm程度内側で留め付ける」
//     - 「木製下地に釘打ちする場合は、ボード厚の2.5〜3倍程度の長さをもつ釘を用い、
//        ねじ留めする場合は、石膏ボード厚より15mm以上長いものを用い」
//     - 「鋼製下地にねじ留めする場合は、鋼製下地の裏面に10mm以上の余長が得られる長さ」
//   同工業会は JIS A 6901（せっこうボード製品）の原案作成団体である。
//
// 単位はすべて mm。面積だけ ㎡。
//
// ⚠ 本ツールが「面積÷1枚の面積」を採らない理由:
//   石膏ボードは切って継ぎ足せる材料ではあるが、端材は寸法がまちまちで、
//   継目の位置にも制約がある（工業会マニュアル「継目などの位置は正しく」
//   「重ね張りの上張りと下張りのジョイントが同位置にならないように」）。
//   面積で割った枚数は【理論上の下限】であって、実際に張れる枚数ではない。
//   本ツールは列×段の割付で数え、面積ベースの値は比較用に併記する。

/** ボード周辺部の留め付け位置は端部から10mm程度内側（工業会マニュアル） */
export const EDGE_INSET_MM = 10;

/**
 * 代表製品の寸法（工業会マニュアル「代表製品の長さ及び幅」より、
 * 普通石膏ボード（記号 R）が存在する組み合わせだけを採録）。
 * w = 幅, h = 長さ。
 */
export const BOARD_SIZES = [
  { id: "910x1820", w: 910, h: 1820, label: "910 × 1820（3×6版・サブロク）" },
  { id: "910x2420", w: 910, h: 2420, label: "910 × 2420（3×8版）" },
  { id: "910x2730", w: 910, h: 2730, label: "910 × 2730（3×9版）" },
  { id: "606x2420", w: 606, h: 2420, label: "606 × 2420" },
  { id: "1210x2420", w: 1210, h: 2420, label: "1210 × 2420" },
];

/**
 * 留付間隔（mm・いずれも「以下」）。工業会マニュアル 表３．５（壁）／表３．６（天井）。
 * 省令準耐火仕様は「1枚目／2枚目」で値が分かれ、重ね張り前提で条件も多いため
 * このツールでは扱わない（本文で注記し、一次情報へ誘導する）。
 */
export const FASTENING = {
  wall: {
    "zairai-ippan": { label: "在来軸組工法・一般壁", tool: "釘、ねじ", edge: 200, field: 300 },
    "zairai-tairyoku": { label: "在来軸組工法・耐力壁（告示仕様）", tool: "釘", edge: 150, field: 150 },
    wakugumi: { label: "枠組壁工法", tool: "釘、ねじ", edge: 100, field: 200 },
    kousei: { label: "鋼製下地", tool: "ねじ", edge: 200, field: 300 },
  },
  ceiling: {
    zairai: { label: "在来軸組工法・一般", tool: "釘、ねじ", edge: 150, field: 200 },
    wakugumi: { label: "枠組壁工法・一般", tool: "釘、ねじ", edge: 150, field: 200 },
    kousei: { label: "鋼製下地", tool: "ねじ", edge: 150, field: 200 },
  },
};

const isPositive = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * 張り方向を反映した「1枚が面上で占める寸法」。
 * vertical（縦張り）= 長辺を縦に使う / horizontal（横張り）= 長辺を横に使う。
 */
export function placedSize(board, orientation = "vertical") {
  if (!board || !isPositive(board.w) || !isPositive(board.h)) return null;
  return orientation === "horizontal"
    ? { width: board.h, height: board.w }
    : { width: board.w, height: board.h };
}

/**
 * 割付（列×段）で数えた必要枚数。端数は必ず切り上げる。
 * 端材の使い回しは見込まない（見込むと足りなくなる側に倒れるため）。
 */
export function layout(areaW, areaH, board, orientation = "vertical") {
  const p = placedSize(board, orientation);
  if (!isPositive(areaW) || !isPositive(areaH) || !p) {
    return { cols: 0, rows: 0, sheets: 0, placed: p };
  }
  const cols = Math.ceil(areaW / p.width);
  const rows = Math.ceil(areaH / p.height);
  return { cols, rows, sheets: cols * rows, placed: p };
}

/**
 * 面積を1枚の面積で割っただけの枚数（＝理論上の下限）。
 * 既存の多くの計算がこれで止まっている。比較用に出す。
 */
export function areaOnlySheets(areaW, areaH, board) {
  if (!isPositive(areaW) || !isPositive(areaH) || !board) return 0;
  const one = board.w * board.h;
  if (!isPositive(one)) return 0;
  return Math.ceil((areaW * areaH) / one);
}

/**
 * 一直線上に、両端から inset だけ内側に入れて、間隔 spacing 以下で留めるときの本数。
 * 例: 有効長 1800mm・間隔 300mm → 1800/300 = 6 区間 → 7本
 */
export function pointsOnRun(runLength, spacing, inset = EDGE_INSET_MM) {
  if (!isPositive(runLength) || !isPositive(spacing)) return 0;
  const span = runLength - 2 * inset;
  if (span <= 0) return 1; // 極端に短い辺でも1本は要る
  return Math.floor(span / spacing) + 1;
}

/**
 * ボード1枚あたりの留付具の本数。
 *   周辺部 … 4辺に沿って spacing=edge で留める（四隅は重複するので引く）
 *   一般部 … ボードの内側を横切る下地材に沿って spacing=field で留める
 * studSpacing はユーザーが下地に合わせて指定する値であり、当方の推奨値ではない。
 */
export function fastenersPerBoard(placed, { edge, field, studSpacing, inset = EDGE_INSET_MM }) {
  if (!placed || !isPositive(placed.width) || !isPositive(placed.height)) return null;
  if (!isPositive(edge) || !isPositive(field)) return null;

  const alongWidth = pointsOnRun(placed.width, edge, inset);
  const alongHeight = pointsOnRun(placed.height, edge, inset);
  // 上下の辺 + 左右の辺。四隅を二重に数えているので 4 を引く。
  const perimeter = Math.max(0, 2 * alongWidth + 2 * alongHeight - 4);

  // ボードの内側を通る下地材の本数（両端の下地はすでに周辺部で留めている）
  let interiorSupports = 0;
  if (isPositive(studSpacing)) {
    interiorSupports = Math.max(0, Math.ceil(placed.width / studSpacing) - 1);
  }
  const perSupport = interiorSupports > 0 ? pointsOnRun(placed.height, field, inset) : 0;
  const fieldCount = interiorSupports * perSupport;

  return {
    perimeter,
    field: fieldCount,
    interiorSupports,
    total: perimeter + fieldCount,
  };
}

/** 留付具の長さの目安（工業会マニュアル）。thickness は mm。 */
export function fastenerLength(thicknessMm, base = "wood") {
  if (!isPositive(thicknessMm)) return null;
  if (base === "steel") {
    // 鋼製下地: 裏面に10mm以上の余長。下地の板厚は薄いので実質 ボード厚+10mm 以上が下限。
    return { screwMinMm: thicknessMm + 10, note: "鋼製下地の裏面に10mm以上の余長が得られる長さ" };
  }
  return {
    nailMinMm: Math.round(thicknessMm * 2.5 * 10) / 10,
    nailMaxMm: Math.round(thicknessMm * 3 * 10) / 10,
    screwMinMm: thicknessMm + 15,
    note: "釘はボード厚の2.5〜3倍程度、ねじはボード厚より15mm以上長いもの",
  };
}

/**
 * 面の配列から全体を求める。
 * surfaces: [{ label, widthMm, heightMm }]
 * options: { boardId, orientation, part: "wall"|"ceiling", method, studSpacing, layers, sparePercent }
 */
export function calculate(surfaces, options = {}) {
  const {
    boardId = "910x1820",
    orientation = "vertical",
    part = "wall",
    method = part === "ceiling" ? "zairai" : "zairai-ippan",
    studSpacing = 455,
    layers = 1,
    sparePercent = 0,
  } = options;

  const board = BOARD_SIZES.find((b) => b.id === boardId) ?? BOARD_SIZES[0];
  const spacing = FASTENING[part]?.[method] ?? null;
  const layerCount = isPositive(layers) ? Math.floor(layers) : 1;

  const rows = (surfaces ?? [])
    .filter((s) => isPositive(s?.widthMm) && isPositive(s?.heightMm))
    .map((s) => {
      const lay = layout(s.widthMm, s.heightMm, board, orientation);
      return {
        label: s.label,
        widthMm: s.widthMm,
        heightMm: s.heightMm,
        cols: lay.cols,
        rows: lay.rows,
        sheetsPerLayer: lay.sheets,
        sheets: lay.sheets * layerCount,
        areaOnly: areaOnlySheets(s.widthMm, s.heightMm, board) * layerCount,
        areaSqm: (s.widthMm * s.heightMm) / 1e6,
      };
    });

  const sheets = rows.reduce((a, r) => a + r.sheets, 0);
  const areaOnlySheetsTotal = rows.reduce((a, r) => a + r.areaOnly, 0);
  const totalAreaSqm = rows.reduce((a, r) => a + r.areaSqm, 0);
  const spare = Math.max(0, sparePercent);
  const recommendedSheets = Math.ceil(sheets * (1 + spare / 100));

  const placed = placedSize(board, orientation);
  const perBoard = spacing
    ? fastenersPerBoard(placed, { edge: spacing.edge, field: spacing.field, studSpacing })
    : null;

  return {
    rows,
    board,
    placed,
    spacing,
    layers: layerCount,
    sheets,
    recommendedSheets,
    areaOnlySheets: areaOnlySheetsTotal,
    // 割付で数えると面積割りより何枚多いか。ここが既存ツールとの差分にあたる。
    extraVsAreaOnly: sheets - areaOnlySheetsTotal,
    totalAreaSqm,
    fastenersPerBoard: perBoard,
    fastenersTotal: perBoard ? perBoard.total * sheets : null,
    options: { boardId: board.id, orientation, part, method, studSpacing, layers: layerCount, sparePercent: spare },
  };
}
