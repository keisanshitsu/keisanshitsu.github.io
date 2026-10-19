// 物置の建築確認の要否（10㎡・防火地域・増築か新築か）と、置いたあとの建ぺい率・容積率
//
// 根拠（2026-10-19 に逐語確認）:
//   建築基準法（昭和25年法律第201号）（e-Gov 法令API v2・現行 2026-05-27 施行版）
//     https://laws.e-gov.go.jp/api/2/law_data/325AC0000000201
//     第2条第1号 「建築物 土地に定着する工作物のうち、屋根及び柱若しくは壁を有するもの（これに類する構造のものを含む。）…倉庫…」
//     第6条第1項 確認が要る建築物
//       一 別表第一（い）欄に掲げる用途に供する特殊建築物で、その用途に供する部分の床面積の合計が二百平方メートルを超えるもの
//          （倉庫は別表第一（い）欄（五）項の用途）
//       二 前号に掲げる建築物を除くほか、二以上の階数を有し、又は延べ面積が二百平方メートルを超える建築物
//       三 前二号に掲げる建築物を除くほか、都市計画区域若しくは準都市計画区域…内…における建築物
//     第6条第2項 「前項の規定は、防火地域及び準防火地域外において建築物を増築し、改築し、又は移転しようとする場合で、
//                 その増築、改築又は移転に係る部分の床面積の合計が十平方メートル以内であるときについては、適用しない。」
//     第52条第1項 延べ面積の敷地面積に対する割合（容積率）は、都市計画で定められた数値以下
//     第53条第1項 「建築物の建築面積（同一敷地内に二以上の建築物がある場合においては、その建築面積の合計）の敷地面積に対する割合」
//     第53条第3項第2号 角地（特定行政庁が指定するもの）は十分の一を加える
//   建築基準法施行令（昭和25年政令第338号）（e-Gov 法令API v2・現行 2025-12-01 施行版）
//     https://laws.e-gov.go.jp/api/2/law_data/325CO0000000338
//     第1条第1号 「敷地 一の建築物又は用途上不可分の関係にある二以上の建築物のある一団の土地をいう。」
//     第2条第1項第2号 建築面積 外壁又はこれに代わる柱の中心線（1m以上突き出た軒等はその端から1m後退した線）で囲まれた部分
//     第2条第1項第3号 「床面積 建築物の各階又はその一部で壁その他の区画の中心線で囲まれた部分の水平投影面積による。」
//     第2条第1項第4号 「延べ面積 建築物の各階の床面積の合計による。」
//   増築か新築か・2個以上は合計: 相模原市 建築審査課「物置の設置をご検討中の方へ」（令和8年1月作成）
//     「自宅の敷地に物置を設置する ⇒ 増築」「建築物のない空き地に物置を設置する ⇒ 新築」
//     「床面積の合計（２個以上設置する場合はその合計）が10㎡以内の増築の場合は、申請不要です。」
//     「新築の場合は床面積の合計が10㎡以内でも申請が必要となります」
//
// 改正状況（2026-10-19 確認）: 法第2条第1号・第6条第1項第2項・第53条第1項は未施行の改正4件
// （2026-11-26・2027-01-22・2027-05-26・2028-07-30 施行）すべてで同一。第52条第1項は 2026-11-26 版で号が増えるが、
// 指定容積率は利用者が入力するので本計算に影響しない。施行令第1条・第2条は 2026-11-01 施行版でも同一。
//
// 判定（物置は平屋＝階数1を前提とする）:
//   (a) 母屋のある敷地（増築）かつ 防火・準防火地域の外 かつ 物置の床面積の合計 ≦ 10㎡ → 第6条第2項で確認不要
//   (b) 都市計画区域・準都市計画区域などの内 → (a) 以外は第6条第1項第3号で確認が要る
//   (c) 区域の外・空き地（新築）→ 物置だけの建物なので、合計 200㎡ 以下なら第1号・第2号に当たらず確認不要、超えれば要る
//   (d) 区域の外・母屋のある敷地で 10㎡ 超 → 第1項の「増築後において第一号又は第二号に規定する規模のものとなる場合」に
//       別棟の物置が当たるかは条文だけで決まらないので「要確認」（断定しない）
//   防火地域・準防火地域は都市計画区域内に定めるものなので、区域の外を選んだときは防火の入力を使わない。
//     都市計画法 第8条第1項「都市計画区域については、…次に掲げる地域…を定めることができる。…五 防火地域又は準防火地域」
//     同条第2項 準都市計画区域に定められるのは第1項第1号〜第2号の2・第3号（高度地区）・第6号・第7号・第12号・第15号（第5号を含まない）
//     https://laws.e-gov.go.jp/api/2/law_data/343AC0000000100（2026-10-19 取得）
//
// 計算（長さは cm、面積は cm² の整数で行い、表示のときだけ ㎡ に直す）:
//   物置の面積 ＝ 間口 × 奥行（本体の外寸）。正しい基準は壁の中心線なので、外寸で数えると大きく出る
//   ＝ 10㎡ の判定は「要る」側、建ぺい率・容積率は「超える」側に倒れる（設計時に選んだ誤差の向き）
//   建ぺい率: (今ある建物の建築面積 ＋ 物置) × 100 ≦ 上限(%) × 敷地面積
//   容積率:   (今ある建物の延べ面積 ＋ 物置) × 100 ≦ 指定容積率(%) × 敷地面積
//
// 扱わないもの: 小規模な物置が建築物に当たらない基準（自治体ごとに違う）、用途地域による単独の倉庫の制限（法48条）、
// 防災備蓄倉庫の延べ面積不算入（令2条1項4号ロ）、前面道路による容積率の制限（法52条2項）、カーポート等との同時設置。

export const EXEMPT_LIMIT_CM2 = 100000; // 第6条第2項「十平方メートル以内」
export const SMALL_SCALE_LIMIT_CM2 = 2000000; // 第6条第1項第1号・第2号「二百平方メートルを超える」
export const CORNER_BONUS_PCT = 10; // 法53条3項「十分の一を加えたもの」

// 法53条1項各号に現れる数値（十分の三〜十分の八）。用途地域ごとの組み合わせは都市計画で決まるので、利用者が選ぶ。
export const RATIO_CHOICES_PCT = [30, 40, 50, 60, 70, 80];

export const LIMITS = {
  siteM2: [10, 10000],
  houseM2: [0, 10000],
  sideCm: [30, 3000],
  farPct: [50, 1300],
};

export const m2ToCm2 = (m2) => Math.round(m2 * 10000);

// 確認の要否。zone: "inside"（都市計画区域・準都市計画区域などの内）| "outside"
// 返り値 status: "not_required" | "required" | "check"
export function permit({ zone, fire, hasHouse, totalCm2 }) {
  const inZone = zone !== "outside";
  const fireZone = inZone && !!fire;
  const extension = !!hasHouse;
  if (extension && !fireZone && totalCm2 <= EXEMPT_LIMIT_CM2) {
    return { status: "not_required", rule: "6-2", fireZone, extension };
  }
  if (inZone) {
    const why = fireZone ? "fire" : !extension ? "new" : "over10";
    return { status: "required", rule: "6-1-3", why, fireZone, extension };
  }
  if (!extension) {
    return totalCm2 <= SMALL_SCALE_LIMIT_CM2
      ? { status: "not_required", rule: "outside-small", fireZone, extension }
      : { status: "required", rule: "6-1-1", fireZone, extension };
  }
  return { status: "check", rule: "outside-extension", fireZone, extension };
}

// 上限まで残っている面積（cm²）を「× 100 した値」で返す（切り捨てずに比べるため）。負なら超過。
export const remainingX100 = (siteCm2, usedCm2, pct) => pct * siteCm2 - 100 * usedCm2;

function within(name, v, [lo, hi], errors) {
  if (!Number.isFinite(v)) errors.push(`${name}を数値で入力してください。`);
  else if (v < lo || v > hi) errors.push(`${name}は ${lo}〜${hi} の範囲で入力してください。`);
}

// input: { zone, fire, hasHouse, w1Cm, d1Cm, second（2個目を置くか）, w2Cm, d2Cm,
//          siteM2, ratioPct, corner, houseBuildM2, farPct, houseFloorM2 }
export function calculate(input) {
  const errors = [];
  const zone = input.zone === "outside" ? "outside" : "inside";
  const hasHouse = !!input.hasHouse;
  const second = !!input.second;
  const w1Cm = Math.round(Number(input.w1Cm));
  const d1Cm = Math.round(Number(input.d1Cm));
  const w2Cm = second ? Math.round(Number(input.w2Cm)) : 0;
  const d2Cm = second ? Math.round(Number(input.d2Cm)) : 0;
  const siteM2 = Number(input.siteM2);
  const ratioPct = Number(input.ratioPct);
  const farPct = Number(input.farPct);
  const houseBuildM2 = hasHouse ? Number(input.houseBuildM2) : 0;
  const houseFloorM2 = hasHouse ? Number(input.houseFloorM2) : 0;

  within("物置の間口(cm)", w1Cm, LIMITS.sideCm, errors);
  within("物置の奥行(cm)", d1Cm, LIMITS.sideCm, errors);
  if (second) {
    within("2個目の物置の間口(cm)", w2Cm, LIMITS.sideCm, errors);
    within("2個目の物置の奥行(cm)", d2Cm, LIMITS.sideCm, errors);
  }
  within("敷地面積(㎡)", siteM2, LIMITS.siteM2, errors);
  if (!RATIO_CHOICES_PCT.includes(ratioPct)) errors.push("指定建ぺい率を選んでください。");
  within("指定容積率(%)", farPct, LIMITS.farPct, errors);
  if (hasHouse) {
    within("今ある建物の建築面積(㎡)", houseBuildM2, LIMITS.houseM2, errors);
    within("今ある建物の延べ面積(㎡)", houseFloorM2, LIMITS.houseM2, errors);
    if (Number.isFinite(siteM2) && Number.isFinite(houseBuildM2) && houseBuildM2 > siteM2)
      errors.push("今ある建物の建築面積が敷地面積を超えています。");
  }
  if (errors.length) return { ok: false, errors };

  const corner = !!input.corner;
  const fire = zone === "inside" && !!input.fire;
  const shed1Cm2 = w1Cm * d1Cm;
  const shed2Cm2 = w2Cm * d2Cm;
  const shedCm2 = shed1Cm2 + shed2Cm2;
  const siteCm2 = m2ToCm2(siteM2);
  const houseBuildCm2 = m2ToCm2(houseBuildM2);
  const houseFloorCm2 = m2ToCm2(houseFloorM2);
  const limitPct = ratioPct + (corner ? CORNER_BONUS_PCT : 0);

  const p = permit({ zone, fire, hasHouse, totalCm2: shedCm2 });
  const buildRemX100 = remainingX100(siteCm2, houseBuildCm2, limitPct);
  const floorRemX100 = remainingX100(siteCm2, houseFloorCm2, farPct);
  // 平屋の物置は建築面積と床面積に同じだけ加わるので、置ける面積は残りの小さいほう。
  const roomX100 = Math.min(buildRemX100, floorRemX100);

  return {
    ok: true,
    input: { zone, fire, hasHouse, second, w1Cm, d1Cm, w2Cm, d2Cm, siteM2, ratioPct, corner, houseBuildM2, farPct, houseFloorM2 },
    permit: p,
    shed1Cm2,
    shed2Cm2,
    shedCm2,
    exemptRoomCm2: EXEMPT_LIMIT_CM2 - shedCm2, // 10㎡ までの残り（負なら超過）
    siteCm2,
    limitPct,
    buildLimitCm2: (limitPct * siteCm2) / 100,
    buildTotalCm2: houseBuildCm2 + shedCm2,
    buildRatioPct: (100 * (houseBuildCm2 + shedCm2)) / siteCm2,
    buildFits: 100 * (houseBuildCm2 + shedCm2) <= limitPct * siteCm2,
    floorLimitCm2: (farPct * siteCm2) / 100,
    floorTotalCm2: houseFloorCm2 + shedCm2,
    floorRatioPct: (100 * (houseFloorCm2 + shedCm2)) / siteCm2,
    floorFits: 100 * (houseFloorCm2 + shedCm2) <= farPct * siteCm2,
    houseAlreadyOver: buildRemX100 < 0 || floorRemX100 < 0,
    roomCm2: roomX100 / 100, // 今ある建物だけのとき、物置に使える残り（負なら既に超過）
    afterCm2: (roomX100 - 100 * shedCm2) / 100, // 物置を置いたあとの残り（負なら超過量）
    binding: buildRemX100 <= floorRemX100 ? "build" : "floor",
  };
}
