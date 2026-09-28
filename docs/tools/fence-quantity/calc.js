// フェンスの枚数・柱の本数（アルミ形材フェンス・自在柱式）
//
// 出典（すべて 2026-09-28 にメーカー公開資料から逐語確認）:
//   [AB]  LIXIL ニュースリリース 2020-02-06「フェンスAB」
//         https://newsrelease.lixil.co.jp/news/pdf/2020020601.pdf
//         「すべてのデザインで本体W 寸法を 2000mm に統一」
//   [J]   LIXIL フェンスJ型 施工説明書（自在柱式）
//         https://assets.lixil.com/content/dam/lixil-assets/manual/oldext/201607/J13707C.pdf
//         「柱間隔 2000mm 以下」「柱位置 本体の連結部・端部より 300mm 以下」
//         「コーナー部は柱２本建てとして施工」
//   [ME]  LIXIL 形材フェンス（自在柱式）施工説明書 ME-2143
//         https://assets.lixil.com/content/dam/lixil-assets/manual/oldext/201607/J16407C.pdf
//         「H1400 および風当りの強い場所にフェンスを設置する場合は、柱の間隔を 1000mm 以内」
//         「ブロック塀の総高さ（フェンス含む）は 2.2m を超えないように施工してください」
//
// ⚠ これらは LIXIL の特定製品の規則である。他社・他製品では値が違いうるので、
//   パネル幅と柱間隔は利用者が変えられる入力にしてある（既定値が上の値）。
//
// 数え方（誤差の向きを先に決めてある）:
//   柱は「すべての連結部・端部の真上」に立て、隣り合う柱の間が柱間隔を超えるときだけ
//   中間柱を足す。1辺あたり 柱 ＝ 1 ＋ Σ ceil(パネルの長さ ÷ 柱間隔)。
//   説明書は連結部・端部から 300mm 以内を許すので、短い端材が出る辺では
//   1本少なく済む配置がありうるが、その最適化はしない。**数え間違えるなら多めに倒す。**
//   コーナーは柱2本建てなので、各辺は両端に自分の柱を持つ＝辺ごとに独立に数えてよい。

export const PANEL_W_MM = 2000; // [AB]
export const POST_SPACING_MM = { standard: 2000, windy: 1000 }; // [J] [ME]
export const POST_OFFSET_MAX_MM = 300; // [J] 連結部・端部から柱までの許容
export const CORNER_POSTS = 2; // [J] [ME]
export const MAKER_TOTAL_HEIGHT_MAX_MM = 2200; // [ME] ブロック＋フェンスの総高さ
export const WINDY_HEIGHT_MM = 1400; // [ME] H1400 は柱間隔1000mm以内
export const REI_BLOCK_MAX_HEIGHT_MM = 2200; // 建築基準法施行令 第62条の8 第一号（ブロック塀そのもの）

export const LIMITS = {
  maxSides: 20,
  sideMaxMm: 200000, // 1辺200mまで
  panelMinMm: 500,
  panelMaxMm: 4000,
  spacingMinMm: 300,
  spacingMaxMm: 4000,
  heightMaxMm: 5000,
};

/** 1辺ぶんの内訳。lengthMm は整数mm */
export function splitSide(lengthMm, panelWMm, spacingMm) {
  const full = Math.floor(lengthMm / panelWMm);
  const rest = lengthMm - full * panelWMm;
  const pieces = [];
  for (let i = 0; i < full; i++) pieces.push(panelWMm);
  if (rest > 0) pieces.push(rest);
  const posts = 1 + pieces.reduce((s, len) => s + Math.ceil(len / spacingMm), 0);
  return {
    lengthMm,
    panels: pieces.length,
    fullPanels: full,
    cutMm: rest > 0 ? rest : null,
    joints: pieces.length - 1,
    posts,
    intermediatePosts: posts - (pieces.length + 1),
  };
}

/**
 * @param {object} p
 * @param {number[]} p.sidesMm 各辺の長さ（mm）。辺はこの順に角でつながる
 * @param {boolean} p.closed 最後の辺と最初の辺もつながる（ぐるりと囲う）
 * @param {number} p.panelWMm
 * @param {number} p.spacingMm 柱間隔の上限
 * @param {number} p.fenceHeightMm 0 なら判定しない
 * @param {number} p.blockHeightMm ブロックの上に建てる場合の塀の高さ。0 なら地面に直接
 */
export function calculate(p) {
  const errors = [];
  const sides = Array.isArray(p.sidesMm) ? p.sidesMm.map((v) => Math.round(Number(v))) : [];
  if (sides.length === 0) errors.push("辺の長さを1つ以上入力してください。");
  if (sides.length > LIMITS.maxSides) errors.push(`辺は${LIMITS.maxSides}本までです。`);
  if (sides.some((v) => !Number.isFinite(v) || v <= 0)) errors.push("辺の長さは0より大きい数で入力してください。");
  if (sides.some((v) => v > LIMITS.sideMaxMm)) errors.push("1辺は200mまでです。");
  const closed = Boolean(p.closed);
  if (closed && sides.length < 3) errors.push("ぐるりと囲う場合は辺を3本以上入力してください。");

  const panelWMm = Math.round(Number(p.panelWMm));
  if (!Number.isFinite(panelWMm) || panelWMm < LIMITS.panelMinMm || panelWMm > LIMITS.panelMaxMm)
    errors.push(`パネル幅は${LIMITS.panelMinMm}〜${LIMITS.panelMaxMm}mmで入力してください。`);
  const spacingMm = Math.round(Number(p.spacingMm));
  if (!Number.isFinite(spacingMm) || spacingMm < LIMITS.spacingMinMm || spacingMm > LIMITS.spacingMaxMm)
    errors.push(`柱間隔は${LIMITS.spacingMinMm}〜${LIMITS.spacingMaxMm}mmで入力してください。`);
  const fenceHeightMm = Math.round(Number(p.fenceHeightMm) || 0);
  const blockHeightMm = Math.round(Number(p.blockHeightMm) || 0);
  if (fenceHeightMm < 0 || blockHeightMm < 0 || fenceHeightMm > LIMITS.heightMaxMm || blockHeightMm > LIMITS.heightMaxMm)
    errors.push("高さは0〜5000mmで入力してください。");

  if (errors.length) return { ok: false, errors };

  const perSide = sides.map((len) => splitSide(len, panelWMm, spacingMm));
  const sum = (k) => perSide.reduce((s, x) => s + x[k], 0);
  const corners = closed ? sides.length : sides.length - 1;
  const openEnds = closed ? 0 : 2;
  const totalLengthMm = sides.reduce((s, v) => s + v, 0);

  const checks = [];
  const notes = [];

  if (spacingMm > panelWMm)
    notes.push("柱間隔がパネル幅より広いため、柱は連結部と端部だけに立ちます（中間柱は出ません）。");

  if (fenceHeightMm >= WINDY_HEIGHT_MM && spacingMm > POST_SPACING_MM.windy) {
    checks.push({
      status: "info",
      title: "高さ1400mm以上で柱間隔が1000mmを超えている",
      detail: `LIXIL 施工説明書 ME-2143 は「H1400 および風当りの強い場所」で柱の間隔を1000mm以内としています。` +
        `ご検討の製品の説明書で、この高さの柱間隔を確認してください（本ツールは入力された柱間隔 ${spacingMm}mm で数えています）。`,
    });
  }

  if (blockHeightMm > 0) {
    if (fenceHeightMm > 0) {
      const total = blockHeightMm + fenceHeightMm;
      const ok = total <= MAKER_TOTAL_HEIGHT_MAX_MM;
      checks.push({
        status: ok ? "ok" : "ng",
        title: `ブロック＋フェンスの総高さ ${(total / 1000).toFixed(2)}m（メーカー指示は2.2m以下）`,
        detail: ok
          ? `ブロック ${blockHeightMm}mm ＋ フェンス ${fenceHeightMm}mm ＝ ${total}mm。LIXIL 施工説明書の「ブロック塀の総高さ（フェンス含む）は 2.2m を超えない」に収まっています。`
          : `ブロック ${blockHeightMm}mm ＋ フェンス ${fenceHeightMm}mm ＝ ${total}mm で、2200mm を ${total - MAKER_TOTAL_HEIGHT_MAX_MM}mm 超えています。フェンスを低いサイズにするか、ブロックの段数を減らす必要があります。`,
      });
    } else {
      checks.push({
        status: "info",
        title: "フェンスの高さが未入力のため、総高さを確認していません",
        detail: "ブロックの上に建てる場合、LIXIL 施工説明書はブロックとフェンスを合わせた総高さを2.2m以下としています。",
      });
    }
    if (blockHeightMm > REI_BLOCK_MAX_HEIGHT_MM) {
      checks.push({
        status: "ng",
        title: "ブロック塀そのものが2.2mを超えている",
        detail: "建築基準法施行令 第62条の8 第一号は補強コンクリートブロック造の塀の高さを2.2m以下としています。",
      });
    }
  }

  const smallCuts = perSide.filter((s) => s.cutMm !== null && s.cutMm < POST_OFFSET_MAX_MM * 2).length;
  if (smallCuts > 0)
    notes.push(`端材が${POST_OFFSET_MAX_MM * 2}mm未満になる辺が${smallCuts}本あります。説明書は柱を連結部・端部から${POST_OFFSET_MAX_MM}mm以内に置くことを許すため、柱を1本減らせる配置がありえますが、本ツールは多めの側で数えています。`);

  return {
    ok: true,
    input: { sidesMm: sides, closed, panelWMm, spacingMm, fenceHeightMm, blockHeightMm },
    perSide,
    totals: {
      lengthMm: totalLengthMm,
      panels: sum("panels"),
      fullPanels: sum("fullPanels"),
      cutPanels: perSide.filter((s) => s.cutMm !== null).length,
      posts: sum("posts"),
      intermediatePosts: sum("intermediatePosts"),
      joints: sum("joints"),
      corners,
      cornerPosts: corners * CORNER_POSTS,
      openEnds,
    },
    checks,
    ngCount: checks.filter((c) => c.status === "ng").length,
    notes,
  };
}

/** "10, 5.5 8" のような m 単位の文字列を mm の配列にする。読めない値は NaN のまま返す */
export function parseSidesM(text) {
  return String(text)
    .split(/[,\s、，]+/)
    .filter((s) => s !== "")
    .map((s) => Math.round(Number(s.replace(/[ｍm]$/i, "")) * 1000));
}
