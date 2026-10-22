// 人工芝の必要量（ロールの割付・継ぎ目の長さ・固定ピンの本数）
//
// ⚠ 人工芝のピンの打ち方には、公的な基準もメーカー共通の基準も見つからなかった（2026-10-22 調査）。
//   以下はすべて販売店・施工会社の施工手順であり、間隔は 30cm〜1m とばらつく。
//   そこで1つに決めず、出典ごとの打ち方で本数を並べる（PIN_PLANS）。
//
// 出典（すべて 2026-10-22 に逐語確認）:
//   [DCM]  DCM株式会社「人工芝の敷き方」
//          https://www.dcm-hc.co.jp/howto/guide/g_gardening/20200226124357.html
//          「敷き詰めた人工芝の外周に、１ｍ間隔でピンで固定していきます。」
//   [KMR]  コメリ「人工芝の敷き方」https://www.komeri.com/contents/howto/html/04920.html
//          「芝が浮き上がらないように50ｃｍ間隔で固定していくといいでしょう」
//          「継ぎ目の部分は両方の芝にＵ字ピンが刺さるように固定しましょう。」
//          「2枚以上並べて敷くときには、向きを揃える事でキレイに敷くことができます。」
//   [RST1] 株式会社RESTA https://www.diy-shop.jp/artificial-turf/garden_construction.html
//          「敷き詰めた人工芝の端部分(外周)に30cm程度を目安に等間隔でピンを打ち込んでいきます。」
//          「継ぎ目の隙間は3mm程度空けるのがポイント！基布を重ねすぎると人工芝が盛り上がる原因となる」
//          「芝目(パイルの向き)が同じになるように並べましょう。」
//          「巾1m×10mサイズが一般的で、巾2mのタイプや長さ5mから30m巻まで様々なサイズがあります。」
//   [RST2] 株式会社RESTA https://www.diy-shop.jp/artificial-turf/process.html
//          「ピンを打ちこむ間隔は50cm～1m程度が目安です。」（継ぎ目）
//          割付例「1m×10m巻の人工芝を6m×1.5mの庭に敷く場合」
//            (1)「1m巾×6mと0.5m巾×3mにカットし長手方向に敷く」
//            「どちらの場合も面積は9m2で1m巾×10m巻1本分で足ります」
//            「ジョイント箇所の長さは、(1)の割り付けが2ヶ所・合計6.5mで、(2)の割り付けが5ヶ所の7.5m」
//   [ARS]  アルスグリーン株式会社 https://www.arsgreen.jp/archives/18206
//          「これらの場所には、30cm〜50cm間隔を目安にして細かくU字ピンを打ち込んでください。」（外周と継ぎ目）
//          「中央部分にも1m程度の間隔で均等に打ち込んでおくと、より安心で長持ちする仕上がりになります。」
//
// 割付のモデル（RESTA の例と照合済み。calc.test.mjs）:
//   - 人工芝は重ねずに突き付ける（[RST1]）。帯は ロール幅 ずつ並べ、最後の1列だけ細くなる。
//   - 芝目をそろえる（[KMR][RST1][ARS]）ので、切れ端を90°回して使わない。
//     帯はすべて同じ向きに流し、ロールから長さ方向に切り出す。
//   - 細い最後の列（幅 r）は2通り:
//       full … ロール幅のまま長さ分を切り出し、幅を切り落とす（継ぎ目が少ない）
//       rip  … ロール幅を r の k 枚（k = floor(ロール幅 ÷ r)）に縦に裂き、端どうしで継ぐ
//              （芝目の向きは変わらない。ロールの長さは 1/k で済むが、横の継ぎ目が増える）
//     RESTA の例(1)はこの rip（1m×3m を 0.5m×3m 2本に裂く）。
//   - ロールより長い帯は長手方向に突き付けで継ぐ（横の継ぎ目）。
//   - 継ぎ目の長さ ＝ 帯どうしの縦の継ぎ目 ＋ 各帯の中の横の継ぎ目（その帯の幅）。
//   - ピンは外周と継ぎ目の線の上に、それぞれの間隔で打つ。各線は「長さ ÷ 間隔」の切り上げで等分
//     （実際の間隔は指定以下）。線の交点は1本。内側に打つ打ち方では、継ぎ目と外周で区切られた
//     区画の内側に格子で打つ。
//
// 誤差の向き: ロールから切る長さは cm に切り上げ。ピンは継ぎ目の端にも打つ（2枚を押さえる位置）。
//   いずれも少なく出る側には寄せない。

export const PIN_PLANS = [
  { id: "dcm", label: "外周・継ぎ目 1m", edge: 1000, seam: 1000, inner: null, src: "DCM（外周1m。継ぎ目も同じ間隔とみなす）" },
  { id: "rst", label: "外周 30cm・継ぎ目 50cm", edge: 300, seam: 500, inner: null, src: "RESTA（外周30cm、継ぎ目は50cm〜1mの密なほう）" },
  { id: "kmr", label: "外周・継ぎ目 50cm", edge: 500, seam: 500, inner: null, src: "コメリ（50cm間隔）" },
  { id: "ars", label: "外周・継ぎ目 30cm＋中央 1m", edge: 300, seam: 300, inner: 1000, src: "アルスグリーン（外周・継ぎ目30〜50cmの密なほう、中央1m）" },
];

// 10cm 未満の帯は裂かない（出典ではなく設計上の下限。細すぎる帯は継ぎ目が増えるだけで実用にならない）
export const RIP_MIN_WIDTH_MM = 100;

export const LIMITS = {
  sideMinMm: 100,
  sideMaxMm: 100000,
  rollWMinMm: 300,
  rollWMaxMm: 5000,
  rollLMinMm: 1000,
  rollLMaxMm: 50000,
  pitchMinMm: 100,
  pitchMaxMm: 3000,
};

const EPS = 1e-9;
const ceil10 = (v) => Math.ceil(v / 10 - EPS) * 10; // mm を cm に切り上げ

/** 0..len を「len ÷ pitch の切り上げ」で等分した点の位置（端を含む） */
export function divide(len, pitch) {
  const n = Math.max(1, Math.ceil(len / pitch - EPS));
  const pts = [];
  for (let k = 0; k <= n; k++) pts.push((len * k) / n);
  return pts;
}

/** 区画の内側に格子で打つ本数（区画の辺の上は含まない） */
export function innerCount(a, b, pitch) {
  const na = Math.max(1, Math.ceil(a / pitch - EPS)) - 1;
  const nb = Math.max(1, Math.ceil(b / pitch - EPS)) - 1;
  return na * nb;
}

/** 長さ len をロール長 rollL 以下の片に分ける（突き付けなので重ねなし） */
export function splitLength(len, rollL) {
  const m = Math.max(1, Math.ceil(len / rollL - EPS));
  const pieces = [];
  for (let k = 0; k < m - 1; k++) pieces.push(rollL);
  pieces.push(len - (m - 1) * rollL);
  return pieces;
}

/** 切り出す片（長さ）をロールに割り付ける。長い順に、入る最初のロールへ（First Fit Decreasing） */
export function packRolls(pieceLengths, rollL) {
  const sorted = [...pieceLengths].sort((a, b) => b - a);
  const rest = [];
  for (const len of sorted) {
    const i = rest.findIndex((r) => r >= len - EPS);
    if (i >= 0) rest[i] -= len;
    else rest.push(rollL - len);
  }
  return { rolls: rest.length, leftoverMm: rest.reduce((s, r) => s + r, 0) };
}

/**
 * 1本の帯（幅 w・長さ along）の作り方。
 * 返り値: cut＝ロールから切り出す片の長さ、segs＝地面に並ぶ片の長さ（並び順）
 */
export function stripPlan(along, w, rollW, rollL, rip) {
  const k = rip && w >= RIP_MIN_WIDTH_MM ? Math.floor(rollW / w + EPS) : 1;
  if (k < 2) {
    const cut = splitLength(along, rollL);
    return { k: 1, cut, segs: cut.slice() };
  }
  // 1片を k 枚に裂く。片の長さは along ÷ k を cm に切り上げ、ロール長を超えるなら分ける
  const cut = splitLength(ceil10(along / k), rollL);
  const pool = [];
  for (const len of cut) for (let j = 0; j < k; j++) pool.push(len);
  pool.sort((a, b) => b - a);
  const segs = [];
  let sum = 0;
  for (const len of pool) {
    if (sum >= along - EPS) break;
    const use = Math.min(len, along - sum);
    segs.push(use);
    sum += use;
  }
  return { k, cut, segs };
}

/** 1つの向き・細い列の扱いで全部数える。along＝帯の長さ方向、across＝帯を並べる方向（mm） */
export function layout({ along, across, rollW, rollL, rip }) {
  const n = Math.max(1, Math.ceil(across / rollW - EPS));
  const widths = [];
  for (let k = 0; k < n - 1; k++) widths.push(rollW);
  widths.push(across - (n - 1) * rollW);
  const narrow = widths[n - 1] < rollW - EPS;

  const strips = [];
  let x = 0;
  for (let k = 0; k < n; k++) {
    const w = widths[k];
    const plan = stripPlan(along, w, rollW, rollL, rip && narrow && k === n - 1);
    strips.push({ x0: x, x1: x + w, w, ...plan });
    x += w;
  }

  const cutPieces = strips.flatMap((s) => s.cut);
  const packed = packRolls(cutPieces, rollL);
  const rollLengthUsedMm = cutPieces.reduce((s, v) => s + v, 0);

  const longSeamMm = (n - 1) * along;
  let crossJoints = 0;
  let crossSeamMm = 0;
  for (const s of strips) {
    crossJoints += s.segs.length - 1;
    crossSeamMm += (s.segs.length - 1) * s.w;
  }

  return {
    along,
    across,
    strips: n,
    lastStripWidthMm: widths[n - 1],
    narrow,
    ripped: strips[n - 1].k >= 2,
    ripK: strips[n - 1].k,
    stripDetail: strips,
    rolls: packed.rolls,
    leftoverMm: packed.leftoverMm,
    rollLengthUsedMm,
    longSeams: n - 1,
    crossJoints,
    seamPlaces: n - 1 + crossJoints,
    seamM: (longSeamMm + crossSeamMm) / 1000,
  };
}

/** 割付 l に対して、打ち方 plan のピンの本数（線の交点は1本） */
export function countPins(l, plan) {
  const { along, across } = l;
  const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const pts = new Set();
  // x＝across 方向、y＝along 方向
  const lineX = (x, y0, len, p) => { for (const t of divide(len, p)) pts.add(key(x, y0 + t)); };
  const lineY = (y, x0, len, p) => { for (const t of divide(len, p)) pts.add(key(x0 + t, y)); };
  lineX(0, 0, along, plan.edge);
  lineX(across, 0, along, plan.edge);
  lineY(0, 0, across, plan.edge);
  lineY(along, 0, across, plan.edge);
  const s = l.stripDetail;
  for (let k = 1; k < s.length; k++) lineX(s[k].x0, 0, along, plan.seam);
  let inner = 0;
  for (const st of s) {
    let y = 0;
    const ys = [0];
    for (let j = 0; j < st.segs.length - 1; j++) {
      y += st.segs[j];
      lineY(y, st.x0, st.w, plan.seam);
      ys.push(y);
    }
    ys.push(along);
    if (plan.inner)
      for (let j = 0; j < ys.length - 1; j++) inner += innerCount(st.w, ys[j + 1] - ys[j], plan.inner);
  }
  return pts.size + inner;
}

/**
 * @param {object} p
 * @param {number} p.widthMm   敷く場所の幅（mm）
 * @param {number} p.lengthMm  奥行き（mm）
 * @param {number} p.rollWMm   ロール幅
 * @param {number} p.rollLMm   ロール長
 * @param {"auto"|"length"|"width"} p.direction 芝を流す向き
 * @param {"auto"|"rip"|"full"} p.narrow 細い最後の列の取り方
 * @param {{edge:number,seam:number,inner:number|null}} [p.custom] 自分で決めるピンの間隔（mm）
 */
export function calculate(p) {
  const errors = [];
  const W = Math.round(Number(p.widthMm));
  const L = Math.round(Number(p.lengthMm));
  const rollW = Math.round(Number(p.rollWMm));
  const rollL = Math.round(Number(p.rollLMm));
  const direction = p.direction || "auto";
  const narrowMode = p.narrow || "auto";

  for (const [v, name] of [[W, "幅"], [L, "奥行き"]]) {
    if (!Number.isFinite(v) || v < LIMITS.sideMinMm || v > LIMITS.sideMaxMm)
      errors.push(`${name}は0.1〜100mで入力してください。`);
  }
  if (!Number.isFinite(rollW) || rollW < LIMITS.rollWMinMm || rollW > LIMITS.rollWMaxMm)
    errors.push("ロール幅は0.3〜5mで入力してください。");
  if (!Number.isFinite(rollL) || rollL < LIMITS.rollLMinMm || rollL > LIMITS.rollLMaxMm)
    errors.push("ロール長は1〜50mで入力してください。");
  if (!["auto", "length", "width"].includes(direction)) errors.push("芝を流す向きを選んでください。");
  if (!["auto", "rip", "full"].includes(narrowMode)) errors.push("細い列の取り方を選んでください。");
  let custom = null;
  if (p.custom) {
    const c = { edge: Math.round(Number(p.custom.edge)), seam: Math.round(Number(p.custom.seam)),
      inner: p.custom.inner ? Math.round(Number(p.custom.inner)) : null };
    for (const [v, name] of [[c.edge, "外周"], [c.seam, "継ぎ目"], [c.inner, "内側"]]) {
      if (v === null) continue;
      if (!Number.isFinite(v) || v < LIMITS.pitchMinMm || v > LIMITS.pitchMaxMm)
        errors.push(`${name}のピンの間隔は10〜300cmで入力してください。`);
    }
    custom = { id: "custom", label: "自分で決めた間隔", src: "入力値", ...c };
  }
  if (errors.length) return { ok: false, errors };

  // 細い列の扱い: auto は「裂くとロールが減るときだけ裂く」（継ぎ目は増えるので、減らないなら裂かない）
  const variant = (along, across, dir) => {
    const full = { ...layout({ along, across, rollW, rollL, rip: false }), direction: dir };
    const rip = { ...layout({ along, across, rollW, rollL, rip: true }), direction: dir };
    if (narrowMode === "full" || !rip.ripped) return full;
    if (narrowMode === "rip") return rip;
    return rip.rolls < full.rolls ? rip : full;
  };
  const byLength = variant(L, W, "length"); // 芝を奥行き方向に流す
  const byWidth = variant(W, L, "width"); // 芝を幅方向に流す
  // ロール数 → 継ぎ目の長さ → 使う長さ の順で少ないほう（RESTA「継ぎ目の少ない…割り付けするのが正解」）
  const better = (a, b) =>
    a.rolls !== b.rolls ? a.rolls < b.rolls
      : Math.abs(a.seamM - b.seamM) > EPS ? a.seamM < b.seamM
        : a.rollLengthUsedMm <= b.rollLengthUsedMm;
  let chosen;
  let other;
  if (direction === "length") [chosen, other] = [byLength, byWidth];
  else if (direction === "width") [chosen, other] = [byWidth, byLength];
  else [chosen, other] = better(byLength, byWidth) ? [byLength, byWidth] : [byWidth, byLength];

  const plans = custom ? [...PIN_PLANS, custom] : PIN_PLANS;
  const pins = plans.map((pl) => ({ id: pl.id, label: pl.label, src: pl.src, pins: countPins(chosen, pl) }));

  const areaM2 = (W * L) / 1e6;
  const naiveRolls = Math.ceil((W * L) / (rollW * rollL) - EPS);
  const checks = [];
  const notes = [];

  if (chosen.rolls > naiveRolls)
    checks.push({
      status: "ng",
      title: `面積で割ると ${naiveRolls} 本、割り付けると ${chosen.rolls} 本`,
      detail: `地面 ${fmt(areaM2)}㎡ ÷ ロール1本 ${fmt((rollW * rollL) / 1e6)}㎡ では足りません。` +
        "人工芝は芝目をそろえて同じ向きに敷くため、切れ端を回して隙間に使えず、面積の割り算どおりには収まらないことがあります。",
    });
  else
    checks.push({
      status: "ok",
      title: `面積の割り算（${naiveRolls} 本）と同じ本数で足ります`,
      detail: "割り付けても、面積をロール1本の面積で割った本数に収まりました。",
    });

  if (chosen.ripped)
    checks.push({
      status: "info",
      title: `最後の列（幅 ${fmt(chosen.lastStripWidthMm / 1000)}m）は、余りを縦に${chosen.ripK}本に裂いて取ります`,
      detail: `幅 ${fmt(rollW / 1000)}m のまま切ると幅を捨てることになるので、短く切った片を芝目の向きのまま縦に裂いて端どうしで継ぎます。` +
        "ロールは減りますが、横の継ぎ目が増えます。継ぎ目を減らしたいときは「細い列の取り方」を「ロール幅のまま切る」にしてください。",
    });
  else if (chosen.narrow && Math.floor(rollW / chosen.lastStripWidthMm + EPS) >= 2)
    notes.push(`最後の列（幅 ${fmt(chosen.lastStripWidthMm / 1000)}m）はロール幅のまま切り出し、幅を切り落とす前提です。縦に裂いて継げばロールの長さは減りますが、この寸法ではロールの本数は減りません。`);

  if (chosen.leftoverMm > 0)
    notes.push(`ロールの残りは合計 ${fmt(chosen.leftoverMm / 1000)}m（幅 ${fmt(rollW / 1000)}m）です。`);

  return {
    ok: true,
    input: { widthMm: W, lengthMm: L, rollWMm: rollW, rollLMm: rollL, direction, narrow: narrowMode },
    areaM2,
    naiveRolls,
    chosen,
    other,
    pins,
    checks,
    notes,
  };
}

function fmt(v) {
  return Number(v).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}
