// カーポートの建ぺい率（高い開放性の1m緩和の判定・算入面積・上限までの残り）
//
// 根拠（2026-10-13 に逐語確認）:
//   建築基準法施行令（昭和25年政令第338号）第2条第1項第2号（e-Gov 法令API v2・現行 2025-12-01 施行版）
//     https://laws.e-gov.go.jp/api/2/law_data/325CO0000000338
//     「ただし、国土交通大臣が高い開放性を有すると認めて指定する構造の建築物又はその部分については、
//       その端から水平距離一メートル以内の部分の水平投影面積は、当該建築物の建築面積に算入しない。」
//   平成5年建設省告示第1437号（国交省 告示PDF https://www.mlit.go.jp/notice/noticedata/pdf/201703/00006436.pdf）
//     一 外壁を有しない部分が連続して四メートル以上であること
//     二 柱の間隔が二メートル以上であること
//     三 天井の高さが二・一メートル以上であること
//     四 地階を除く階数が一であること
//   建築基準法（昭和25年法律第201号）第53条（e-Gov 法令API v2・現行 2026-05-27 施行版）
//     https://laws.e-gov.go.jp/api/2/law_data/325AC0000000201
//     第1項 「建築物の建築面積（同一敷地内に二以上の建築物がある場合においては、その建築面積の合計）の
//            敷地面積に対する割合（以下「建蔽率」という。）は、…当該各号に定める数値を超えてはならない。」
//            各号の数値: 十分の三〜十分の八（用途地域の指定のない区域は十分の三〜十分の七）
//     第3項第2号 「街区の角にある敷地又はこれに準ずる敷地で特定行政庁が指定するものの内にある建築物」→ 十分の一を加える
//   1m の取り方: 香川県土木部建築指導課「カーポート等の『高い開放性を有する構造の建築物』の建築面積の取扱いについて」
//     平面図で屋根先端から四方それぞれ1m後退した部分が算入部分。
//     「隣地及び他の建築物（塀等も含む）からの距離や床面積に関わらず」
//
// 改正状況（2026-10-13 確認）: 施行令第2条は 2026-11-01 施行版（令和8年政令第284号）でも同一。
// 法第53条は未施行の改正4件（2026-11-26・2027-01-22・2027-05-26・2028-07-30 施行）すべてで同一。
//
// 計算（長さは cm、面積は cm² の整数で行い、表示のときだけ ㎡ に直す）:
//   屋根の水平投影面積 ＝ 間口 × 奥行
//   緩和あり（4要件をすべて満たす）: 算入面積 ＝ max(0, 間口 − 200) × max(0, 奥行 − 200)
//   緩和なし: 算入面積 ＝ 屋根の水平投影面積（軒の出の控除はしない ＝ 多く出る側。理由は下）
//   建ぺい率 ＝ (既存建物の建築面積 ＋ カーポートの算入面積) ÷ 敷地面積
//   判定は整数で: 合計 × 100 ≦ 上限(%) × 敷地面積
//
// 緩和なしで軒の出を控除しない理由: 令2条1項2号の本文は「柱の中心線で囲まれた部分」＋1m以上の軒の出を基準にするが、
// 片側支持のカーポートでは柱の中心線で囲まれた部分が定まらず、取扱いが特定行政庁で分かれうる。
// 屋根全体を算入すれば建ぺい率は必ず高く出る（「収まる」と誤って言わない）側に倒れる。
//
// 扱わないもの: 防火・準防火地域の耐火建築物等による加算（法53条3項1号）と適用除外（同条6項1号）、
// 母屋に接続するカーポート、確認申請の要否、容積率。

export const RELIEF_EDGE_CM = 100; // 「その端から水平距離一メートル以内の部分」
export const REQ_OPEN_RUN_CM = 400; // 告示一「外壁を有しない部分が連続して四メートル以上」
export const REQ_COLUMN_SPACING_CM = 200; // 告示二「柱の間隔が二メートル以上」
export const REQ_CEILING_CM = 210; // 告示三「天井の高さが二・一メートル以上」
export const CORNER_BONUS_PCT = 10; // 法53条3項「十分の一を加えたもの」

// 法53条1項各号に現れる数値（十分の三〜十分の八）。用途地域ごとの組み合わせは都市計画で決まるので、利用者が選ぶ。
export const RATIO_CHOICES_PCT = [30, 40, 50, 60, 70, 80];

export const LIMITS = {
  siteM2: [10, 10000],
  houseM2: [0, 10000],
  sideCm: [100, 3000],
  columnSpacingCm: [10, 3000],
  ceilingCm: [100, 1000],
  openRunCm: [0, 10000],
};

export const m2ToCm2 = (m2) => Math.round(m2 * 10000);

// 告示第1437号の4要件の判定。openRunCm は「外壁を有しない部分の連続長さ」。
export function requirements({ openRunCm, columnSpacingCm, ceilingCm }) {
  const items = [
    { key: "open", ok: openRunCm >= REQ_OPEN_RUN_CM, label: "外壁を有しない部分が連続して4m以上", value: openRunCm, need: REQ_OPEN_RUN_CM },
    { key: "column", ok: columnSpacingCm >= REQ_COLUMN_SPACING_CM, label: "柱の間隔が2m以上", value: columnSpacingCm, need: REQ_COLUMN_SPACING_CM },
    { key: "ceiling", ok: ceilingCm >= REQ_CEILING_CM, label: "天井の高さが2.1m以上", value: ceilingCm, need: REQ_CEILING_CM },
    { key: "story", ok: true, label: "地階を除く階数が1", value: null, need: null }, // カーポート（平屋）を前提とする
  ];
  return { all: items.every((x) => x.ok), items };
}

// 算入面積（cm²）
export function includedAreaCm2(widthCm, depthCm, relieved) {
  if (!relieved) return widthCm * depthCm;
  return Math.max(0, widthCm - 2 * RELIEF_EDGE_CM) * Math.max(0, depthCm - 2 * RELIEF_EDGE_CM);
}

// 上限まで残っている算入面積（cm²）。既に超えていれば負。上限 limitPct × 敷地 ÷ 100 を切り捨てずに比べるため、
// 「× 100 した値」で返す（remainingX100 / 100 が cm²）。
export function remainingX100(siteCm2, houseCm2, limitPct) {
  return limitPct * siteCm2 - 100 * houseCm2;
}

// 間口 widthCm のまま、上限に収まる最大の奥行（cm・整数・切り捨て）。収まらなければ 0。
// 緩和あり: (W−200)(D−200) ≦ R → D ≦ 200 + R/(W−200)。W ≦ 200 なら算入面積が常に 0 なので奥行に上限なし（null）。
// 緩和なし: W·D ≦ R → D ≦ R/W。
export function maxDepthCm(widthCm, remX100, relieved) {
  if (remX100 < 0) return 0;
  if (relieved) {
    const w = widthCm - 2 * RELIEF_EDGE_CM;
    if (w <= 0) return null;
    return 2 * RELIEF_EDGE_CM + Math.floor(remX100 / (100 * w));
  }
  return Math.floor(remX100 / (100 * widthCm));
}

function within(name, v, [lo, hi], errors) {
  if (!Number.isFinite(v)) errors.push(`${name}を数値で入力してください。`);
  else if (v < lo || v > hi) errors.push(`${name}は ${lo}〜${hi} の範囲で入力してください。`);
}

// input: { siteM2, ratioPct, corner, houseM2, widthCm, depthCm, walls: "none"|"some", openRunCm（walls=some のとき）,
//          columnSpacingCm, ceilingCm }
export function calculate(input) {
  const errors = [];
  const siteM2 = Number(input.siteM2);
  const houseM2 = Number(input.houseM2);
  const ratioPct = Number(input.ratioPct);
  const widthCm = Math.round(Number(input.widthCm));
  const depthCm = Math.round(Number(input.depthCm));
  const columnSpacingCm = Math.round(Number(input.columnSpacingCm));
  const ceilingCm = Math.round(Number(input.ceilingCm));
  const walls = input.walls === "some" ? "some" : "none";

  within("敷地面積(㎡)", siteM2, LIMITS.siteM2, errors);
  within("今ある建物の建築面積(㎡)", houseM2, LIMITS.houseM2, errors);
  if (!RATIO_CHOICES_PCT.includes(ratioPct)) errors.push("指定建ぺい率を選んでください。");
  within("カーポートの間口(cm)", widthCm, LIMITS.sideCm, errors);
  within("カーポートの奥行(cm)", depthCm, LIMITS.sideCm, errors);
  within("柱の間隔(cm)", columnSpacingCm, LIMITS.columnSpacingCm, errors);
  within("天井の高さ(cm)", ceilingCm, LIMITS.ceilingCm, errors);
  // 壁・側面パネルが無ければ、外壁を有しない部分は屋根の外周に沿って連続する。長いほうの辺で判定すれば足りる。
  const openRunCm = walls === "none" ? Math.max(widthCm, depthCm) : Math.round(Number(input.openRunCm));
  if (walls === "some") within("壁の無い部分の連続長さ(cm)", openRunCm, LIMITS.openRunCm, errors);
  if (Number.isFinite(siteM2) && Number.isFinite(houseM2) && houseM2 > siteM2)
    errors.push("今ある建物の建築面積が敷地面積を超えています。");
  if (errors.length) return { ok: false, errors };

  const corner = !!input.corner;
  const limitPct = ratioPct + (corner ? CORNER_BONUS_PCT : 0);
  const siteCm2 = m2ToCm2(siteM2);
  const houseCm2 = m2ToCm2(houseM2);
  const req = requirements({ openRunCm, columnSpacingCm, ceilingCm });
  const roofCm2 = widthCm * depthCm;
  const relievedCm2 = includedAreaCm2(widthCm, depthCm, true);
  const includedCm2 = req.all ? relievedCm2 : roofCm2;
  const totalCm2 = houseCm2 + includedCm2;
  const rem = remainingX100(siteCm2, houseCm2, limitPct);

  return {
    ok: true,
    input: { siteM2, ratioPct, corner, houseM2, widthCm, depthCm, walls, openRunCm, columnSpacingCm, ceilingCm },
    limitPct,
    requirements: req,
    relieved: req.all,
    roofCm2,
    relievedCm2,
    includedCm2,
    excludedCm2: roofCm2 - includedCm2,
    houseCm2,
    siteCm2,
    limitCm2: (limitPct * siteCm2) / 100,
    totalCm2,
    ratioPct: (100 * totalCm2) / siteCm2,
    houseRatioPct: (100 * houseCm2) / siteCm2,
    fits: 100 * totalCm2 <= limitPct * siteCm2,
    houseAlreadyOver: 100 * houseCm2 > limitPct * siteCm2,
    remainingCm2: rem / 100, // 上限まで残っている算入面積（負なら超過）
    afterCm2: (rem - 100 * includedCm2) / 100, // カーポート後の残り（負なら超過量）
    maxDepthCm: maxDepthCm(widthCm, rem, req.all),
    maxDepthIfRelievedCm: maxDepthCm(widthCm, rem, true),
  };
}
