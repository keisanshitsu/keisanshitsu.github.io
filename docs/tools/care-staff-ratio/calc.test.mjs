// 介護施設の人員配置基準のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 「三又はその端数を増すごとに一」は切り上げ（90人→30、90.1人→31）
//   (2) 特養の看護職員の段階の境界（30・50・130 ちょうどは下の段。130を超えたら50又はその端数ごとに1）
//   (3) 特定施設の看護職員の段階（30ちょうどは1。30を超えたら50又はその端数ごとに1）
//   (4) 特定施設の介護予防の利用者は 3/10 を掛けてから要介護と合計し、そのあと切り上げる
//       （要介護と要支援を別々に切り上げると多く出る・別々に切り捨てると少なく出る）
//   (5) 第175条第9項の 0.9 は総数（イ）だけに掛ける（看護職員（ロ）には掛けない）
//   (6) 入所者の数の小数点第二位以下は切り上げ（老企第43号ほか）
//   (7) ユニット型: 昼間はユニットごとに1・夜間は2ユニットごとに1（切り上げ）
//   (8) 配置人数の判定（ちょうどは足りる・0.1人少ないと不足）と入力の検証

import {
  ceilDiv,
  parsePeopleTenths,
  parseStaffTenths,
  perThree,
  perHundred,
  tokuyouNurse,
  tokuteiNurse,
  tokuteiPerThree,
  fmtThousandths,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

const T = (facility, residents, extra = {}) => calculate({ facility, residents, ...extra });
const S = (careUsers, supportUsers, extra = {}) => calculate({ facility: "tokutei", careUsers, supportUsers, ...extra });

export default function cases() {
  const t = [];

  // ── (1) 三又はその端数を増すごとに一 ─────────────────────────
  t.push(eq("ceilDiv(0,30)＝0", ceilDiv(0, 30), 0));
  t.push(eq("入所者 3人 → 1", perThree(30), 1));
  t.push(eq("入所者 0.1人 → 1（端数でも1）", perThree(1), 1));
  t.push(eq("入所者 90人 → 30（割り切れるときはそのまま）", perThree(900), 30));
  t.push(eq("入所者 90.1人 → 31（端数で1増える）", perThree(901), 31));
  t.push(eq("入所者 91人 → 31", perThree(910), 31));
  t.push(eq("入所者 100人 → 34（33.3… を切り上げ）", perThree(1000), 34));
  t.push(eq("百又はその端数: 100人 → 1・100.1人 → 2", [perHundred(1000), perHundred(1001)], [1, 2]));

  // ── (2) 特養の看護職員の段階 ─────────────────────────
  t.push(eq("特養 看護: 30人ちょうど → 1（三十を超えない）", tokuyouNurse(300), 1));
  t.push(eq("特養 看護: 30.1人 → 2", tokuyouNurse(301), 2));
  t.push(eq("特養 看護: 50人ちょうど → 2", tokuyouNurse(500), 2));
  t.push(eq("特養 看護: 50.1人 → 3", tokuyouNurse(501), 3));
  t.push(eq("特養 看護: 130人ちょうど → 3", tokuyouNurse(1300), 3));
  t.push(eq("特養 看護: 130.1人 → 4（端数でも1加える）", tokuyouNurse(1301), 4));
  t.push(eq("特養 看護: 180人 → 4", tokuyouNurse(1800), 4));
  t.push(eq("特養 看護: 180.1人 → 5", tokuyouNurse(1801), 5));
  t.push(eq("特養 看護: 230人 → 5", tokuyouNurse(2300), 5));

  // ── (3) 特定施設の看護職員の段階 ─────────────────────────
  t.push(eq("特定施設 看護: 30人ちょうど → 1", tokuteiNurse(300), 1));
  t.push(eq("特定施設 看護: 30.1人 → 2", tokuteiNurse(301), 2));
  t.push(eq("特定施設 看護: 80人 → 2", tokuteiNurse(800), 2));
  t.push(eq("特定施設 看護: 80.1人 → 3", tokuteiNurse(801), 3));
  t.push(eq("特定施設 看護: 130.1人 → 4", tokuteiNurse(1301), 4));

  // ── (4) 特定施設の介護予防 3/10 ─────────────────────────
  t.push(eq("要介護60・要支援0 → 20", tokuteiPerThree(600, 0), 20));
  t.push(eq("要介護60・要支援10 → 63 → 21", tokuteiPerThree(600, 100), 21));
  t.push(eq("要介護60・要支援1 → 60.3 → 21（要支援1人で境界を越える）", tokuteiPerThree(600, 10), 21));
  t.push(eq("要介護59・要支援3 → 59.9 → 20", tokuteiPerThree(590, 30), 20));
  t.push(eq("要介護59・要支援4 → 60.2 → 21", tokuteiPerThree(590, 40), 21));
  // 別々に切り上げると: ceil(59/3)=20 ＋ ceil(4/10)=1 → 21（ここは一致）だが
  // 要介護57・要支援10 → 57＋3＝60 → 20。別々なら ceil(57/3)=19 ＋ ceil(10/10)=1 → 20（一致）
  // 要介護58・要支援5 → 58＋1.5＝59.5 → 20。別々に切り上げると ceil(58/3)=20 ＋ ceil(5/10)=1 → 21（1人多い）
  t.push(eq("要介護58・要支援5 → 59.5 → 20（別々に切り上げると21）", tokuteiPerThree(580, 50), 20));
  // 要介護 0.1単位: 要介護59.9・要支援0.4 → 59.9＋0.12＝60.02 → 21
  t.push(eq("要介護59.9・要支援0.4 → 60.02 → 21（0.01人単位で掛ける）", tokuteiPerThree(599, 4), 21));

  // ── (5) 第175条第9項（0.9） ─────────────────────────
  t.push(eq("特定施設 要介護60: 総数 20.0", S(60, "").text.requiredTotal, "20.0"));
  t.push(eq("特定施設 要介護60・0.9: 総数 18.0", S(60, "", { relaxed: true }).text.requiredTotal, "18.0"));
  t.push(eq("特定施設 要介護61・0.9: 21×0.9＝18.9", S(61, "", { relaxed: true }).text.requiredTotal, "18.9"));
  t.push(eq("0.9 は看護職員には掛けない（要介護60 → 看護2）", S(60, "", { relaxed: true }).nurse.required, 2));
  t.push(eq("0.9 は特養には効かない（relaxed を渡しても 30.0）", T("tokuyou", 90, { relaxed: true }).text.requiredTotal, "30.0"));
  t.push(eq("relaxed は true のときだけ（文字列 'true' は無効）", S(60, "", { relaxed: "true" }).careNurse.relaxed, false));

  // ── (6) 入所者の数の端数 ─────────────────────────
  t.push(eq("'78.3' → 783", parsePeopleTenths("78.3").tenths, 783));
  t.push(eq("'78.31' → 784（第二位以下切り上げ）", parsePeopleTenths("78.31").tenths, 784));
  t.push(eq("'78.30' → 783（0 は切り上げない）", parsePeopleTenths("78.30").tenths, 783));
  t.push(eq("'78.301' → 784", parsePeopleTenths("78.301").tenths, 784));
  t.push(eq("'78' → 780", parsePeopleTenths("78").tenths, 780));
  t.push(eq("'0.01' → 1", parsePeopleTenths("0.01").tenths, 1));
  t.push(eq("切り上げたことを示す", parsePeopleTenths("78.31").roundedUp, true));
  t.push(eq("'90.01' の特養は 90.1人扱いで総数31", T("tokuyou", "90.01").careNurse.perThree, 31));

  // ── 施設ごとの通しの例（手計算） ─────────────────────────
  // 特養 78.3人: 総数 ceil(26.1)＝27、看護 3（50を超えて130を超えない）、生活相談員 1
  const k783 = T("tokuyou", "78.3");
  t.push(eq("特養 78.3人: 総数27.0・看護3", [k783.text.requiredTotal, k783.nurse.required], ["27.0", 3]));
  t.push(eq("特養 78.3人: 生活相談員 1人以上", k783.others[0].value, "1人以上（常勤）"));
  t.push(eq("特養 150人: 生活相談員 2・介護支援専門員 標準2", [T("tokuyou", 150).others[0].value, T("tokuyou", 150).others[1].value],
    ["2人以上（常勤）", "1人以上（標準 2人）"]));
  // 老健 100人: 総数34、看護の目安 34×2/7＝9.714… → 9.7、介護 24.3、医師 1、支援相談員 1人以上
  const r100 = T("rouken", 100);
  t.push(eq("老健 100人: 総数34.0", r100.text.requiredTotal, "34.0"));
  t.push(eq("老健 100人: 看護の目安 9.7・介護の目安 24.3", [r100.nurse.guideTenths, r100.nurse.careGuideTenths], [97, 243]));
  t.push(eq("老健は看護職員の最低数を出さない（null）", r100.nurse.required, null));
  t.push(eq("老健 100人: 医師 常勤換算1", r100.others[0].value, "常勤換算 1人以上"));
  t.push(eq("老健 100人: 支援相談員 1人以上", r100.others[1].value, "1人以上"));
  t.push(eq("老健 85.3人: 医師 0.853", T("rouken", "85.3").others[0].value, "常勤換算 0.853人以上"));
  t.push(eq("老健 150人: 支援相談員 常勤1＋0.5", T("rouken", 150).others[1].value, "常勤1人＋常勤換算 0.5人以上"));
  t.push(eq("老健 150人: 理学療法士等 1.5", T("rouken", 150).others[2].value, "常勤換算 1.5人以上"));
  t.push(eq("fmtThousandths(1000)＝'1'・(1530)＝'1.53'", [fmtThousandths(1000), fmtThousandths(1530)], ["1", "1.53"]));
  // 特定施設 要介護54・要支援6: 54＋1.8＝55.8 → 19、総利用者60 → 看護 1＋ceil(30/50)＝2、生活相談員 1
  const s546 = S(54, 6);
  t.push(eq("特定施設 要介護54・要支援6: 総数19.0・看護2", [s546.text.requiredTotal, s546.nurse.required], ["19.0", 2]));
  t.push(eq("特定施設 要支援ありは第175条第2項", s546.people.clause, "第175条第2項"));
  t.push(eq("特定施設 要支援なしは第175条第1項", S(54, "").people.clause, "第175条第1項"));
  t.push(eq("特定施設 看護は総利用者数で数える（要介護30・要支援1 → 31人 → 2）", S(30, 1).nurse.required, 2));
  t.push(eq("特定施設 生活相談員の条文は第1項／第2項を切り替える",
    [S(54, "").others[0].basis, s546.others[0].basis], ["第175条第1項第1号・第4項", "第175条第2項第1号・第4項"]));
  t.push(eq("特定施設 要介護95・要支援10: 生活相談員は総利用者105で 2", S(95, 10).others[0].value, "常勤換算 2人以上（1人以上は常勤）"));

  // ── (7) ユニット型 ─────────────────────────
  t.push(eq("10ユニット: 昼間10・夜間5", [T("tokuyou", 100, { units: 10 }).unit.day, T("tokuyou", 100, { units: 10 }).unit.night], [10, 5]));
  t.push(eq("5ユニット: 夜間3（2ユニットごと・切り上げ）", T("tokuyou", 50, { units: 5 }).unit.night, 3));
  t.push(eq("1ユニット: 夜間1", T("rouken", 10, { units: 1 }).unit.night, 1));
  t.push(eq("ユニット数が空欄なら出さない", T("tokuyou", 100).unit, null));
  t.push(eq("特定施設はユニットを扱わない", S(60, "", { units: 4 }).unit, null));

  // ── (8) 判定と入力の検証 ─────────────────────────
  t.push(eq("特養 90人・配置30.0は足りる", T("tokuyou", 90, { staffTotal: 30 }).staff.total.enough, true));
  t.push(eq("特養 90人・配置29.9は0.1不足", [T("tokuyou", 90, { staffTotal: "29.9" }).staff.total.enough,
    T("tokuyou", 90, { staffTotal: "29.9" }).staff.total.shortfallTenths], [false, 1]));
  t.push(eq("特養 50.1人・看護2.9は不足（必要3）", T("tokuyou", "50.1", { staffNurse: "2.9" }).staff.nurse.enough, false));
  t.push(eq("特養 50人・看護2.0は足りる", T("tokuyou", 50, { staffNurse: 2 }).staff.nurse.enough, true));
  t.push(eq("特定施設 0.9 なら 18.0 で足りる", S(60, "", { relaxed: true, staffTotal: 18 }).staff.total.enough, true));
  t.push(eq("特定施設 0.9 でなければ 18.0 は 2.0 不足", S(60, "", { staffTotal: 18 }).staff.total.shortfallTenths, 20));
  t.push(eq("老健の看護職員は判定しない（enough=null）", T("rouken", 100, { staffNurse: 9 }).staff.nurse.enough, null));
  t.push(eq("配置人数が空欄なら判定しない", T("tokuyou", 90).staff, null));
  t.push(eq("看護 > 総数はエラー", T("tokuyou", 90, { staffTotal: 10, staffNurse: 11 }).ok, false));
  t.push(eq("配置人数 2桁の小数はエラー", T("tokuyou", 90, { staffTotal: "29.95" }).ok, false));
  t.push(eq("配置人数が数でないとエラー", T("tokuyou", 90, { staffTotal: "abc" }).ok, false));
  t.push(eq("入所者が空欄はエラー", T("tokuyou", "").ok, false));
  t.push(eq("入所者 0 はエラー", T("tokuyou", 0).ok, false));
  t.push(eq("入所者が負はエラー", T("tokuyou", -5).ok, false));
  t.push(eq("入所者が数でないとエラー", T("rouken", "abc").ok, false));
  t.push(eq("入所者 1,000人は受け付ける（総数 334）", T("tokuyou", 1000).careNurse.perThree, 334));
  t.push(eq("入所者 1,000.1人はエラー", T("tokuyou", "1000.1").ok, false));
  t.push(eq("特定施設 利用者が両方空はエラー", S("", "").ok, false));
  t.push(eq("特定施設 要介護が負はエラー", S(-1, 3).ok, false));
  t.push(eq("ユニット 0 はエラー", T("tokuyou", 100, { units: 0 }).ok, false));
  t.push(eq("ユニット 1.5 はエラー", T("tokuyou", 100, { units: 1.5 }).ok, false));
  t.push(eq("parseStaffTenths('18')＝180・('18.5')＝185", [parseStaffTenths("18"), parseStaffTenths("18.5")], [180, 185]));
  t.push(eq("未知の施設は特養として扱う", T("unknown", 90).facility, "tokuyou"));

  return t;
}
