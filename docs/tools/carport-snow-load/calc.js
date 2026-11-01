// カーポートの積雪荷重（建築基準法施行令 第86条の積雪荷重と、製品の耐積雪荷重の比較）
//
// 根拠（2026-11-01 に逐語確認）:
//   建築基準法施行令（昭和25年政令第338号）第86条（e-Gov 法令API v2・現行 2026-11-01 施行版 325CO0000000338_20261101_508CO0000000284）
//     https://laws.e-gov.go.jp/api/2/law_data/325CO0000000338
//     第1項 「積雪荷重は、積雪の単位荷重に屋根の水平投影面積及びその地方における垂直積雪量を乗じて計算しなければならない。」
//     第2項 「前項に規定する積雪の単位荷重は、積雪量一センチメートルごとに一平方メートルにつき二十ニュートン以上としなければならない。
//            ただし、特定行政庁は、規則で、国土交通大臣が定める基準に基づいて多雪区域を指定し、その区域につきこれと異なる定めをすることができる。」
//     第3項 「第一項に規定する垂直積雪量は、国土交通大臣が定める基準に基づいて特定行政庁が規則で定める数値としなければならない。」
//     第4項 「屋根の積雪荷重は、屋根に雪止めがある場合を除き、その勾配が六十度以下の場合においては、その勾配に応じて
//            第一項の積雪荷重に次の式によつて計算した屋根形状係数（特定行政庁が…規則でこれと異なる数値を定めた場合においては、その定めた数値）
//            を乗じた数値とし、その勾配が六十度を超える場合においては、零とすることができる。 μｂ＝√ｃｏｓ（１．５β）」
//     第5項 「屋根面における積雪量が不均等となるおそれのある場合においては、その影響を考慮して積雪荷重を計算しなければならない。」
//     第6項 「雪下ろしを行う慣習のある地方においては、その地方における垂直積雪量が一メートルを超える場合においても、積雪荷重は、
//            雪下ろしの実況に応じて垂直積雪量を一メートルまで減らして計算することができる。」
//     第7項 減らして計算した建築物は「その出入口、主要な居室又はその他の見やすい場所に、その軽減の実況その他必要な事項を表示しなければならない。」
//   多雪区域の単位荷重の実例: 長野県「構造計算における各基準値について」（更新日 2026-10-01）
//     「垂直積雪量dが1m以上となる区域」→「30N/(m2・cm)以上」
//   製品の耐積雪の表示例: LIXIL 取扱説明書 TOS00380（assets.lixil.com）
//     「本製品は、積雪荷重600N／m2（61.2Kg／m2）に耐えられる設計になっています。」
//     「安心してお使いいただける積雪量の目安」新雪（雪比重0.3）20cm・締雪（0.5）12cm・粗目雪（0.7）8cm
//
// 計算（荷重は 1㎡あたりの N。屋根の面積を掛ける前の値で比べる。製品の耐積雪荷重も 1㎡あたりで表示されるため）:
//   使う垂直積雪量 d' ＝ 雪下ろしの軽減を使い、かつ d > 100cm なら 100cm、それ以外は d
//   屋根形状係数 μb ＝ 雪止めあり → 1 ／ β ≧ 60° → 0 ／ それ以外 → √cos(1.5β)
//   積雪荷重 S ＝ 単位荷重 w × d' × μb  → N/m² の整数に【切り上げ】（製品が「足りる」と誤って言わない側）
//   判定 ＝ 製品の耐積雪荷重 P ≧ S
//
// 製品の「○cm相当」表記の読み替え: LIXIL の表示（600N/m² ＝ 新雪20cm）と同じ換算なら 1cm ＝ 600 ÷ 20 ＝ 30N/m²。
// 他社が同じ換算とは限らない（公式資料を確認できていない）ので、画面では N/m² の値で比べることを主にする。
//
// 雪の種類ごとの深さ: 雪比重 g の雪 1cm の重さは g × 1cm × 1㎡ ＝ g × 10 kg ＝ g × 98.0665 N。
//   P ÷ (g × 98.0665) を切り捨て。P＝600 で 新雪20・締雪12・粗目雪8 となり、LIXIL の表と一致する（テストで確認）。
//
// 扱わないもの: 垂直積雪量の算定式（係数が都道府県の細則ごとに違う）、特定緩勾配屋根の割増（平19国告第594号 第2第三号ホ）、
// 屋根の不均等な積雪（第5項。母屋からの落雪・吹きだまり）、風圧力（第87条）。

export const UNIT_GENERAL_N = 20; // 令86条2項「一平方メートルにつき二十ニュートン以上」
export const SLOPE_ZERO_DEG = 60; // 令86条4項「その勾配が六十度を超える場合においては、零とすることができる」（式も60度で0）
export const SNOW_OFF_CAP_CM = 100; // 令86条6項「垂直積雪量を一メートルまで減らして計算することができる」
export const N_PER_KGF = 9.80665; // 標準重力加速度（1kgf ＝ 9.80665N）
export const LIXIL_REF = { loadN: 600, depthCm: 20 }; // TOS00380「積雪荷重600N／m2」＝ 新雪（比重0.3）20cm
export const LIXIL_N_PER_CM = LIXIL_REF.loadN / LIXIL_REF.depthCm; // 30
export const SNOW_TYPES = [
  // TOS00380 の表と同じ並び・比重
  { key: "new", name: "新雪", gravity: 0.3 },
  { key: "compact", name: "締雪", gravity: 0.5 },
  { key: "granular", name: "粗目雪", gravity: 0.7 },
];

export const LIMITS = {
  depthCm: [1, 1000],
  unitN: [UNIT_GENERAL_N, 100],
  slopeDeg: [0, 90],
  productN: [1, 100000],
  productCm: [1, 1000],
};

const EPS = 1e-9;

// 屋根形状係数 μb
export function shapeFactor(slopeDeg, snowGuard) {
  if (snowGuard) return 1;
  if (slopeDeg >= SLOPE_ZERO_DEG) return 0;
  return Math.sqrt(Math.cos((1.5 * slopeDeg * Math.PI) / 180));
}

// 計算に使う垂直積雪量（cm）
export function designDepthCm(depthCm, snowOff) {
  return snowOff && depthCm > SNOW_OFF_CAP_CM ? SNOW_OFF_CAP_CM : depthCm;
}

// 1㎡あたりの積雪荷重（N・整数に切り上げ）
export function snowLoadN(unitN, depthCm, mu) {
  return Math.ceil(unitN * depthCm * mu - EPS);
}

// 耐積雪荷重 productN の製品で耐えられる垂直積雪量（cm・整数・切り捨て）。
// snowLoadN と同じ丸めで「d なら収まり、d+1 なら超える」最大の d を返す。μb＝0 なら上限なし（null）。
export function maxDepthCm(productN, unitN, mu) {
  if (mu <= 0) return null;
  let d = Math.max(0, Math.floor(productN / (unitN * mu) + EPS));
  while (snowLoadN(unitN, d + 1, mu) <= productN) d++;
  while (d > 0 && snowLoadN(unitN, d, mu) > productN) d--;
  return d;
}

// 製品の cm 表記 → N/m²（LIXIL の表示と同じ換算の場合）
export const lixilCmToN = (cm) => cm * LIXIL_N_PER_CM;

// 積雪荷重 S を、LIXIL の表示と同じ換算の cm に直す（切り上げ: その cm 以上の表示の製品なら足りる）
export const nToLixilCm = (n) => Math.ceil(n / LIXIL_N_PER_CM - EPS);

// 耐積雪荷重を雪の種類ごとの深さ（cm・切り捨て）に直す
export function depthBySnowType(productN) {
  return SNOW_TYPES.map((s) => ({ ...s, cm: Math.floor(productN / (s.gravity * 10 * N_PER_KGF) + EPS) }));
}

const inRange = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;

export function calculate(input) {
  const { zone, unitN: unitIn, depthCm, slopeDeg, snowGuard, snowOff, productMode, productValue } = input;
  const unitN = zone === "heavy" ? unitIn : UNIT_GENERAL_N;
  const errors = [];
  if (!inRange(depthCm, LIMITS.depthCm)) errors.push("垂直積雪量は 1〜1000cm で入力してください。");
  if (!inRange(unitN, LIMITS.unitN))
    errors.push("単位荷重は 20〜100 N/(㎡・cm) で入力してください（令86条2項により20未満にはできません）。");
  if (!inRange(slopeDeg, LIMITS.slopeDeg)) errors.push("屋根の勾配は 0〜90度 で入力してください。");
  const hasProduct = productValue !== null && productValue !== undefined && productValue !== "" && !Number.isNaN(productValue);
  if (hasProduct) {
    const lim = productMode === "cm" ? LIMITS.productCm : LIMITS.productN;
    if (!inRange(productValue, lim))
      errors.push(productMode === "cm" ? "製品の耐積雪（cm）は 1〜1000 で入力してください。" : "製品の耐積雪荷重は 1〜100000 N/㎡ で入力してください。");
  }
  if (errors.length) return { ok: false, errors };

  const usedDepthCm = designDepthCm(depthCm, snowOff);
  const mu = shapeFactor(slopeDeg, snowGuard);
  const loadN = snowLoadN(unitN, usedDepthCm, mu);
  const loadKgf = loadN / N_PER_KGF;

  let product = null;
  if (hasProduct) {
    const productN = productMode === "cm" ? lixilCmToN(productValue) : productValue;
    const maxD = maxDepthCm(productN, unitN, mu);
    product = {
      productN,
      fits: productN >= loadN,
      marginN: productN - loadN,
      maxDepthCm: maxD,
      // 雪下ろしの軽減を使う地方では、1m 分に耐えれば垂直積雪量にかかわらず足りる
      anyDepthWithSnowOff: snowOff && (maxD === null || maxD >= SNOW_OFF_CAP_CM),
      bySnowType: depthBySnowType(productN),
    };
  }

  return {
    ok: true,
    input: { ...input, unitN },
    unitN,
    usedDepthCm,
    reduced: usedDepthCm !== depthCm,
    mu,
    slopeOver60: !snowGuard && slopeDeg > SLOPE_ZERO_DEG,
    loadN,
    loadKgf,
    lixilCm: nToLixilCm(loadN),
    product,
  };
}
