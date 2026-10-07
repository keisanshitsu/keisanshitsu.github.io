// 防草シートの必要量と固定ピンの本数（メーカー施工基準どおり）
//
// 出典（すべて 2026-10-07 にメーカー公開資料から逐語確認）:
//   [GF]  株式会社グリーンフィールド「ザバーン® 技術資料」
//         https://sg-news.sungreen.co.jp/sgnews-cms/wp-content/uploads/2024/07/xavan_gijutu.pdf
//         P.2「シー ト同士の重ねは100mmと り ます」
//         P.3「シー ト外周 ・ ジ ョイン ト部は500mm、 内側は1m ピ ッ チでピンを打ちます」
//             100㎡正方形・2m幅の実例: シート 105㎡／ピン 222本／接続テープ 50ｍ
//             「参考必要ピン数量3本／㎡ ※但し100㎡以下の場合は除く」
//         P.3・P.4「シー ト外周はすべて500mm 間隔で固定 し て く ださい」
//         P.4「シー ト全体、 500mm ピッチでピンを打ちます」同条件でピン 462本（5本／㎡）
//         P.8（砂利下）「スミ付け箇所に専用ピンを1m ピッチで打ち、 シー トを固定 します （1～2本/㎡）」
//                      「構造物がある場合、 シー トを30～50mm 程度立上げ施工」
//         P.11 固定ピン「600本／50本入り」
//   [WEB] 同社「防草シートの施工方法」https://gfield.co.jp/feature/bousou-sheet/
//         「シート同士は必ず10cm以上ラップしてください」
//         「縁石やブロック等の端部の立ち上げは5cm以上を推奨しています」
//   [PRD] 同社 製品ページ https://gfield.co.jp/product/xavan/
//         ロール寸法 1m×30m・2m×30m・1m×50m・2m×50m・3m×20m
//
// ⚠ これはザバーン（グリーンフィールド）の基準である。他社製品では値が違いうるので、
//   重ね・ロール寸法は利用者が変えられる入力にしてある（既定値が上の値）。
//
// 配置のモデル（実例と照合済み。calc.test.mjs）:
//   シートを幅方向に (ロール幅 − 重ね) ずつずらして並べる。継ぎ目の線はその位置にある。
//   ロール長より長い向きでは長手方向にも継ぎ、同じ重ねをとる。
//   ピンは (1) 外周 (2) 継ぎ目の線 の上に「線のピッチ」で、
//   (3) 継ぎ目と外周で区切られた各区画の内側に「内側のピッチ」の格子で打つ。
//   どの線も「長さ ÷ ピッチ」を切り上げた数で等分する＝実際の間隔はピッチ以下になる。
//   線の交点は1本として数える（座標の集合で重複を除く）。
//
// 実例との照合結果（誤差の向きを先に書く）:
//   100㎡正方形・2m幅で シート105㎡・テープ50m は完全一致。
//   ピンは 228本（実例 222）・468本（実例 462）で、どちらも【6本多い】（約3%・安全側）。
//   差の出どころ: 継ぎ目の線の端（x=1.9m など）は外周の500mm刻みに乗らないので、
//   本モデルは継ぎ目の端にも1本打つ（継ぎ目の端は2枚を押さえる位置であり省けない）。
//   実例の図はその扱いを示していないので、少なく出る側には寄せない。
//   購入数は 50本入りの袋単位に切り上げて示す（228→250・222→250 で同じ袋数になる）。

export const OVERLAP_MM = 100; // [GF] P.2
export const PIN_PACK = 50; // [GF] P.11「50本入り」
export const UPTURN_RECOMMENDED_MM = 50; // [WEB] 5cm以上を推奨

/** 打ち方。line=外周と継ぎ目のピッチ、inner=区画の内側のピッチ（mm） */
export const MODES = {
  exposed: { line: 500, inner: 1000, label: "むき出し（基本）", refPerM2: 3 }, // [GF] P.3
  dense: { line: 500, inner: 500, label: "全体500mm（法面・風の強い場所）", refPerM2: 5 }, // [GF] P.4
  gravel: { line: 1000, inner: 1000, label: "砂利・人工芝の下", refPerM2: null }, // [GF] P.8
};
export const REF_EXCLUDED_AT_OR_BELOW_M2 = 100; // [GF] 「但し100㎡以下の場合は除く」

export const ROLLS = [
  { w: 1000, l: 30000 },
  { w: 2000, l: 30000 },
  { w: 1000, l: 50000 },
  { w: 2000, l: 50000 },
  { w: 3000, l: 20000 },
]; // [PRD]

export const LIMITS = {
  sideMinMm: 100,
  sideMaxMm: 200000,
  overlapMinMm: 50,
  overlapMaxMm: 500,
  rollWMinMm: 300,
  rollWMaxMm: 5000,
  rollLMinMm: 1000,
  rollLMaxMm: 200000,
  upturnMaxMm: 300,
};

/** 0..len を「len ÷ pitch の切り上げ」で等分した点の位置（端を含む） */
export function divide(len, pitch) {
  const n = Math.max(1, Math.ceil(len / pitch - 1e-9));
  const pts = [];
  for (let k = 0; k <= n; k++) pts.push((len * k) / n);
  return pts;
}

/** 区画の内側に格子で打つ本数（区画の辺の上は含まない） */
export function innerCount(a, b, pitch) {
  const na = Math.max(1, Math.ceil(a / pitch - 1e-9)) - 1;
  const nb = Math.max(1, Math.ceil(b / pitch - 1e-9)) - 1;
  return na * nb;
}

/**
 * 幅方向（across）に帯を並べたときの継ぎ目の位置。帯の数 n と、線の位置（0 と端を含む）。
 * 1本目は全幅、2本目以降は (rollW − overlap) ずつ足していく。
 */
export function stripLines(across, rollW, overlap) {
  if (across <= rollW) return { n: 1, lines: [0, across], widths: [across] };
  const eff = rollW - overlap;
  const n = 1 + Math.ceil((across - rollW) / eff - 1e-9);
  const lines = [0];
  for (let k = 1; k < n; k++) lines.push(k * eff);
  lines.push(across);
  // 実際に切り出す帯の幅: 1〜n-1本目は全幅、最後の1本は残り＋重ね
  const widths = [];
  for (let k = 0; k < n - 1; k++) widths.push(rollW);
  widths.push(across - (n - 1) * eff);
  return { n, lines, widths };
}

/** 長手方向（along）に継ぐときの1本の帯の切り分け（各片の長さ）と継ぎ目の位置 */
export function lengthPieces(along, rollL, overlap) {
  if (along <= rollL) return { pieces: [along], joints: [] };
  const eff = rollL - overlap;
  const m = 1 + Math.ceil((along - rollL) / eff - 1e-9);
  const pieces = [];
  const joints = [];
  for (let k = 0; k < m - 1; k++) pieces.push(rollL);
  pieces.push(along - (m - 1) * eff);
  for (let k = 1; k < m; k++) joints.push(k * eff);
  return { pieces, joints };
}

/** 切り出す片（長さ）をロールに割り付ける。長い順に、入る最初のロールへ（First Fit Decreasing） */
export function packRolls(pieceLengths, rollL) {
  const sorted = [...pieceLengths].sort((a, b) => b - a);
  const rest = [];
  for (const len of sorted) {
    const i = rest.findIndex((r) => r >= len - 1e-9);
    if (i >= 0) rest[i] -= len;
    else rest.push(rollL - len);
  }
  return { rolls: rest.length, leftoverMm: rest.reduce((s, r) => s + r, 0) };
}

/** 1つの向きで全部数える。along＝帯の長さ方向、across＝帯を並べる方向（どちらも地面の寸法 mm） */
export function layout({ along, across, rollW, rollL, overlap, mode, upturn }) {
  const pitch = MODES[mode];
  // シートの寸法は立ち上げぶん大きくなる。ピンは地面の上にだけ打つ
  const sAlong = along + 2 * upturn;
  const sAcross = across + 2 * upturn;
  const st = stripLines(sAcross, rollW, overlap);
  const lp = lengthPieces(sAlong, rollL, overlap);

  // --- ピン（地面の座標で置く。継ぎ目の線はシート座標から地面座標へずらし、地面の外は捨てる）
  const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const pts = new Set();
  const addLineX = (x, len, p) => { for (const y of divide(len, p)) pts.add(key(x, y)); }; // x 一定・y 方向
  const addLineY = (y, len, p) => { for (const x of divide(len, p)) pts.add(key(x, y)); }; // y 一定・x 方向
  // x＝across 方向、y＝along 方向
  addLineX(0, along, pitch.line);
  addLineX(across, along, pitch.line);
  addLineY(0, across, pitch.line);
  addLineY(along, across, pitch.line);
  const seamX = st.lines.slice(1, -1).map((v) => v - upturn).filter((v) => v > 0 && v < across);
  const jointY = lp.joints.map((v) => v - upturn).filter((v) => v > 0 && v < along);
  for (const x of seamX) addLineX(x, along, pitch.line);
  for (const y of jointY) addLineY(y, across, pitch.line);
  const linePins = pts.size;
  const xs = [0, ...seamX, across];
  const ys = [0, ...jointY, along];
  let innerPins = 0;
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++)
      innerPins += innerCount(xs[i + 1] - xs[i], ys[j + 1] - ys[j], pitch.inner);
  const pins = linePins + innerPins;

  // --- シート
  const pieceList = [];
  for (let k = 0; k < st.n; k++) for (const len of lp.pieces) pieceList.push(len);
  const packed = packRolls(pieceList, rollL);
  const sheetAreaMm2 = st.widths.reduce((s, w) => s + w, 0) * sAlong
    + st.widths.reduce((s, w) => s + w, 0) * overlap * lp.joints.length;
  const tapeMm = (st.n - 1) * sAlong + lp.joints.length * sAcross;

  return {
    along,
    across,
    strips: st.n,
    lastStripWidthMm: st.widths[st.widths.length - 1],
    piecesPerStrip: lp.pieces.length,
    pieces: pieceList.length,
    rolls: packed.rolls,
    rollLengthUsedMm: pieceList.reduce((s, v) => s + v, 0),
    leftoverMm: packed.leftoverMm,
    sheetAreaM2: sheetAreaMm2 / 1e6,
    tapeM: tapeMm / 1000,
    seams: seamX.length,
    endJoints: jointY.length,
    linePins,
    innerPins,
    pins,
    pinPacks: Math.ceil(pins / PIN_PACK),
  };
}

/**
 * @param {object} p
 * @param {number} p.widthMm   地面の寸法（mm）
 * @param {number} p.lengthMm
 * @param {number} p.rollWMm   ロール幅
 * @param {number} p.rollLMm   ロール長
 * @param {number} p.overlapMm 重ね
 * @param {"exposed"|"dense"|"gravel"} p.mode
 * @param {number} p.upturnMm  壁・縁石への立ち上げ（全周に足す）
 * @param {"auto"|"length"|"width"} p.direction 帯をどちら向きに流すか
 */
export function calculate(p) {
  const errors = [];
  const W = Math.round(Number(p.widthMm));
  const L = Math.round(Number(p.lengthMm));
  const rollW = Math.round(Number(p.rollWMm));
  const rollL = Math.round(Number(p.rollLMm));
  const overlap = Math.round(Number(p.overlapMm));
  const upturn = Math.round(Number(p.upturnMm) || 0);
  const mode = p.mode;
  const direction = p.direction || "auto";

  for (const [v, name] of [[W, "幅"], [L, "奥行き"]]) {
    if (!Number.isFinite(v) || v < LIMITS.sideMinMm || v > LIMITS.sideMaxMm)
      errors.push(`${name}は0.1〜200mで入力してください。`);
  }
  if (!Number.isFinite(rollW) || rollW < LIMITS.rollWMinMm || rollW > LIMITS.rollWMaxMm)
    errors.push("ロール幅は0.3〜5mで入力してください。");
  if (!Number.isFinite(rollL) || rollL < LIMITS.rollLMinMm || rollL > LIMITS.rollLMaxMm)
    errors.push("ロール長は1〜200mで入力してください。");
  if (!Number.isFinite(overlap) || overlap < LIMITS.overlapMinMm || overlap > LIMITS.overlapMaxMm)
    errors.push("重ねは5〜50cmで入力してください。");
  else if (overlap * 2 >= Math.min(rollW, rollL))
    errors.push("重ねがロール幅に対して大きすぎます（ロール幅の半分未満にしてください）。");
  if (!Number.isFinite(upturn) || upturn < 0 || upturn > LIMITS.upturnMaxMm)
    errors.push("立ち上げは0〜30cmで入力してください。");
  if (!MODES[mode]) errors.push("打ち方を選んでください。");
  if (!["auto", "length", "width"].includes(direction)) errors.push("敷く向きを選んでください。");
  if (errors.length) return { ok: false, errors };

  const common = { rollW, rollL, overlap, mode, upturn };
  const alongLength = layout({ ...common, along: L, across: W }); // 帯を奥行き方向に流す
  const alongWidth = layout({ ...common, along: W, across: L }); // 帯を幅方向に流す
  // ロール数 → ピン数（＝継ぎ目の多さ・手間）→ 使う長さ の順で少ないほう。
  // 長さを先に比べると、細長い犬走りを横向きの細切れで敷く案が選ばれてしまう
  const better = (a, b) =>
    a.rolls !== b.rolls ? a.rolls < b.rolls
      : a.pins !== b.pins ? a.pins < b.pins
        : a.rollLengthUsedMm <= b.rollLengthUsedMm;
  let chosen;
  let other;
  if (direction === "length") [chosen, other] = [alongLength, alongWidth];
  else if (direction === "width") [chosen, other] = [alongWidth, alongLength];
  else [chosen, other] = better(alongLength, alongWidth) ? [alongLength, alongWidth] : [alongWidth, alongLength];
  chosen = { ...chosen, direction: chosen === alongLength ? "length" : "width" };
  other = { ...other, direction: other === alongLength ? "length" : "width" };

  const areaM2 = (W * L) / 1e6;
  const ref = MODES[mode].refPerM2;
  const notes = [];
  const checks = [];

  if (ref !== null) {
    const refPins = Math.ceil(areaM2 * ref);
    if (areaM2 <= REF_EXCLUDED_AT_OR_BELOW_M2) {
      checks.push({
        status: "info",
        title: `「1㎡あたり${ref}本」の目安はこの面積には使えません`,
        detail: `メーカーの技術資料は参考必要ピン数量を${ref}本／㎡としつつ「但し100㎡以下の場合は除く」と書いています。` +
          `面積${fmt(areaM2)}㎡では外周の割合が大きく、配置どおりに数えると1㎡あたり${fmt(chosen.pins / areaM2)}本になります。`,
      });
    } else {
      checks.push({
        status: "info",
        title: `参考値（${ref}本／㎡）では ${refPins.toLocaleString("ja-JP")} 本`,
        detail: `100㎡を超えるのでメーカーの参考値が使えます。配置どおりに数えた ${chosen.pins.toLocaleString("ja-JP")} 本との差は、` +
          `区画の形と継ぎ目の数によるものです。多いほうで用意すると不足しません。`,
      });
    }
  } else {
    checks.push({
      status: "info",
      title: `砂利の下は1mピッチ（1㎡あたり ${fmt(chosen.pins / areaM2)} 本）`,
      detail: "メーカーの技術資料は砂利下で「専用ピンを1m ピッチで打ち」「1～2本/㎡」としています。継ぎ目には接続テープを貼り、砂利が継ぎ目に入らないよう敷きならします。",
    });
  }

  if (overlap < OVERLAP_MM)
    checks.push({
      status: "ng",
      title: `重ね ${overlap / 10}cm はメーカー基準（10cm以上）より狭い`,
      detail: "グリーンフィールドの施工方法は「シート同士は必ず10cm以上ラップしてください」としています。隙間から雑草が出る原因になります。",
    });

  if (upturn > 0 && upturn < UPTURN_RECOMMENDED_MM && mode !== "gravel")
    notes.push("縁石やブロックへの立ち上げは、メーカーが5cm以上を推奨しています。");
  if (chosen.strips > 1 && chosen.lastStripWidthMm < overlap * 3)
    notes.push(`最後の1列は幅 ${fmt(chosen.lastStripWidthMm / 1000)}m の細い帯になります。向きを変えるか、幅の広いロールを選ぶと継ぎ目を1本減らせることがあります。`);
  if (chosen.leftoverMm > 0)
    notes.push(`ロールの残りは合計 ${fmt(chosen.leftoverMm / 1000)}m（幅${fmt(rollW / 1000)}m）です。細い最後の1列を残りから切り出せる場合は、ロールを1本減らせることがあります。`);

  return {
    ok: true,
    input: { widthMm: W, lengthMm: L, rollWMm: rollW, rollLMm: rollL, overlapMm: overlap, mode, upturnMm: upturn, direction },
    areaM2,
    chosen,
    other,
    checks,
    notes,
  };
}

function fmt(v) {
  return Number(v).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}
