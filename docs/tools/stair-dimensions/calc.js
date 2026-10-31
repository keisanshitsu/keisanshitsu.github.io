// 階段の寸法計算（階高 → 段数・蹴上げ・踏面・水平長さ、建築基準法施行令 第23〜25条と高齢者向け基準）
//
// 根拠はすべて e-Gov 法令API v2 で条文を取得し逐語確認したもの（2026-10-31）。
//   建築基準法施行令（昭和25年政令第338号）
//     https://laws.e-gov.go.jp/api/2/law_data/325CO0000000338
//     第23条第1項 「階段及びその踊場の幅並びに階段の蹴上げ及び踏面の寸法は、次の表によらなければならない。」
//       表（単位 cm）
//         （一）小学校（義務教育学校の前期課程を含む。）における児童用のもの            幅 一四〇以上 蹴上げ 一六以下 踏面 二六以上
//         （二）中学校…高等学校若しくは中等教育学校における生徒用のもの又は物品販売業…を営む店舗で
//               床面積の合計が千五百平方メートルを超えるもの、劇場、映画館、演芸場、観覧場、
//               公会堂若しくは集会場における客用のもの                                幅 一四〇以上 蹴上げ 一八以下 踏面 二六以上
//         （三）直上階の居室の床面積の合計が二百平方メートルを超える地上階又は居室の床面積の
//               合計が百平方メートルを超える地階若しくは地下工作物内におけるもの          幅 一二〇以上 蹴上げ 二〇以下 踏面 二四以上
//         （四）（一）から（三）までに掲げる階段以外のもの                              幅 七五以上   蹴上げ 二二以下 踏面 二一以上
//       ただし書 「屋外階段の幅は、第百二十条又は第百二十一条の規定による直通階段にあつては九十センチメートル以上、
//                 その他のものにあつては六十センチメートル以上、住宅の階段（共同住宅の共用の階段を除く。）の
//                 蹴上げは二十三センチメートル以下、踏面は十五センチメートル以上とすることができる。」
//     第23条第2項 「回り階段の部分における踏面の寸法は、踏面の狭い方の端から三十センチメートルの位置において測る」
//     第23条第3項 「…手すり等が設けられた場合における第一項の階段及びその踊場の幅は、手すり等の幅が
//                 十センチメートルを限度として、ないものとみなして算定する。」
//     第23条第4項 大臣が定めた構造方法（平成26年国土交通省告示第709号）による特例。本ツールでは扱わない
//     第24条 「前条第一項の表の（一）又は（二）に該当する階段でその高さが三メートルをこえるものにあつては
//             高さ三メートル以内ごとに、その他の階段でその高さが四メートルをこえるものにあつては高さ四メートル
//             以内ごとに踊場を設けなければならない。」「２ …直階段の踊場の踏幅は、一・二メートル以上」
//     第25条 「階段には、手すりを設けなければならない。」
//            「２ 階段及びその踊場の両側（手すりが設けられた側を除く。）には、側壁又はこれに代わるものを設けなければならない。」
//            「３ 階段の幅が三メートルをこえる場合においては、中間に手すりを設けなければならない。ただし、
//                けあげが十五センチメートル以下で、かつ、踏面が三十センチメートル以上のものにあつては、この限りでない。」
//            「４ 前三項の規定は、高さ一メートル以下の階段の部分には、適用しない。」
//   改正状況: 2026-11-01 施行の未施行改正（令和8年政令第284号）があるが、その版の第23〜25条は現行と同一（比較済み）。
//
//   高齢者の居住の安定確保に関する法律施行規則（平成13年国土交通省令第115号）
//     https://laws.e-gov.go.jp/api/2/law_data/413M60000800115
//     第38条（加齢対応構造等の基準）
//       五 「住戸内の階段の各部の寸法は、次の各式に適合するものであること。
//            Ｔ≧１９．５　Ｒ／Ｔ≦２２／２１　５５≦Ｔ＋２Ｒ≦６５」
//          （Ｔ 踏面の寸法・Ｒ けあげの寸法、単位 cm。第4条第2号の定義。R/T≦22/21 は e-Gov 上は画像で、添付APIで確認）
//       六 「主たる共用の階段の各部の寸法は、次の各式に適合するものであること。Ｔ≧２４　５５≦Ｔ＋２Ｒ≦６５」
//       七 「便所、浴室及び住戸内の階段には、手すりを設けること。」
//     終身建物賃貸借の認可基準であり、一般の住宅に義務として掛かる規定ではない。比較の目安として並べる。
//
// 計算（長さはすべて mm の整数。判定は割り算をせず掛け算で比べるので、丸めで適否が反転しない）:
//   段数 n ＝ 蹴上げの数（上の階の床に上がる最後の1段を含む）。蹴上げ R ＝ 階高 H ÷ n
//   法令の蹴上げ上限 Rmax を満たす ⇔ H ≦ n × Rmax。最少の段数 ＝ ⌈H ÷ Rmax⌉
//   踊場: 高さ制限 Lh（3m/4m）を超える階段は、1つの区切り（連続する段）の高さを Lh 以下にする。
//     1区切りに入る最大の段数 ＝ ⌊Lh × n ÷ H⌋、区切りの数 ＝ ⌈n ÷ それ⌉、踊場の数 ＝ 区切りの数 − 1
//     （高さ ÷ Lh の切り上げより1か所多くなる場合がある——踊場は段の境目にしか置けないため）
//   直階段の水平長さ ＝（n − 1 − 踊場の数）× 踏面 T ＋ 踊場の数 × 1200
//     上の階の床を最上段の踏面として使い、踊場は踏幅 1.2m ちょうど（最小値）とした場合。
//   有効幅 ＝ 内法の幅 − 手すりの数 × max(0, 手すりの出 − 100)（第23条第3項）

export const LANDING_DEPTH_MIN_MM = 1200; // 第24条第2項「一・二メートル以上」
export const HANDRAIL_EXEMPT_HEIGHT_MM = 1000; // 第25条第4項「高さ一メートル以下」
export const HANDRAIL_IGNORE_MM = 100; // 第23条第3項「十センチメートルを限度として」
export const CENTER_RAIL_WIDTH_MM = 3000; // 第25条第3項「三メートルをこえる」
export const CENTER_RAIL_EXEMPT = { riseMaxMm: 150, treadMinMm: 300 }; // 同ただし書
export const OUTDOOR_WIDTH_MM = { direct: 900, other: 600 }; // 第23条第1項ただし書

// 階段の種別（第23条第1項の表とただし書）
export const KINDS = {
  house: {
    label: "住宅の階段（共同住宅の共用階段を除く）",
    article: "建築基準法施行令 第23条第1項ただし書（住宅）",
    widthMm: 750, // 表（四）の幅。ただし書は住宅の幅を緩和していない
    riseMaxMm: 230,
    treadMinMm: 150,
    landingHeightMm: 4000,
    elderly: "unit",
  },
  other: {
    label: "（四）上記以外（共同住宅の共用階段・事務所・小規模な店舗など）",
    article: "建築基準法施行令 第23条第1項 表（四）",
    widthMm: 750,
    riseMaxMm: 220,
    treadMinMm: 210,
    landingHeightMm: 4000,
    elderly: "common",
  },
  large: {
    label: "（三）直上階の居室が200㎡超の地上階・居室が100㎡超の地階",
    article: "建築基準法施行令 第23条第1項 表（三）",
    widthMm: 1200,
    riseMaxMm: 200,
    treadMinMm: 240,
    landingHeightMm: 4000,
    elderly: null,
  },
  assembly: {
    label: "（二）中学校・高校の生徒用、1,500㎡超の物販店舗・劇場・集会場などの客用",
    article: "建築基準法施行令 第23条第1項 表（二）",
    widthMm: 1400,
    riseMaxMm: 180,
    treadMinMm: 260,
    landingHeightMm: 3000,
    elderly: null,
  },
  elementary: {
    label: "（一）小学校の児童用",
    article: "建築基準法施行令 第23条第1項 表（一）",
    widthMm: 1400,
    riseMaxMm: 160,
    treadMinMm: 260,
    landingHeightMm: 3000,
    elderly: null,
  },
};
export const KIND_ORDER = ["house", "other", "large", "assembly", "elementary"];

// 高齢者の居住の安定確保に関する法律施行規則 第38条（mm に換算: 19.5cm → 195 など）
export const ELDERLY = {
  unit: {
    label: "高齢者向けの住戸内の階段（高齢者住まい法施行規則 第38条第5号）",
    short: "高齢者向け（住戸内）",
    treadMinMm: 195,
    ratio: [22, 21], // R/T ≦ 22/21
    sumMinMm: 550,
    sumMaxMm: 650,
  },
  common: {
    label: "共同住宅の主たる共用の階段の高齢者向け基準（同 第6号）",
    short: "高齢者向け（共用階段）",
    treadMinMm: 240,
    ratio: null, // 第6号に R/T の式は無い
    sumMinMm: 550,
    sumMaxMm: 650,
  },
};

export const LIMITS = {
  heightMm: [100, 10000],
  treadMm: [100, 600],
  widthMm: [0, 10000],
  railProjMm: [0, 300],
  availMm: [0, 50000],
};
export const MAX_ROWS = 6;
export const MAX_EXTEND = 15;

const ceilDiv = (a, b) => Math.floor((a + b - 1) / b); // 正の整数どうし

export function minSteps(heightMm, riseMaxMm) {
  return ceilDiv(heightMm, riseMaxMm);
}

// 踊場の数（第24条）。高さが制限以下なら0。段の境目にしか置けないことを考慮する。
export function landingCount(heightMm, n, landingHeightMm) {
  if (heightMm <= landingHeightMm) return 0;
  const perFlight = Math.floor((landingHeightMm * n) / heightMm); // 1区切りに入る最大の段数
  if (perFlight < 1) return null; // 1段の高さが制限を超える（実際の種別では起きない）
  return ceilDiv(n, perFlight) - 1;
}

// 法令（第23条第1項）の蹴上げ・踏面の判定
export function lawCheck(kind, heightMm, n, treadMm) {
  const k = KINDS[kind];
  return {
    riseOk: heightMm <= n * k.riseMaxMm,
    treadOk: treadMm >= k.treadMinMm,
  };
}

// 高齢者向け基準の判定（R ＝ H/n を掛け算で比べる）
export function elderlyCheck(key, heightMm, n, treadMm) {
  const e = ELDERLY[key];
  const treadOk = treadMm >= e.treadMinMm;
  const ratioOk = e.ratio ? e.ratio[1] * heightMm <= e.ratio[0] * n * treadMm : true;
  const s = n * treadMm + 2 * heightMm; // n × (T + 2R)
  const sumOk = e.sumMinMm * n <= s && s <= e.sumMaxMm * n;
  return { ok: treadOk && ratioOk && sumOk, treadOk, ratioOk, sumOk };
}

// その段数（蹴上げ）のとき、高齢者向け基準を満たす踏面の範囲（mm・整数。無ければ null）
export function elderlyTreadRange(key, heightMm, n) {
  const e = ELDERLY[key];
  const lows = [e.treadMinMm, ceilDiv(e.sumMinMm * n - 2 * heightMm, n)];
  if (e.ratio) lows.push(ceilDiv(e.ratio[1] * heightMm, e.ratio[0] * n));
  const lo = Math.max(...lows);
  const hi = Math.floor((e.sumMaxMm * n - 2 * heightMm) / n);
  return lo <= hi ? [lo, hi] : null;
}

// 有効幅（第23条第3項）
export function effectiveWidth(widthMm, railCount, railProjMm) {
  return widthMm - railCount * Math.max(0, railProjMm - HANDRAIL_IGNORE_MM);
}

export function minWidthOf(kind, place) {
  const w = KINDS[kind].widthMm;
  if (place === "outdoorDirect") return Math.min(w, OUTDOOR_WIDTH_MM.direct);
  if (place === "outdoorOther") return Math.min(w, OUTDOOR_WIDTH_MM.other);
  return w;
}

// 段数 n で作った場合の1行
export function row(kind, heightMm, n, treadMm, availMm = 0) {
  const k = KINDS[kind];
  const landings = landingCount(heightMm, n, k.landingHeightMm);
  const treads = n - 1 - landings;
  const runMm = treads * treadMm + landings * LANDING_DEPTH_MIN_MM;
  const law = lawCheck(kind, heightMm, n, treadMm);
  const elderly = k.elderly ? elderlyCheck(k.elderly, heightMm, n, treadMm) : null;
  return {
    n,
    riseMm: heightMm / n,
    treadMm,
    treads,
    landings,
    runMm,
    angleDeg: (Math.atan(heightMm / (n * treadMm)) * 180) / Math.PI,
    sumMm: treadMm + (2 * heightMm) / n, // T + 2R（表示用）
    lawOk: law.riseOk && law.treadOk,
    law,
    elderly,
    elderlyRange: k.elderly ? elderlyTreadRange(k.elderly, heightMm, n) : null,
    fits: availMm > 0 ? runMm <= availMm : null,
    // 確保できる長さに収めるときの最大の踏面（mm・切り捨て）。踏面が1枚も無い（n=1）なら null
    maxTreadInAvail:
      availMm > 0 && treads > 0 ? Math.floor((availMm - landings * LANDING_DEPTH_MIN_MM) / treads) : null,
  };
}

function within(name, v, [lo, hi], errors) {
  if (!Number.isFinite(v)) errors.push(`${name}を数値で入力してください。`);
  else if (v < lo || v > hi) errors.push(`${name}は ${lo / 10}〜${hi / 10} cm の範囲で入力してください。`);
}

// input: { kind, place: indoor|outdoorDirect|outdoorOther, heightMm, treadMm,
//          widthMm（任意: 0 で判定しない）, railCount（0/1/2）, railProjMm, availMm（任意: 0 で指定なし） }
export function calculate(input) {
  const errors = [];
  const kind = KINDS[input.kind] ? input.kind : null;
  if (!kind) errors.push("階段の種類を選んでください。");
  const place = ["indoor", "outdoorDirect", "outdoorOther"].includes(input.place) ? input.place : "indoor";
  const heightMm = Math.round(Number(input.heightMm));
  const treadMm = Math.round(Number(input.treadMm));
  const widthMm = Math.round(Number(input.widthMm ?? 0) || 0);
  const railCount = [0, 1, 2].includes(Number(input.railCount)) ? Number(input.railCount) : 0;
  const railProjMm = Math.round(Number(input.railProjMm ?? 0) || 0);
  const availMm = Math.round(Number(input.availMm ?? 0) || 0);
  within("階高", heightMm, LIMITS.heightMm, errors);
  within("踏面", treadMm, LIMITS.treadMm, errors);
  within("階段の幅", widthMm, LIMITS.widthMm, errors);
  within("手すりの出", railProjMm, LIMITS.railProjMm, errors);
  within("使える水平の長さ", availMm, LIMITS.availMm, errors);
  if (errors.length) return { ok: false, errors };

  const k = KINDS[kind];
  const nMin = minSteps(heightMm, k.riseMaxMm);

  // 高齢者向け基準を満たす最少の段数（この踏面で）。nMin から MAX_EXTEND 段先まで探す
  let nElderly = null;
  if (k.elderly) {
    for (let n = nMin; n <= nMin + MAX_EXTEND; n++) {
      if (elderlyCheck(k.elderly, heightMm, n, treadMm).ok) { nElderly = n; break; }
    }
  }
  // 第25条: 高さ1m以下の階段には第1〜3項を適用しない（1m を超える階段でも、高さ1m以下の部分は不要）
  const handrailNeeded = heightMm > HANDRAIL_EXEMPT_HEIGHT_MM;
  const nLast = Math.max(nMin + MAX_ROWS - 1, nElderly ?? 0);
  const rows = [];
  for (let n = nMin; n <= nLast; n++) {
    const r = row(kind, heightMm, n, treadMm, availMm);
    r.centerRail = centerRailNeeded(heightMm, n, treadMm, widthMm);
    rows.push(r);
  }

  const effWidthMm = widthMm > 0 ? effectiveWidth(widthMm, railCount, railProjMm) : null;
  const minWidthMm = minWidthOf(kind, place);

  return {
    ok: true,
    input: { kind, place, heightMm, treadMm, widthMm, railCount, railProjMm, availMm },
    nMin,
    nElderly,
    rows,
    treadLawOk: treadMm >= k.treadMinMm,
    width: widthMm > 0 ? { effWidthMm, minWidthMm, ok: effWidthMm >= minWidthMm } : { effWidthMm: null, minWidthMm, ok: null },
    handrailNeeded,
  };
}

// 中間手すり（第25条第3項）: 幅3m超で必要。ただし蹴上げ15cm以下（H ≦ 150n）かつ踏面30cm以上なら不要。
// 高さ1m以下の階段には適用しない（第4項）
export function centerRailNeeded(heightMm, n, treadMm, widthMm) {
  if (heightMm <= HANDRAIL_EXEMPT_HEIGHT_MM || widthMm <= CENTER_RAIL_WIDTH_MM) return false;
  return !(heightMm <= n * CENTER_RAIL_EXEMPT.riseMaxMm && treadMm >= CENTER_RAIL_EXEMPT.treadMinMm);
}
