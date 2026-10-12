// スロープの長さ・踊場・幅の計算（建築基準法施行令とバリアフリー法の3基準）
//
// 根拠はすべて e-Gov 法令API v2 で条文 XML を取得し逐語確認したもの（2026-10-12）。
//   建築基準法施行令（昭和25年政令第338号）
//     https://laws.e-gov.go.jp/api/2/law_data/325CO0000000338
//     第26条 「階段に代わる傾斜路は…一 勾配は、八分の一をこえないこと。」
//            「２ 前三条の規定（けあげ及び踏面に関する部分を除く。）は、前項の傾斜路に準用する。」
//     第25条 「階段には、手すりを設けなければならない。」「４ 前三項の規定は、高さ一メートル以下の階段の部分には、適用しない。」
//   高齢者、障害者等の移動等の円滑化の促進に関する法律施行令（平成18年政令第379号）
//     https://laws.e-gov.go.jp/api/2/law_data/418CO0000000379
//     第13条 一 「勾配が十二分の一を超え、又は高さが十六センチメートルを超える傾斜がある部分には、手すりを設けること。」
//     第19条第2項第4号（建築物の傾斜路）
//       イ 「幅は、階段に代わるものにあっては百二十センチメートル以上、階段に併設するものにあっては九十センチメートル以上」
//       ロ 「勾配は、十二分の一を超えないこと。ただし、高さが十六センチメートル以下のものにあっては、八分の一を超えないこと。」
//       ハ 「高さが七十五センチメートルを超えるものにあっては、高さ七十五センチメートル以内ごとに踏幅が百五十センチメートル以上の踊場を設けること。」
//     第19条第2項第7号ニ（敷地内の通路の傾斜路）
//       (1)(2) は第4号と同じ数値（「段に代わる」「段に併設する」）
//       (3) 「高さが七十五センチメートルを超えるもの（勾配が二十分の一を超えるものに限る。）にあっては…踊場を設けること。」
//   建築物移動等円滑化誘導基準（平成18年国土交通省令第114号）
//     https://laws.e-gov.go.jp/api/2/law_data/418M60000800114
//     第6条（建築物の傾斜路）
//       一 幅 150cm以上（階段に代わる）／120cm以上（階段に併設）  二 勾配 1/12 以下
//       三 高さ75cm超は75cm以内ごとに踏幅150cm以上の踊場  四 「高さが十六センチメートルを超える傾斜がある部分には、両側に手すり」
//     第11条第1項第6号（敷地内の通路の傾斜路）
//       イ 幅 150cm以上（段に代わる）／120cm以上（段に併設）  ロ 「勾配は、十五分の一を超えないこと。」
//       ハ 踊場は第6条と同じ（ただし「勾配が二十分の一を超えるものに限る」）
//       ニ 「高さが十六センチメートルを超え、かつ、勾配が二十分の一を超える傾斜がある部分には、両側に手すり」
//
// 改正状況（2026-10-12 確認）: 施行令・誘導基準とも law_revisions に未施行（UnEnforced）の版なし。
// 建築基準法施行令は 2026-11-01 施行の改正（令和8年政令第284号）があるが、第26条は現行と同一。
//
// 計算（すべて mm の整数で行い、表示のときだけ丸める）:
//   傾斜部分の水平長さ ＝ 高低差 × 勾配の分母（勾配 1/n）
//   踊場の数 ＝ ⌈高低差 ÷ 750⌉ − 1（踊場が要る場合。75cm ちょうどなら 0）
//   全長（水平）＝ 傾斜部分の水平長さ ＋ 踊場の数 × 1500
//   斜面に沿った長さ ＝ √(傾斜部分の水平長さ² ＋ 高低差²)
// 上端・下端の平らな部分（乗り込み・待機の場所）は条文に寸法が無いので全長に含めない。
// 全長は「基準を満たす最小値」であり、踊場の踏幅を150cm ちょうどにした場合の値。

export const LANDING_RISE_MAX_MM = 750; // 「高さ七十五センチメートル以内ごとに」
export const LANDING_DEPTH_MIN_MM = 1500; // 「踏幅が百五十センチメートル以上」
export const LOW_RISE_MM = 160; // 「高さが十六センチメートル以下」
export const GENTLE_DENOM = 20; // 「勾配が二十分の一を超えるものに限る」
export const HANDRAIL_EXEMPT_RISE_MM = 1000; // 令25条4項「高さ一メートル以下の階段の部分には、適用しない」

// 場所: building（建築物の中の傾斜路）／site（敷地内の通路の傾斜路＝屋外の玄関アプローチ等）
// 併設: replace（階段・段に代わる）／beside（階段・段に併設する）
export const STANDARDS = {
  bsl: {
    label: "建築基準法施行令 第26条",
    short: "建築基準法",
    role: "すべての建築物の「階段に代わる傾斜路」に掛かる最低限の規定",
    article: "建築基準法施行令 第26条第1項第1号",
    places: ["building", "site"],
    denom: () => 8,
    widthMm: () => null, // 第23条の準用（建物用途で異なる）。本ツールでは扱わない
    landingNeeded: () => false, // 第26条は踊場の高さ間隔を定めていない
    handrail: (riseMm) =>
      riseMm > HANDRAIL_EXEMPT_RISE_MM
        ? { need: true, text: "必要（令第25条を準用。高さ1m以下の部分は不要）" }
        : { need: false, text: "不要（高さ1m以下。令第25条第4項を準用）" },
  },
  enkatsu: {
    label: "バリアフリー法 建築物移動等円滑化基準",
    short: "円滑化基準",
    role: "店舗・病院・共同住宅など一定の用途・規模の建築物で、適合が義務または努力義務となる基準（戸建住宅は対象外）",
    article: {
      building: "バリアフリー法施行令 第19条第2項第4号・第13条",
      site: "バリアフリー法施行令 第19条第2項第7号ニ・第13条",
    },
    places: ["building", "site"],
    denom: (riseMm) => (riseMm <= LOW_RISE_MM ? 8 : 12),
    widthMm: (beside) => (beside ? 900 : 1200),
    landingNeeded: (riseMm, denom, place) =>
      riseMm > LANDING_RISE_MAX_MM && (place === "building" || denom < GENTLE_DENOM),
    handrail: (riseMm, denom) =>
      denom < 12 || riseMm > LOW_RISE_MM
        ? { need: true, text: "必要（勾配1/12超 または 高さ16cm超。施行令第13条）" }
        : { need: false, text: "不要（勾配1/12以下 かつ 高さ16cm以下）" },
  },
  yudo: {
    label: "バリアフリー法 建築物移動等円滑化誘導基準",
    short: "誘導基準",
    role: "より望ましい水準として国が示す基準（認定を受ける建築物の基準）",
    article: {
      building: "誘導基準 第6条",
      site: "誘導基準 第11条第1項第6号",
    },
    places: ["building", "site"],
    denom: (_riseMm, place) => (place === "site" ? 15 : 12),
    widthMm: (beside) => (beside ? 1200 : 1500),
    landingNeeded: (riseMm, denom, place) =>
      riseMm > LANDING_RISE_MAX_MM && (place === "building" || denom < GENTLE_DENOM),
    handrail: (riseMm, denom, place) => {
      const need = riseMm > LOW_RISE_MM && (place === "building" || denom < GENTLE_DENOM);
      if (need) return { need: true, text: "両側に必要" + (place === "site" ? "（高さ16cm超 かつ 勾配1/20超）" : "（高さ16cm超）") };
      return { need: false, text: place === "site" ? "不要（高さ16cm以下 または 勾配1/20以下）" : "不要（高さ16cm以下）" };
    },
  },
};
export const STANDARD_ORDER = ["bsl", "enkatsu", "yudo"];

export const LIMITS = {
  riseMm: [10, 3000],
  denom: [1, 50],
  availableMm: [0, 100000],
};

// 踊場の数（踊場が要る場合）。75cm ちょうどは 0、1mm 超えると 1。
export function landingCount(riseMm) {
  if (riseMm <= LANDING_RISE_MAX_MM) return 0;
  return Math.ceil(riseMm / LANDING_RISE_MAX_MM) - 1;
}

function articleOf(std, place) {
  return typeof std.article === "string" ? std.article : std.article[place];
}

// 指定した勾配 1/denom で、ある基準のもとに作った場合の寸法と適否。
export function layout(key, riseMm, denom, place, beside) {
  const std = STANDARDS[key];
  const maxDenom = std.denom(riseMm, place);
  const gradientOk = denom >= maxDenom;
  const landings = std.landingNeeded(riseMm, denom, place) ? landingCount(riseMm) : 0;
  const runMm = riseMm * denom;
  const totalMm = runMm + landings * LANDING_DEPTH_MIN_MM;
  return {
    key,
    article: articleOf(std, place),
    maxDenom,
    denom,
    gradientOk,
    landings,
    runMm,
    totalMm,
    slopeLengthMm: Math.hypot(runMm, riseMm),
    widthMm: std.widthMm(beside),
    handrail: std.handrail(riseMm, denom, place),
  };
}

// 基準の上限勾配で作った場合（＝その基準を満たす最短の長さ）
export function minimumLayout(key, riseMm, place, beside) {
  const d = STANDARDS[key].denom(riseMm, place);
  return layout(key, riseMm, d, place, beside);
}

// 確保できる水平長さ availableMm の中で、その基準を満たして解消できる最大の高低差（mm・整数）。
// 全長は高低差について単調非減少なので二分探索でよい（テストで単調性を確かめている）。
export function maxRiseWithin(key, availableMm, place) {
  const fits = (r) => minimumLayout(key, r, place, false).totalMm <= availableMm;
  if (!fits(1)) return 0;
  let lo = 1;
  let hi = Math.max(1, Math.floor(availableMm)); // 勾配の分母は必ず1以上なので高低差は長さを超えない
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export const toDegrees = (denom) => (Math.atan(1 / denom) * 180) / Math.PI;
export const toPercent = (denom) => 100 / denom;

function within(name, v, [lo, hi], errors) {
  if (!Number.isFinite(v)) errors.push(`${name}を数値で入力してください。`);
  else if (v < lo || v > hi) errors.push(`${name}は ${lo}〜${hi} の範囲で入力してください。`);
}

// input: { riseMm, place, beside, denom（任意: 0/null で指定なし）, availableMm（任意: 0 で指定なし） }
export function calculate(input) {
  const errors = [];
  const riseMm = Math.round(Number(input.riseMm));
  const place = input.place === "building" ? "building" : input.place === "site" ? "site" : null;
  if (!place) errors.push("場所を選んでください。");
  within("高低差(mm)", riseMm, LIMITS.riseMm, errors);
  const denomRaw = input.denom === null || input.denom === undefined || input.denom === "" ? 0 : Number(input.denom);
  const denom = denomRaw ? Math.round(denomRaw) : 0;
  if (denom) {
    within("勾配の分母", denom, LIMITS.denom, errors);
    if (Number.isFinite(denomRaw) && denomRaw !== denom) errors.push("勾配の分母は整数で入力してください（例: 15 → 1/15）。");
  }
  const availableMm = Math.round(Number(input.availableMm ?? 0) || 0);
  within("確保できる長さ(mm)", availableMm, LIMITS.availableMm, errors);
  if (errors.length) return { ok: false, errors };

  const beside = !!input.beside;
  const minimum = STANDARD_ORDER.map((k) => {
    const m = minimumLayout(k, riseMm, place, beside);
    return {
      ...m,
      fitsAvailable: availableMm > 0 ? m.totalMm <= availableMm : null,
      maxRiseInAvailable: availableMm > 0 ? maxRiseWithin(k, availableMm, place) : null,
    };
  });
  const chosen = denom
    ? STANDARD_ORDER.map((k) => {
        const m = layout(k, riseMm, denom, place, beside);
        return { ...m, fitsAvailable: availableMm > 0 ? m.totalMm <= availableMm : null };
      })
    : null;

  return {
    ok: true,
    input: { riseMm, place, beside, denom, availableMm },
    minimum,
    chosen,
  };
}
