// セットバック（2項道路）の後退距離・後退面積と、建てられる建築面積・延べ面積
//
// 根拠（2026-10-14 に e-Gov 法令API v2 で逐語確認）:
//   建築基準法（昭和25年法律第201号）現行 2026-05-27 施行版  https://laws.e-gov.go.jp/api/2/law_data/325AC0000000201
//     第42条第1項 「幅員四メートル（特定行政庁が…指定する区域内においては、六メートル。…）以上のもの」
//     第42条第2項 「…幅員四メートル未満の道で、特定行政庁の指定したものは、…同項の道路とみなし、その中心線からの水平距離
//                  二メートル（同項の規定により指定された区域内においては、三メートル（特定行政庁が周囲の状況により避難及び
//                  通行の安全上支障がないと認める場合は、二メートル）。…）の線をその道路の境界線とみなす。
//                  ただし、当該道がその中心線からの水平距離二メートル未満で崖地、川、線路敷地その他これらに類するものに沿う
//                  場合においては、当該崖地等の道の側の境界線及びその境界線から道の側に水平距離四メートルの線をその道路の
//                  境界線とみなす。」
//     第42条第3項 中心線から 1.35m以上2m未満・崖地等から 2.7m以上4m未満の範囲で特定行政庁が別に指定できる（本ツールの対象外）
//     第43条第1項 「建築物の敷地は、道路…に二メートル以上接しなければならない。」
//     第52条第1項 指定容積率（十分の五〜十分の百三十のうち都市計画で定めるもの）
//     第52条第2項 「前面道路…の幅員が十二メートル未満である建築物の容積率は、当該前面道路の幅員のメートルの数値に、
//                  次の各号に掲げる区分に従い、当該各号に定める数値を乗じたもの以下でなければならない。」
//                  一 低層住居系 十分の四／二 中高層・住居系 十分の四（指定区域 十分の六）／三 その他 十分の六（指定区域 十分の四又は十分の八）
//     第53条第1項 建ぺい率 ＝ 建築面積の敷地面積に対する割合（十分の三〜十分の八）
//   建築基準法施行令（昭和25年政令第338号）現行 2025-12-01 施行版  https://laws.e-gov.go.jp/api/2/law_data/325CO0000000338
//     第2条第1項第1号 「ただし、法第四十二条第二項、第三項又は第五項の規定によつて道路の境界線とみなされる線と道との間の部分の
//                       敷地は、算入しない。」
//
// 改正状況（2026-10-14 確認）: 法42条・43条・53条は未施行の改正4件（2026-11-26・2027-01-22・2027-05-26・2028-07-30）すべてで同一。
// 法52条は 2026-11-26 施行版で第1項（号の追加）と第8項が変わるが、第2項は同一。施行令第2条は 2026-11-01 施行版でも同一。
//
// 計算（長さは mm、面積は mm² の整数で行い、表示のときだけ m・㎡ に直す）:
//   両側に宅地（通常）: 後退距離 ＝ 中心線からの距離（2m または 3m）− 現況幅員 ÷ 2
//   向かい側が崖地・川・線路敷地: 後退距離 ＝ 4m − 現況幅員（拡幅分をすべてこちら側で負う）
//   後退面積 ＝ 後退距離 × 間口（道路に接する長さ）
//   有効敷地面積 ＝ 敷地面積 − 後退面積（令2条1項1号）
//   前面道路の幅員（法52条2項）＝ みなし境界線の間の幅（2m×2 ＝ 4m、6m区域で 3m×2 ＝ 6m、崖地側 4m）
//   容積率の上限 ＝ min(指定容積率, 前面道路の幅員(m) × 乗数)。幅員12m以上なら指定容積率のみ
//
// 仮定（本文にも明記）:
//   - 中心線は「現況の道の中央」とする。中心線の位置は特定行政庁が判断する
//   - 敷地は道に沿ってまっすぐ接し、後退部分は「後退距離 × 間口」の長方形とする。隅切りは引かない（有効敷地面積は大きく出る側）
//   - 前面道路はこの道1本とする（2以上ある場合、法52条2項は幅員の最大のものを使う）
//
// 扱わないもの: 第42条第3項の別指定、6m区域で幅員4m以上6m未満の道（第42条第4項・第5項）、6m区域の崖地側の片側後退
// （但し書の「四メートル」が6m区域で読み替わるかを条文だけで決められない）、隅切り、角地の建ぺい率加算、
// 特定道路による容積率の緩和（法52条9項）、道路斜線制限、相続税・固定資産税の扱い。

export const CENTER_STD_MM = 2000; // 法42条2項「中心線からの水平距離二メートル」
export const CENTER_SIX_MM = 3000; // 同「指定された区域内においては、三メートル」
export const CLIFF_MM = 4000; // 同ただし書「境界線から道の側に水平距離四メートル」
export const TWO_KOU_MAX_MM = 4000; // 同「幅員四メートル未満の道」
export const SIX_ZONE_WIDTH_MM = 6000; // 法42条1項「六メートル」
export const FRONTAGE_MIN_MM = 2000; // 法43条1項「二メートル以上接しなければならない」
export const ROAD_RULE_MAX_MM = 12000; // 法52条2項「幅員が十二メートル未満」

// 法52条1項各号・2項各号・53条1項各号に現れる数値
export const FAR_CHOICES_PCT = [50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300];
export const ROAD_FACTOR_TENTHS = [4, 6, 8];
export const COVERAGE_CHOICES_PCT = [30, 40, 50, 60, 70, 80];

export const LIMITS = {
  roadCm: [50, 3000],
  frontageCm: [50, 10000],
  siteM2: [10, 100000],
};

export const m2ToMm2 = (m2) => Math.round(m2 * 1e6);

// 後退距離（mm）。zone: "std"|"six"、side: "both"|"cliff"。
// 戻り値 { kind, setbackMm, deemedWidthMm }。kind:
//   "setback"   … 2項道路として後退が生じる
//   "wide"      … 幅員が既に4m以上（6m区域では6m以上）で、2項道路の後退は生じない
//   "unsupported" … 本ツールでは判定しない組み合わせ（reason つき）
export function setbackOf(roadMm, zone, side) {
  if (zone === "six" && roadMm >= TWO_KOU_MAX_MM && roadMm < SIX_ZONE_WIDTH_MM)
    return { kind: "unsupported", reason: "6m区域内の幅員4m以上6m未満の道は、第42条第4項・第5項の扱いになります。本ツールでは判定しません。" };
  const full = zone === "six" ? SIX_ZONE_WIDTH_MM : TWO_KOU_MAX_MM;
  if (roadMm >= full) return { kind: "wide", setbackMm: 0, deemedWidthMm: roadMm };
  if (side === "cliff") {
    if (zone === "six")
      return { kind: "unsupported", reason: "6m区域で向かい側が崖地・川などの場合は、本ツールでは判定しません。" };
    return { kind: "setback", setbackMm: CLIFF_MM - roadMm, deemedWidthMm: CLIFF_MM };
  }
  const center = zone === "six" ? CENTER_SIX_MM : CENTER_STD_MM;
  // roadMm は cm 入力 × 10 なので偶数。÷2 は整数になる
  return { kind: "setback", setbackMm: center - roadMm / 2, deemedWidthMm: 2 * center };
}

// 法52条2項による容積率の上限（%）。幅員12m以上なら null（制限なし）。
export function roadFarPct(widthMm, factorTenths) {
  if (widthMm >= ROAD_RULE_MAX_MM) return null;
  // 幅員(m) × 乗数 × 100 ＝ widthMm/1000 × factor/10 × 100 ＝ widthMm × factor / 100
  return (widthMm * factorTenths) / 100;
}

function within(name, v, [lo, hi], errors) {
  if (!Number.isFinite(v)) errors.push(`${name}を数値で入力してください。`);
  else if (v < lo || v > hi) errors.push(`${name}は ${lo}〜${hi} の範囲で入力してください。`);
}

// input: { roadCm, zone, side, frontageCm, siteM2, coveragePct, farPct, roadFactorTenths }
export function calculate(input) {
  const errors = [];
  const roadCm = Math.round(Number(input.roadCm));
  const frontageCm = Math.round(Number(input.frontageCm));
  const siteM2 = Number(input.siteM2);
  const coveragePct = Number(input.coveragePct);
  const farPct = Number(input.farPct);
  const roadFactorTenths = Number(input.roadFactorTenths);
  const zone = input.zone === "six" ? "six" : "std";
  const side = input.side === "cliff" ? "cliff" : "both";

  within("今の道の幅(cm)", roadCm, LIMITS.roadCm, errors);
  within("間口(cm)", frontageCm, LIMITS.frontageCm, errors);
  within("敷地面積(㎡)", siteM2, LIMITS.siteM2, errors);
  if (!COVERAGE_CHOICES_PCT.includes(coveragePct)) errors.push("指定建ぺい率を選んでください。");
  if (!FAR_CHOICES_PCT.includes(farPct)) errors.push("指定容積率を選んでください。");
  if (!ROAD_FACTOR_TENTHS.includes(roadFactorTenths)) errors.push("前面道路の幅員に掛ける数値を選んでください。");
  if (errors.length) return { ok: false, errors };

  const roadMm = roadCm * 10;
  const frontageMm = frontageCm * 10;
  const sb = setbackOf(roadMm, zone, side);
  if (sb.kind === "unsupported") return { ok: false, errors: [sb.reason] };

  const siteMm2 = m2ToMm2(siteM2);
  const setbackAreaMm2 = sb.setbackMm * frontageMm;
  if (setbackAreaMm2 >= siteMm2)
    return { ok: false, errors: ["後退面積が敷地面積以上になります。間口・敷地面積を確認してください。"] };
  const effectiveMm2 = siteMm2 - setbackAreaMm2;

  const byRoad = roadFarPct(sb.deemedWidthMm, roadFactorTenths);
  const farLimitPct = byRoad === null ? farPct : Math.min(farPct, byRoad);

  return {
    ok: true,
    input: { roadCm, zone, side, frontageCm, siteM2, coveragePct, farPct, roadFactorTenths },
    kind: sb.kind,
    setbackMm: sb.setbackMm,
    deemedWidthMm: sb.deemedWidthMm,
    setbackAreaMm2,
    siteMm2,
    effectiveMm2,
    frontageOk: frontageMm >= FRONTAGE_MIN_MM,
    roadFarPct: byRoad,
    farLimitPct,
    roadRuleBinds: byRoad !== null && byRoad < farPct,
    maxBuildingMm2: (effectiveMm2 * coveragePct) / 100,
    maxFloorMm2: (effectiveMm2 * farLimitPct) / 100,
    // 後退も前面道路の制限も考えずに計算した場合（よくある誤り）との比較
    naiveBuildingMm2: (siteMm2 * coveragePct) / 100,
    naiveFloorMm2: (siteMm2 * farPct) / 100,
  };
}
