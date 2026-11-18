// 障害者グループホーム（共同生活援助）の人員配置基準のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 解釈通知の計算例どおり（12人→世話人 延べ80時間、区分6が2・区分5が4・区分4が6→生活支援員 延べ112時間）
//   (2) 世話人は 包括型・外部型 ÷6、日中型 ÷5、外部型の経過措置（平成26年4月1日に既にあった事業所）÷10
//   (3) 生活支援員は 区分3 ÷9・区分4 ÷6・区分5 ÷4・区分6 ÷2.5 の合計。区分2以下・非該当は数えない。外部型には無い
//   (4) 区分ごとに丸めてから足さない（厳密に足してから表示で切り上げる）
//   (5) サビ管: 30ちょうどは1、30を超えたら30又はその端数ごとに1。30.1〜30.9 は文言の隙間で 2 を出し gap を立てる
//   (6) 利用者の数の小数点第2位以下は切り上げ（障発第1206001号 第二の2(5)①）
//   (7) 常勤の週の時間（32時間を下回るときは32時間）・必要時間は分に切り上げ・足りるかは整数で厳密に比べる
//   (8) 日中型の夜間支援従事者は共同生活住居ごとに1と、入力の検証

import {
  ceilDiv,
  parsePeopleTenths,
  parseHoursHundredths,
  sewaUnits,
  shienUnits,
  sabikan,
  fmtPeople,
  isExactAt2,
  requiredMinutes,
  fmtMinutes,
  enoughHours,
  fteHundredths,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

const C = (type, k, extra = {}) => calculate({ type, ...k, ...extra });

export default function cases() {
  const t = [];

  // ── (1) 解釈通知の計算例（第十五の1(1)(2)） ─────────────────────────
  const ex = C("hokatsu", { k6: "2", k5: "4", k4: "6" }, { fulltime: "40" });
  t.push(eq("通知の例: 利用者12人 → 世話人 2.00人", fmtPeople(ex.sewa.units), "2.00"));
  t.push(eq("通知の例: 世話人 40時間×（12÷6）人＝延べ80時間", fmtMinutes(ex.sewa.minutes), "80時間"));
  t.push(eq("通知の例: 区分6が2・区分5が4・区分4が6 → 生活支援員 2.80人", fmtPeople(ex.shien.units), "2.80"));
  t.push(eq("通知の例: 生活支援員 32＋40＋40＝延べ112時間", fmtMinutes(ex.shien.minutes), "112時間"));
  t.push(eq("通知の例: 区分ごとの時間（区分6 32h・区分5 40h・区分4 40h・区分3 0）",
    ex.shien.parts.map((p) => fmtMinutes(requiredMinutes(p.units, 4000))), ["32時間", "40時間", "40時間", "0時間"]));
  t.push(eq("通知の例: サビ管 1人", ex.sabikan, { required: 1, gap: false }));

  // ── (2) 世話人の除数 ─────────────────────────
  t.push(eq("世話人 ÷6: 6人 → 1.00", fmtPeople(sewaUnits(60, 6)), "1.00"));
  t.push(eq("世話人 ÷6: 13人 → 2.1666… を 2.17 と表示（切り上げ）", fmtPeople(sewaUnits(130, 6)), "2.17"));
  t.push(eq("世話人 ÷6: 13人は小数2桁で割り切れない", isExactAt2(sewaUnits(130, 6)), false));
  t.push(eq("世話人 ÷6: 13人・週40時間 → 86時間40分（5200分ちょうど）", requiredMinutes(sewaUnits(130, 6), 4000), 5200));
  const d20 = C("nicchu", { k6: "4", k5: "6", k4: "6", k3: "4" }, { fulltime: "40" });
  t.push(eq("日中型 ÷5: 20人 → 世話人 4.00人・160時間", [fmtPeople(d20.sewa.units), fmtMinutes(d20.sewa.minutes), d20.sewa.divisor], ["4.00", "160時間", 5]));
  const g7 = C("gaibu", { kLow: "7" }, { fulltime: "40" });
  t.push(eq("外部型 ÷6: 7人 → 1.17人・46時間40分", [fmtPeople(g7.sewa.units), fmtMinutes(g7.sewa.minutes)], ["1.17", "46時間40分"]));
  const g7l = C("gaibu", { kLow: "7" }, { fulltime: "40", legacyGaibu: true });
  t.push(eq("外部型の経過措置 ÷10: 7人 → 0.70人・28時間", [fmtPeople(g7l.sewa.units), fmtMinutes(g7l.sewa.minutes), g7l.sewa.legacy], ["0.70", "28時間", true]));
  const h7l = C("hokatsu", { kLow: "7" }, { legacyGaibu: true });
  t.push(eq("経過措置のチェックは外部型以外では効かない（包括型は ÷6 のまま）", [h7l.sewa.divisor, h7l.sewa.legacy], [6, false]));

  // ── (3) 生活支援員の区分ごとの除数 ─────────────────────────
  t.push(eq("区分3 9人 ÷9 → 1.00", fmtPeople(shienUnits({ k3: 90 })), "1.00"));
  t.push(eq("区分4 6人 ÷6 → 1.00", fmtPeople(shienUnits({ k4: 60 })), "1.00"));
  t.push(eq("区分5 4人 ÷4 → 1.00", fmtPeople(shienUnits({ k5: 40 })), "1.00"));
  t.push(eq("区分6 2.5人 ÷2.5 → 1.00", fmtPeople(shienUnits({ k6: 25 })), "1.00"));
  t.push(eq("区分6 1人 ÷2.5 → 0.40", fmtPeople(shienUnits({ k6: 10 })), "0.40"));
  t.push(eq("区分3 1人 ÷9 → 0.111… を 0.12 と表示", fmtPeople(shienUnits({ k3: 10 })), "0.12"));
  t.push(eq("区分3 1人・週40時間 → 266.66…分を切り上げて 4時間27分", fmtMinutes(requiredMinutes(shienUnits({ k3: 10 }), 4000)), "4時間27分"));
  const low = C("hokatsu", { k6: "1", kLow: "5" });
  t.push(eq("区分2以下5人＋区分6 1人: 世話人は合計6人で 1.00", fmtPeople(low.sewa.units), "1.00"));
  t.push(eq("区分2以下5人＋区分6 1人: 生活支援員は区分6だけで 0.40", fmtPeople(low.shien.units), "0.40"));
  t.push(eq("区分2以下だけ: 生活支援員 0", C("hokatsu", { kLow: "8" }).shien.units, 0));
  t.push(eq("外部型には生活支援員が無い", g7.shien, null));
  const d20s = 72 * 40 + 45 * 60 + 30 * 60 + 20 * 40;
  t.push(eq("日中型 20人（区分6 4・5 6・4 6・3 4）→ 生活支援員 1.6＋1.5＋1＋0.444…＝4.5444… → 4.55", [d20.shien.units, fmtPeople(d20.shien.units)], [d20s, "4.55"]));
  t.push(eq("日中型 20人の生活支援員 週40時間 → 181時間47分（181.77…時間を分に切り上げ）", fmtMinutes(d20.shien.minutes), "181時間47分"));

  // ── (4) 区分ごとに丸めてから足さない ─────────────────────────
  const each = C("hokatsu", { k6: "1", k5: "1", k4: "1", k3: "1" });
  t.push(eq("区分6・5・4・3 各1人 → 0.4＋0.25＋0.1666…＋0.111…＝0.9277… → 0.93（各行を切り上げて足すと 0.94）",
    [each.shien.units, fmtPeople(each.shien.units)], [1670, "0.93"]));

  // ── (5) サービス管理責任者 ─────────────────────────
  t.push(eq("サビ管: 0.1人 → 1", sabikan(1), { required: 1, gap: false }));
  t.push(eq("サビ管: 30人ちょうど → 1（三十以下）", sabikan(300), { required: 1, gap: false }));
  t.push(eq("サビ管: 30.1人 → 2（文言の隙間・多いほう）", sabikan(301), { required: 2, gap: true }));
  t.push(eq("サビ管: 30.9人 → 2（文言の隙間）", sabikan(309), { required: 2, gap: true }));
  t.push(eq("サビ管: 31人 → 2（三十一以上）", sabikan(310), { required: 2, gap: false }));
  t.push(eq("サビ管: 60人 → 2", sabikan(600), { required: 2, gap: false }));
  t.push(eq("サビ管: 60.1人 → 3（端数で1加える）", sabikan(601), { required: 3, gap: false }));
  t.push(eq("サビ管: 90人 → 3・90.1人 → 4", [sabikan(900).required, sabikan(901).required], [3, 4]));
  const s304 = C("hokatsu", { kLow: "30.4" });
  t.push(eq("計算: 利用者30.4人 → サビ管 2人・gap", s304.sabikan, { required: 2, gap: true }));

  // ── (6) 利用者の数の端数 ─────────────────────────
  t.push(eq("12.31 → 12.4（第2位以下を切り上げ）", parsePeopleTenths("12.31"), { tenths: 124, roundedUp: true }));
  t.push(eq("12.30 → 12.3（切り上げない）", parsePeopleTenths("12.30"), { tenths: 123, roundedUp: false }));
  t.push(eq("12.3 → 12.3", parsePeopleTenths("12.3"), { tenths: 123, roundedUp: false }));
  t.push(eq("30.01 → 30.1（サビ管は2人になる側）", sabikan(parsePeopleTenths("30.01").tenths).required, 2));
  const r = C("hokatsu", { k6: "2.51" });
  t.push(eq("区分6 2.51 → 2.6人として ÷2.5 → 1.04・切り上げの印", [r.people.k6, fmtPeople(r.shien.units), r.people.roundedUp], [26, "1.04", true]));
  t.push(eq("延べ数の例 4,385人÷365日＝12.013… → 12.1人（第2位以下を切り上げ）", parsePeopleTenths("12.013698").tenths, 121));

  // ── (7) 常勤の週の時間と判定 ─────────────────────────
  t.push(eq("時間の読み取り: 37.5 → 3750・86.67 → 8667・40 → 4000", [parseHoursHundredths("37.5"), parseHoursHundredths("86.67"), parseHoursHundredths("40")], [3750, 8667, 4000]));
  t.push(eq("時間の読み取り: 1.234・-1・abc は不可", [parseHoursHundredths("1.234"), parseHoursHundredths("-1"), parseHoursHundredths("abc")], [null, null, null]));
  const f375 = C("hokatsu", { k6: "2", k5: "4", k4: "6" }, { fulltime: "37.5" });
  t.push(eq("常勤 週37.5時間 → 生活支援員 37.5×2.8＝105時間", fmtMinutes(f375.shien.minutes), "105時間"));
  const f30 = C("hokatsu", { kLow: "12" }, { fulltime: "30" });
  t.push(eq("常勤 週30時間 → 32時間として計算（世話人 12人 → 64時間）", [f30.fulltime, fmtMinutes(f30.sewa.minutes)], [{ hundredths: 3200, floored: true }, "64時間"]));
  t.push(eq("常勤の時間を空欄 → 40時間", C("hokatsu", { kLow: "12" }).fulltime, { hundredths: 4000, floored: false }));
  const ok112 = C("hokatsu", { k6: "2", k5: "4", k4: "6" }, { shienHours: "112" });
  t.push(eq("生活支援員 112時間ちょうど → 足りる・常勤換算 2.80", [ok112.staff.shien.enough, ok112.staff.shien.fte], [true, 280]));
  const ng112 = C("hokatsu", { k6: "2", k5: "4", k4: "6" }, { shienHours: "111.99" });
  t.push(eq("生活支援員 111.99時間 → 不足・1分足りない", [ng112.staff.shien.enough, ng112.staff.shien.shortMinutes], [false, 1]));
  t.push(eq("世話人 13人: 86.67時間は足りる・86.66時間は不足（5200分ちょうどが境目）",
    [C("hokatsu", { kLow: "13" }, { sewaHours: "86.67" }).staff.sewa.enough, C("hokatsu", { kLow: "13" }, { sewaHours: "86.66" }).staff.sewa.enough], [true, false]));
  t.push(eq("enoughHours: 1800×P と W×必要数を整数で比べる", [enoughHours(8667, 3900, 4000), enoughHours(8666, 3900, 4000)], [true, false]));
  t.push(eq("常勤換算は切り捨て: 86.66時間÷40 → 2.16", fteHundredths(8666, 4000), 216));
  const zero = C("hokatsu", { kLow: "6" }, { sewaHours: "0" });
  t.push(eq("世話人 0時間 → 不足・40時間足りない", [zero.staff.sewa.enough, fmtMinutes(zero.staff.sewa.shortMinutes)], [false, "40時間"]));
  const g7h = C("gaibu", { kLow: "7" }, { shienHours: "10" });
  t.push(eq("外部型では生活支援員の時間を入れても判定しない", g7h.staff.shien, null));

  // ── (8) 日中型の夜間支援従事者と入力の検証 ─────────────────────────
  t.push(eq("日中型 住居3 → 夜間支援従事者 3人", C("nicchu", { kLow: "20" }, { houses: "3" }).night, { houses: 3, required: 3 }));
  t.push(eq("日中型 住居を空欄 → 夜間の表示なし", C("nicchu", { kLow: "20" }).night, null));
  t.push(eq("包括型では住居数を入れても夜間支援従事者を出さない", C("hokatsu", { kLow: "20" }, { houses: "3" }).night, null));
  t.push(eq("住居数 0 は不可", C("nicchu", { kLow: "20" }, { houses: "0" }).ok, false));
  t.push(eq("住居数 1.5 は不可", C("nicchu", { kLow: "20" }, { houses: "1.5" }).ok, false));
  t.push(eq("全部空欄 → 入力を促す", C("hokatsu", {}).errors, ["利用者の数を入力してください。"]));
  t.push(eq("全部0 → 入力を促す", C("hokatsu", { k6: "0", kLow: "0" }).ok, false));
  t.push(eq("負の数は不可", C("hokatsu", { k6: "-1" }).ok, false));
  t.push(eq("文字は不可", C("hokatsu", { k5: "abc" }).ok, false));
  t.push(eq("合計1,000人を超えると不可", C("hokatsu", { k6: "600", kLow: "400.1" }).ok, false));
  t.push(eq("合計1,000人ちょうどは可", C("hokatsu", { k6: "600", kLow: "400" }).ok, true));
  t.push(eq("常勤の時間 0 は不可", C("hokatsu", { kLow: "6" }, { fulltime: "0" }).ok, false));
  t.push(eq("常勤の時間 60.01 は不可・60 は可", [C("hokatsu", { kLow: "6" }, { fulltime: "60.01" }).ok, C("hokatsu", { kLow: "6" }, { fulltime: "60" }).ok], [false, true]));
  t.push(eq("配置時間 1.234 は不可", C("hokatsu", { kLow: "6" }, { sewaHours: "1.234" }).ok, false));
  t.push(eq("知らない類型は包括型として扱う", C("xxx", { kLow: "6" }).type, "hokatsu"));
  t.push(eq("ceilDiv(0,18)＝0・fmtPeople(0)＝0.00", [ceilDiv(0, 18), fmtPeople(0)], [0, "0.00"]));
  t.push(eq("fmtMinutes: 0分・59分・61分", [fmtMinutes(0), fmtMinutes(59), fmtMinutes(61)], ["0時間", "0時間59分", "1時間1分"]));

  return t;
}
