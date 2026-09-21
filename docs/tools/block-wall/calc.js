// ブロック塀（補強コンクリートブロック造の塀）の数量計算と、法令・規準への適合確認
//
// このファイルはブラウザとテストの両方から読み込まれる。
// 「テストしたコード」と「出荷したコード」を必ず同一にするため、
// 計算式を HTML 側に複製してはならない。
//
// ── 出典（すべて一次情報。2026-09-18 に取得して確認済み）────────────────
//
// [令] 建築基準法施行令 第六十二条の八（塀）
//   e-Gov 法令API から逐語取得: https://laws.e-gov.go.jp/api/1/lawdata/325CO0000000338
//   同一の条文が国土交通省の通知（国住指第1130号）別紙2にも再掲されている:
//   https://www.mlit.go.jp/common/001239762.pdf
//
//   「補強コンクリートブロック造の塀は、次の各号（高さ一・二メートル以下の塀にあつては、
//    第五号及び第七号を除く。）に定めるところによらなければならない。ただし、国土交通大臣が
//    定める基準に従つた構造計算によつて構造耐力上安全であることが確かめられた場合においては、
//    この限りでない。
//    一 高さは、二・二メートル以下とすること。
//    二 壁の厚さは、十五センチメートル（高さ二メートル以下の塀にあつては、十センチメートル）
//      以上とすること。
//    三 壁頂及び基礎には横に、壁の端部及び隅角部には縦に、それぞれ径九ミリメートル以上の
//      鉄筋を配置すること。
//    四 壁内には、径九ミリメートル以上の鉄筋を縦横に八十センチメートル以下の間隔で
//      配置すること。
//    五 長さ三・四メートル以下ごとに、径九ミリメートル以上の鉄筋を配置した控壁で
//      基礎の部分において壁面から高さの五分の一以上突出したものを設けること。
//    六 第三号及び第四号の規定により配置する鉄筋の末端は、かぎ状に折り曲げて、……
//    七 基礎の丈は、三十五センチメートル以上とし、根入れの深さは三十センチメートル以上と
//      すること。」
//
//   ⚠ 冒頭の括弧書き「高さ一・二メートル以下の塀にあつては、第五号及び第七号を除く」は
//   実務で最も見落とされる。1.2m 以下の塀に控壁と基礎の丈の規定は掛からない。
//
// [工] 一般社団法人 全国建築コンクリートブロック工業会「設計者のための CB 塀」
//   https://www.jcba-jp.com/useful/images/designer_pdf04.pdf ほか同シリーズ
//   日本建築学会「コンクリートブロック塀設計規準」から数値を抜粋した資料であり、
//   同会自身が「建築基準法施行令の規定値はブロック塀に対する最低基準であるので、
//   本稿では……日本建築学会の諸規準を基にした重要な規定を抜粋列記する」と述べている。
//
//   寸法（designer_pdf04.pdf）:
//   「モデュール寸法で長さ300～900mm、高さ100～200mm、厚さは100～200mmの範囲から
//    標準目地幅を引いた寸法が製品の寸法となる。一般にブロック塀には塀の高さにより
//    正味厚さ120mm、150mmを用い、長さ(横)・高さ(縦)の寸法は、標準目地幅10mmの場合は
//    長さ390mm、高さ190mmのものを用いる。」
//   → 製品 390×190 ＋ 目地 10 ＝ モジュール 400×200。本ツールの数量計算の土台。
//
//   この 200mm という縦モジュールは、同会の別表（根入れ深さの表）と独立に整合する。
//   同表は塀の高さを 5段=1.15m / 6段=1.35m / 10段=2.15m と書いており、
//   0.05（基礎の地上部）＋ 段数×0.20 ＋ 0.10（笠木）で全欄が一致する。
//
// [告] 平成12年建設省告示第1355号（令62条の8 ただし書の構造計算の基準）
//   https://www.mlit.go.jp/notice/noticedata/pdf/201703/00006447.pdf
//   本ツールは仕様規定だけを扱い、この構造計算は行わない。
//
// [点] 国土交通省 住宅局建築指導課「建築物の既設の塀の安全点検について」（平成30年6月21日）
//   https://www.mlit.go.jp/common/001239762.pdf  別紙1「ブロック塀の点検のチェックポイント」
//
// ── 意図的に実装しなかったもの ──────────────────────────────────────
// ・日本建築学会 設計規準の「表1 ブロック塀の高さの限度」（基礎形状×埋戻し土質）と
//   「表3 根入れ深さの最小値」の一部の行は、PDF から抽出すると値の数が列の数に足りず、
//   どの列の値なのかを復元できなかった。**推定で埋めれば判定が増えるが、
//   間違った安全側/危険側のどちらに倒れるかを言えない**ので実装していない。
//   この事実はページの FAQ にも書いてある。
// ・目地モルタルの必要量。配合（容積比）の一次情報を確認できなかったため出さない。
// ・控壁のブロック個数。控壁の断面形は設計により変わる（矩形とは限らない）ため、
//   必要本数と必要突出長さまでを出し、個数は出さない。

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/** JIS A 5406 の基本形ブロック。製品 390×190 に標準目地幅 10mm を足したモジュール [工] */
export const MODULE_L_MM = 400;
export const MODULE_H_MM = 200;
export const JOINT_MM = 10;
/** 正味厚さの規格範囲 [工]。選択肢として出すのは流通している 100/120/150/190 */
export const THICKNESS_RANGE_MM = { min: 100, max: 200 };
export const THICKNESS_CHOICES_MM = [100, 120, 150, 190];

/** 建築基準法施行令 第62条の8 の数値 [令] */
export const REI = {
  maxHeightMm: 2200,            // 一号
  minThicknessMm: 150,          // 二号（本則）
  minThicknessUpTo2mMm: 100,    // 二号（高さ2m以下のとき）
  thicknessThresholdMm: 2000,   // 二号の分岐点
  minRebarDiaMm: 9,             // 三号・四号・五号
  maxRebarSpacingMm: 800,       // 四号
  maxButtressSpanMm: 3400,      // 五号
  buttressProjectionRatio: 1 / 5, // 五号
  minFootingDepthMm: 350,       // 七号（基礎の丈）
  minFootingEmbedMm: 300,       // 七号（根入れ）
  /** 高さ1.2m以下の塀は五号・七号の適用が無い（条文冒頭の括弧書き） */
  exemptionHeightMm: 1200,
};

/** 日本建築学会 設計規準からの抜粋（施行令より厳しい推奨値）[工] */
export const GAKKAI = {
  minThicknessMm: 120,          // 鉄筋のかぶり厚2cm確保と耐久性を考慮
  buttressProjectionMinMm: 400, // 控壁の突き出し長さ
  endToButtressMaxMm: 800,      // 塀の端部から控壁までの距離
  expansionJointMaxMm: 30000,   // エキスパンションジョイントは30m以内ごと
  hRebarSpacingMaxMm: 800,      // 横筋の間隔（通常は600）
  hRebarSpacingUsualMm: 600,
  footingRiseMinMm: 50,         // 基礎は地盤面より5cm以上立ち上げる
  rebarAnchorageFactor: 40,     // 縦筋は基礎に 40d 以上定着させる
  endRebarD13OverMm: 1800,      // 塀端部の縦筋は 1.8m 超で D13
};

/**
 * 学会 設計規準「表5 縦筋の間隔」のうち、空洞ブロックを使う場合の行。
 * 単位は mm。括弧内（D13 を使うときの緩和）も保持する。
 * 表そのものは列と値の対応が読めたのでこの範囲だけ実装している。
 */
export function gakkaiVerticalSpacingMm(heightMm, hasButtress) {
  if (hasButtress) {
    if (heightMm <= 1600) return { d10: 800, d13: 800 };
    if (heightMm <= 2200) return { d10: 400, d13: 400 };
    return null; // 2.2m 超は施行令の上限を超えるので表の範囲外
  }
  if (heightMm <= 1200) return { d10: 800, d13: 800 };
  if (heightMm <= 1600) return { d10: 400, d13: 800 };
  return null; // 控壁なしで1.6m超は表の範囲外（＝規準の想定外）
}

/** 基礎の形状。張り出しの寸法は学会 設計規準 表2 [工] */
export const FOOTING_TYPES = {
  I: { label: "I 形（立上りのみ）", overhangEachMm: 0, flangeThicknessMm: 0 },
  invT: { label: "逆T形（両側に張り出す）", overhangEachMm: 130, flangeThicknessMm: 150 },
  L: { label: "L 形（片側に張り出す）", overhangEachMm: 400, flangeThicknessMm: 150 },
};

const ceil = Math.ceil;

/**
 * @param {object} p
 * @param {number} p.lengthMm        塀の長さ
 * @param {number} p.courses         ブロックの段数
 * @param {number} p.thicknessMm     ブロックの正味厚さ
 * @param {number} [p.footingRiseMm] 基礎の地上部の立ち上がり高さ
 * @param {number} [p.copingMm]      笠木の高さ（使わないなら0）
 * @param {boolean} [p.hasButtress]  控壁を設けるか
 * @param {number} [p.rebarDiaMm]    鉄筋の呼び径（D10 なら 10）
 * @param {number} [p.vSpacingMm]    縦筋の間隔
 * @param {number} [p.hSpacingMm]    横筋の間隔（目標値。実際は段の整数倍に丸める）
 * @param {string} [p.footingType]   FOOTING_TYPES のキー
 * @param {number} [p.footingDepthMm]  基礎の丈
 * @param {number} [p.footingEmbedMm]  基礎の根入れ深さ
 * @param {number} [p.footingWidthMm]  基礎の立上り部分の幅。未指定ならブロック厚と同じ
 * @param {number} [p.lossPercent]   ブロックのロス率(%)
 */
export function calculate({
  lengthMm,
  courses,
  thicknessMm,
  footingRiseMm = GAKKAI.footingRiseMinMm,
  copingMm = 0,
  hasButtress = true,
  rebarDiaMm = 10,
  vSpacingMm = 400,
  hSpacingMm = GAKKAI.hRebarSpacingUsualMm,
  footingType = "I",
  footingDepthMm = REI.minFootingDepthMm,
  footingEmbedMm = REI.minFootingEmbedMm,
  footingWidthMm = null,
  lossPercent = 5,
}) {
  const errors = [];
  const finite = { lengthMm, courses, thicknessMm, footingRiseMm, copingMm, rebarDiaMm, vSpacingMm, hSpacingMm, footingDepthMm, footingEmbedMm, lossPercent };
  for (const [k, v] of Object.entries(finite)) if (!Number.isFinite(v)) errors.push(`${k} が数値でない`);

  if (Number.isFinite(lengthMm) && lengthMm <= 0) errors.push("塀の長さは0より大きい値を入れてください");
  if (Number.isFinite(courses) && (courses < 1 || !Number.isInteger(courses)))
    errors.push("段数は1以上の整数で入れてください");
  if (Number.isFinite(thicknessMm) && (thicknessMm < THICKNESS_RANGE_MM.min || thicknessMm > THICKNESS_RANGE_MM.max))
    errors.push(`ブロックの正味厚さは ${THICKNESS_RANGE_MM.min}〜${THICKNESS_RANGE_MM.max}mm の範囲です（JIS A 5406）`);
  if (Number.isFinite(footingRiseMm) && footingRiseMm < 0) errors.push("基礎の立ち上がりに負の値は入れられません");
  if (Number.isFinite(copingMm) && copingMm < 0) errors.push("笠木の高さに負の値は入れられません");
  if (Number.isFinite(rebarDiaMm) && rebarDiaMm <= 0) errors.push("鉄筋の径は0より大きい値を入れてください");
  if (Number.isFinite(vSpacingMm) && vSpacingMm <= 0) errors.push("縦筋の間隔は0より大きい値を入れてください");
  if (Number.isFinite(hSpacingMm) && hSpacingMm < MODULE_H_MM)
    errors.push(`横筋の間隔は ${MODULE_H_MM}mm（1段）以上で入れてください`);
  if (Number.isFinite(footingDepthMm) && footingDepthMm <= 0) errors.push("基礎の丈は0より大きい値を入れてください");
  if (Number.isFinite(footingEmbedMm) && footingEmbedMm < 0) errors.push("根入れ深さに負の値は入れられません");
  if (Number.isFinite(lossPercent) && lossPercent < 0) errors.push("ロス率に負の値は入れられません");
  if (!FOOTING_TYPES[footingType]) errors.push("基礎の形状が選ばれていません");
  if (errors.length) return { ok: false, errors };

  const ft = FOOTING_TYPES[footingType];
  if (ft.flangeThicknessMm > 0 && footingDepthMm < ft.flangeThicknessMm)
    return { ok: false, errors: [`${ft.label} は張り出し部分の厚さが ${ft.flangeThicknessMm}mm あるため、基礎の丈をそれ以上にしてください`] };

  // ── 寸法 ───────────────────────────────────────────────────────
  const wallMm = courses * MODULE_H_MM;            // ブロックを積んだ部分の高さ
  const heightMm = footingRiseMm + wallMm + copingMm; // 地盤面からの塀の高さ（施行令の「高さ」）
  const exempt = heightMm <= REI.exemptionHeightMm;   // 五号・七号の適用除外

  // ── 数量 ───────────────────────────────────────────────────────
  const perCourse = ceil(lengthMm / MODULE_L_MM);
  const blocks = perCourse * courses;
  // ⚠ ceil(blocks * (1 + loss/100)) と書くと 200×1.1 が 220.00000000000003 になり
  // 221個と出る。割り算を最後に回して浮動小数の誤差を持ち込まない。
  const blocksWithLoss = ceil((blocks * (100 + lossPercent)) / 100);

  // ── 控壁 ───────────────────────────────────────────────────────
  // 施行令五号は「長さ3.4m以下ごと」しか言わないので、区間を3.4m以下に割る本数を出す。
  // 学会規準はこれに加えて「塀の端部においては80cm以下」に控壁を求めるため別に出す。
  const buttressByRei = Math.max(0, ceil(lengthMm / REI.maxButtressSpanMm) - 1);
  const buttressByGakkai =
    lengthMm <= 2 * GAKKAI.endToButtressMaxMm
      ? 1
      : 2 + Math.max(0, ceil((lengthMm - 2 * GAKKAI.endToButtressMaxMm) / REI.maxButtressSpanMm) - 1);
  const projectionReiMm = ceil(heightMm * REI.buttressProjectionRatio);
  const projectionGakkaiMm = Math.max(projectionReiMm, GAKKAI.buttressProjectionMinMm);
  const buttressCount = hasButtress ? buttressByGakkai : 0;
  // ⚠ 区間長は「どちらの配置に従うか」で変わる。本数と配置は必ず同じ出典で揃えること。
  // 以前ここは「学会の本数」を「等間隔」で割っており、どちらの配置とも一致しない数字を
  // 施行令の判定（第五号）に表示していた。混ぜてはならない典型例なので分けてある。
  //
  // 施行令だけに従う配置: 条文は端部の扱いを定めないので等間隔に置ける。
  const spanReiMm = hasButtress ? lengthMm / (buttressByRei + 1) : lengthMm;
  // 学会 設計規準に従う配置: 両端から800mm以内に置き、残りを等分する。
  // 端が寄るぶん内側の区間は等間隔より長くなるので lengthMm/(本数+1) にはならない。
  const spanGakkaiMm = !hasButtress
    ? lengthMm
    : buttressByGakkai <= 1
      ? lengthMm / 2
      : Math.max(
          GAKKAI.endToButtressMaxMm,
          (lengthMm - 2 * GAKKAI.endToButtressMaxMm) / (buttressByGakkai - 1)
        );

  // ── 鉄筋 ───────────────────────────────────────────────────────
  // 縦筋は両端に必ず入る（三号「壁の端部……には縦に」）ので本数は区間数＋1。
  const vCount = ceil(lengthMm / vSpacingMm) + 1;
  const vActualSpacingMm = vCount > 1 ? lengthMm / (vCount - 1) : 0;
  // 縦筋は基礎に 40d 以上定着させて壁頂まで1本で立ち上げる [工]。フックの加工代は含まない。
  const vEachMm = wallMm + GAKKAI.rebarAnchorageFactor * rebarDiaMm;

  // 横筋は目地に入るので、間隔は段の整数倍にしかできない。切り捨てて安全側に寄せる。
  const hEveryCourses = Math.max(1, Math.floor(hSpacingMm / MODULE_H_MM));
  const hActualSpacingMm = hEveryCourses * MODULE_H_MM;
  // 壁頂には必ず横筋を置き（三号）、そこから hEveryCourses 段ごとに下へ配る。
  const hCount = ceil(courses / hEveryCourses);
  const hEachMm = lengthMm;

  // ── 基礎 ───────────────────────────────────────────────────────
  const b = footingWidthMm ?? thicknessMm;
  // L形は片側だけ、逆T形は両側に張り出す（設計規準 表2）。
  const baseWidthMm = footingType === "I" ? b : footingType === "L" ? b + ft.overhangEachMm : b + 2 * ft.overhangEachMm;
  const sectionMm2 =
    footingType === "I"
      ? b * footingDepthMm
      : b * (footingDepthMm - ft.flangeThicknessMm) + baseWidthMm * ft.flangeThicknessMm;
  const footingVolM3 = (sectionMm2 * lengthMm) / 1e9;

  // ── 施行令 第62条の8 の適合確認 ───────────────────────────────────
  const checks = [];
  const add = (no, title, status, detail) => checks.push({ no, title, status, detail });

  add(1, "高さは2.2m以下か", heightMm <= REI.maxHeightMm ? "ok" : "ng",
    `地盤面からの高さ ${round(heightMm / 1000, 3)}m（基礎の立ち上がり ${footingRiseMm}mm ＋ ブロック ${courses}段 ${wallMm}mm` +
    (copingMm > 0 ? ` ＋ 笠木 ${copingMm}mm` : "") + `）／ 上限 2.2m`);

  const needThickness = heightMm <= REI.thicknessThresholdMm ? REI.minThicknessUpTo2mMm : REI.minThicknessMm;
  add(2, "壁の厚さは足りているか", thicknessMm >= needThickness ? "ok" : "ng",
    `高さ ${round(heightMm / 1000, 3)}m なので ${needThickness}mm 以上が必要。入力は ${thicknessMm}mm` +
    (heightMm <= REI.thicknessThresholdMm ? "（高さ2m以下の緩和が適用されています）" : ""));

  add(3, "壁頂・基礎・端部・隅角部の鉄筋は径9mm以上か", rebarDiaMm >= REI.minRebarDiaMm ? "ok" : "ng",
    `入力した鉄筋は D${rebarDiaMm}（径 ${rebarDiaMm}mm）／ 必要 ${REI.minRebarDiaMm}mm 以上`);

  const spacingOk = vActualSpacingMm <= REI.maxRebarSpacingMm && hActualSpacingMm <= REI.maxRebarSpacingMm;
  add(4, "壁内の鉄筋は縦横80cm以下の間隔か", rebarDiaMm >= REI.minRebarDiaMm && spacingOk ? "ok" : "ng",
    `縦筋 ${round(vActualSpacingMm, 0)}mm ／ 横筋 ${hActualSpacingMm}mm（${hEveryCourses}段ごと）／ どちらも 800mm 以下であること`);

  if (exempt) {
    add(5, "控壁（3.4m以下ごと・高さの1/5以上突出）", "na",
      "高さ1.2m以下の塀なので、条文冒頭の括弧書きにより第五号は適用されません");
  } else if (!hasButtress) {
    add(5, "控壁（3.4m以下ごと・高さの1/5以上突出）", "ng",
      `高さ ${round(heightMm / 1000, 3)}m は1.2mを超えるため控壁が必要です`);
  } else {
    add(5, "控壁（3.4m以下ごと・高さの1/5以上突出）", spanReiMm <= REI.maxButtressSpanMm ? "ok" : "ng",
      `条文どおりに等間隔で割るなら控壁 ${buttressByRei}本、1区間 ${round(spanReiMm / 1000, 2)}m（上限 3.4m）／ ` +
      `突出は ${projectionReiMm}mm 以上（高さの1/5）が必要`);
  }

  add(6, "鉄筋の末端はかぎ状に折り曲げて定着してあるか", "info",
    "施工時の納まりであり、寸法の入力からは判定できません。縦筋は壁頂と基礎の横筋に、横筋は縦筋にかぎ掛けします" +
    "（縦筋を径の40倍以上基礎に定着させる場合は、基礎側のかぎ掛けを省けます）");

  if (exempt) {
    add(7, "基礎の丈35cm以上・根入れ30cm以上", "na",
      "高さ1.2m以下の塀なので、条文冒頭の括弧書きにより第七号は適用されません（基礎そのものは必要です）");
  } else {
    const depthOk = footingDepthMm >= REI.minFootingDepthMm;
    const embedOk = footingEmbedMm >= REI.minFootingEmbedMm;
    add(7, "基礎の丈35cm以上・根入れ30cm以上", depthOk && embedOk ? "ok" : "ng",
      `丈 ${footingDepthMm}mm（必要 ${REI.minFootingDepthMm}mm）／ 根入れ ${footingEmbedMm}mm（必要 ${REI.minFootingEmbedMm}mm）`);
  }

  // ── 学会 設計規準（施行令より厳しい推奨）との比較 ─────────────────────
  const advice = [];
  const rec = (title, status, detail) => advice.push({ title, status, detail });

  rec("壁の厚さ 120mm 以上", thicknessMm >= GAKKAI.minThicknessMm ? "ok" : "warn",
    `施行令は高さ2m以下なら100mmを認めますが、設計規準は鉄筋のかぶり厚2cmの確保と耐久性から120mm以上としています。入力 ${thicknessMm}mm`);

  if (!exempt && hasButtress) {
    rec("控壁の突き出しは 400mm 以上", projectionGakkaiMm <= projectionReiMm ? "ok" : "warn",
      `施行令の「高さの1/5」だと ${projectionReiMm}mm ですが、設計規準は400mm以上かつ厚さは本体の壁以上を求めます。採るべき値は ${projectionGakkaiMm}mm`);
  }
  if (hasButtress) {
    rec("塀の端部から控壁までは 800mm 以下", buttressCount >= buttressByGakkai ? "ok" : "warn",
      `施行令の条文だけなら ${buttressByRei}本で足りますが、設計規準は端部にも控壁を求めるため ${buttressByGakkai}本になります。` +
      `両端を800mmに寄せると内側の区間は等間隔より長くなり、最大 ${round(spanGakkaiMm / 1000, 2)}m です（それでも上限3.4m以下）`);
  }

  const gv = gakkaiVerticalSpacingMm(heightMm, hasButtress);
  if (gv) {
    const limit = rebarDiaMm >= 13 ? gv.d13 : gv.d10;
    rec(`縦筋の間隔 ${limit}mm 以下`, vActualSpacingMm <= limit ? "ok" : "warn",
      `設計規準 表5（空洞ブロック・控壁${hasButtress ? "あり" : "なし"}・高さ ${round(heightMm / 1000, 2)}m・D${rebarDiaMm}）では ${limit}mm 以下。実際の間隔は ${round(vActualSpacingMm, 0)}mm`);
  } else {
    rec("縦筋の間隔", "warn",
      `設計規準 表5 に該当する行がありません（控壁${hasButtress ? "あり" : "なし"}で高さ ${round(heightMm / 1000, 2)}m は表の想定外です）`);
  }

  rec(`横筋の間隔 ${GAKKAI.hRebarSpacingMaxMm}mm 以下（通常は ${GAKKAI.hRebarSpacingUsualMm}mm）`,
    hActualSpacingMm <= GAKKAI.hRebarSpacingUsualMm ? "ok" : hActualSpacingMm <= GAKKAI.hRebarSpacingMaxMm ? "warn" : "warn",
    `${hEveryCourses}段ごと＝${hActualSpacingMm}mm`);

  rec("基礎は地盤面より 50mm 以上立ち上げる", footingRiseMm >= GAKKAI.footingRiseMinMm ? "ok" : "warn",
    `入力 ${footingRiseMm}mm`);

  const expJoints = Math.max(0, ceil(lengthMm / GAKKAI.expansionJointMaxMm) - 1);
  if (expJoints > 0) {
    rec("エキスパンションジョイント", "warn",
      `30m以内ごとに縁を切ります。長さ ${round(lengthMm / 1000, 1)}m なので ${expJoints}箇所必要です（壁体のみ。基礎まで設ける必要はありません）`);
  }

  if (heightMm > GAKKAI.endRebarD13OverMm && rebarDiaMm < 13) {
    rec("塀の端部の縦筋は D13", "warn",
      `高さが1.8mを超える塀では、端部の縦筋を D13 とします（入力は D${rebarDiaMm}）`);
  }

  const notes = [];
  if (exempt) notes.push("高さ1.2m以下の塀では、施行令 第62条の8 の第五号（控壁）と第七号（基礎の丈・根入れ）が適用されません。ただし基礎が不要になるわけではありません。");
  if (lengthMm % MODULE_L_MM !== 0)
    notes.push(`塀の長さが400mm（ブロック1個分）で割り切れないため、端部で半切りブロックなどの調整が必要です。個数は切り上げて数えています。`);
  if (!hasButtress && !exempt)
    notes.push("控壁を設けない設定になっています。高さ1.2mを超える塀では施行令 第五号に適合しません。");

  const ng = checks.filter((c) => c.status === "ng");

  return {
    ok: true,
    errors: [],
    dimensions: {
      lengthM: round(lengthMm / 1000, 3),
      courses,
      wallHeightMm: wallMm,
      heightMm,
      heightM: round(heightMm / 1000, 3),
      thicknessMm,
      wallAreaM2: round((lengthMm * wallMm) / 1e6, 2),
      exemptUnder1200: exempt,
    },
    blocks: {
      perCourse,
      total: blocks,
      withLoss: blocksWithLoss,
      lossPercent,
      moduleLenMm: MODULE_L_MM,
      moduleHeightMm: MODULE_H_MM,
    },
    buttress: {
      required: !exempt,
      countByRei: buttressByRei,
      countByGakkai: buttressByGakkai,
      count: buttressCount,
      spanReiM: round(spanReiMm / 1000, 2),
      spanGakkaiM: round(spanGakkaiMm / 1000, 2),
      projectionReiMm,
      projectionGakkaiMm,
    },
    rebar: {
      diaMm: rebarDiaMm,
      vCount,
      vSpacingMm: round(vActualSpacingMm, 0),
      vEachM: round(vEachMm / 1000, 2),
      vTotalM: round((vCount * vEachMm) / 1000, 1),
      hCount,
      hEveryCourses,
      hSpacingMm: hActualSpacingMm,
      hEachM: round(hEachMm / 1000, 2),
      hTotalM: round((hCount * hEachMm) / 1000, 1),
      totalM: round((vCount * vEachMm + hCount * hEachMm) / 1000, 1),
    },
    footing: {
      type: footingType,
      typeLabel: ft.label,
      riseMm: footingRiseMm,
      depthMm: footingDepthMm,
      embedMm: footingEmbedMm,
      riseWidthMm: b,
      baseWidthMm,
      sectionM2: round(sectionMm2 / 1e6, 4),
      volumeM3: round(footingVolM3, 2),
    },
    checks,
    advice,
    verdict: ng.length === 0 ? "適合" : "不適合",
    ngCount: ng.length,
    notes,
  };
}
