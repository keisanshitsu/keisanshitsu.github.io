// 介護施設の夜勤職員の配置基準のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 従来型の段階の境界（25・60・80・100 ちょうどは下の段。101人から 25又はその端数ごとに1）
//   (2) 人数は前年度の平均の小数点以下を切り上げ（老企第40号 第二の1(6)③の読み替え）。25.01人は26人＝2人
//   (3) 併設は合計してから切り上げる（通知の例: 入所者70人＋短期20人＝90人→4人）
//   (4) 見守り機器の 0.8 は 26人以上（b〜e）にだけ掛かる。常時配置は60人以下1人・61人以上2人
//   (5) ユニット型は2ユニットごとに1（切り上げ）。併設の組み合わせごとの条文（÷20）
//   (6) ユニット型特養＋ユニット型短期は2つの読み方を出し、多いほうを見出しにする
//   (7) 老健: 2人・見守りで1.6人・40人以下＋緊急時の連絡体制で1人（41人では使えない）
//   (8) 1日平均夜勤職員数は延夜勤時間÷（日数×16）を小数点第3位以下切り捨て
//   (9) 加算（＋1）と老健の加算（20ごとに1以上・かつ2（40人以下は1）を超える＝ちょうど2は不可）
//   (10) 減算: 満たない日が2日以上連続、または4日以上（3日ばらばらは減算なし）
//   (11) 入力の検証

import {
  ceilDiv,
  parseHundredths,
  tokuyouTable,
  tableLetter,
  dailyAverageHundredths,
  judgeShortfallDays,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected: JSON.stringify(expected),
  actual: JSON.stringify(actual),
});

const req = (input) => {
  const r = calculate(input);
  return r.ok ? r.requiredTenths : r.errors[0];
};

export default function cases() {
const T = [];

// 基本関数
T.push(eq("ceilDiv(40,20)=2", ceilDiv(40, 20), 2));
T.push(eq("ceilDiv(41,20)=3", ceilDiv(41, 20), 3));
T.push(eq("parseHundredths 70.25", parseHundredths("70.25"), 7025));
T.push(eq("parseHundredths 70.2", parseHundredths("70.2"), 7020));
T.push(eq("parseHundredths 70", parseHundredths("70"), 7000));
T.push(eq("parseHundredths 小数第3位は拒否", parseHundredths("70.251"), null));
T.push(eq("parseHundredths 負は拒否", parseHundredths("-1"), null));

// (1) 段階の境界
const table = [[1, 1], [25, 1], [26, 2], [60, 2], [61, 3], [80, 3], [81, 4], [100, 4], [101, 5], [125, 5], [126, 6], [150, 6], [151, 7]];
for (const [p, n] of table) T.push(eq(`段階 ${p}人→${n}人`, tokuyouTable(p), n));
T.push(eq("号 25→a", tableLetter(25), "a"));
T.push(eq("号 26→b", tableLetter(26), "b"));
T.push(eq("号 101→e", tableLetter(101), "e"));
T.push(eq("特養 60人 → 2.0人", req({ facility: "tokuyou", residents: "60" }), 20));
T.push(eq("特養 61人 → 3.0人", req({ facility: "tokuyou", residents: "61" }), 30));

// (2) 小数点以下の切り上げ
T.push(eq("特養 25.00人 → 1人", req({ facility: "tokuyou", residents: "25.00" }), 10));
T.push(eq("特養 25.01人 → 26人として2人", req({ facility: "tokuyou", residents: "25.01" }), 20));
T.push(eq("特養 60.1人 → 61人として3人", req({ facility: "tokuyou", residents: "60.1" }), 30));
T.push(eq("切り上げたことを返す", calculate({ facility: "tokuyou", residents: "25.01" }).people.roundedUp, true));

// (3) 併設は合計してから切り上げ（通知 第二の2(3)②イの例）
T.push(eq("通知の例 70＋20＝90人 → 4人", req({ facility: "tokuyou", residents: "70", shortStay: "normal", shortUsers: "20" }), 40));
T.push(eq("併設 30.4＋30.4＝60.8→61人 → 3人（別々に切り上げると62人で同じ段だが、合計で切り上げる）",
  calculate({ facility: "tokuyou", residents: "30.4", shortStay: "normal", shortUsers: "30.4" }).people.count, 61));
T.push(eq("併設 30.3＋30.3＝60.6→61人（別々に切り上げると31＋31＝62）",
  calculate({ facility: "tokuyou", residents: "30.3", shortStay: "normal", shortUsers: "30.3" }).people.count, 61));
T.push(eq("併設 25.5＋0.5＝26人ちょうど → 2人", req({ facility: "tokuyou", residents: "25.5", shortStay: "normal", shortUsers: "0.5" }), 20));
T.push(eq("併設なしなら短期の人数は数えない", req({ facility: "tokuyou", residents: "50", shortStay: "none", shortUsers: "20" }), 20));
T.push(eq("併設ありで短期の人数が空はエラー", req({ facility: "tokuyou", residents: "50", shortStay: "normal", shortUsers: "" }), "併設する短期入所の利用者の数（前年度の平均）を入力してください。"));

// (4) 見守り機器の 0.8
T.push(eq("見守り 26人 → 2×0.8＝1.6人", req({ facility: "tokuyou", residents: "26", mimamori: true }), 16));
T.push(eq("見守り 60人 → 1.6人・常時1人", calculate({ facility: "tokuyou", residents: "60", mimamori: true }).constant.count, 1));
T.push(eq("見守り 61人 → 3×0.8＝2.4人", req({ facility: "tokuyou", residents: "61", mimamori: true }), 24));
T.push(eq("見守り 61人 → 常時2人", calculate({ facility: "tokuyou", residents: "61", mimamori: true }).constant.count, 2));
T.push(eq("見守り 101人 → 5×0.8＝4.0人", req({ facility: "tokuyou", residents: "101", mimamori: true }), 40));
T.push(eq("見守り 25人 → 対象外で1人", req({ facility: "tokuyou", residents: "25", mimamori: true }), 10));
T.push(eq("見守り 25人 → 常時配置の行は出さない", calculate({ facility: "tokuyou", residents: "25", mimamori: true }).constant, null));
T.push(eq("見守り 併設70＋20 → 4×0.8＝3.2人", req({ facility: "tokuyou", residents: "70", shortStay: "normal", shortUsers: "20", mimamori: true }), 32));

// (5) ユニット型と併設の組み合わせ
T.push(eq("ユニット型特養 10ユニット → 5人", req({ facility: "tokuyouUnit", residents: "100", units: "10" }), 50));
T.push(eq("ユニット型特養 9ユニット → 5人（切り上げ）", req({ facility: "tokuyouUnit", residents: "90", units: "9" }), 50));
T.push(eq("ユニット型特養 1ユニット → 1人", req({ facility: "tokuyouUnit", residents: "10", units: "1" }), 10));
T.push(eq("ユニット型特養に見守りの緩和は無い", req({ facility: "tokuyouUnit", residents: "100", units: "10", mimamori: true }), 50));
T.push(eq("ユニット型特養＋従来型短期 80＋20＝100人 → 5人（÷20）", req({ facility: "tokuyouUnit", residents: "80", units: "8", shortStay: "normal", shortUsers: "20" }), 50));
T.push(eq("ユニット型特養＋従来型短期 80＋20.01＝101人 → 6人", req({ facility: "tokuyouUnit", residents: "80", units: "8", shortStay: "normal", shortUsers: "20.01" }), 60));
T.push(eq("従来型特養＋ユニット型短期 50＋10＝60人 → 3人（÷20）", req({ facility: "tokuyou", residents: "50", shortStay: "unit", shortUsers: "10" }), 30));
T.push(eq("従来型特養＋ユニット型短期 40＋0＝… 短期の人数が空はエラー", req({ facility: "tokuyou", residents: "40", shortStay: "unit" }), "併設する短期入所の利用者の数（前年度の平均）を入力してください。"));
T.push(eq("従来型特養＋ユニット型短期に見守りの緩和は無い", req({ facility: "tokuyou", residents: "50", shortStay: "unit", shortUsers: "10", mimamori: true }), 30));
T.push(eq("ユニット型はユニット数が必須", req({ facility: "tokuyouUnit", residents: "100" }), "ユニット数を入力してください。"));

// (6) ユニット型どうしの併設
const both = calculate({ facility: "tokuyouUnit", residents: "90", units: "9", shortStay: "unit", shortUsers: "10", shortUnits: "1" });
T.push(eq("ユニットどうし 100人÷20＝5・10ユニット÷2＝5 → 5人", both.requiredTenths, 50));
T.push(eq("ユニットどうし 読み方を2つ返す", both.readings.map((r) => r.count), [5, 5]));
const both2 = calculate({ facility: "tokuyouUnit", residents: "81", units: "9", shortStay: "unit", shortUsers: "10", shortUnits: "1" });
T.push(eq("ユニットどうし 91人÷20＝5・10ユニット÷2＝5", both2.readings.map((r) => r.count), [5, 5]));
const both3 = calculate({ facility: "tokuyouUnit", residents: "101", units: "9", shortStay: "unit", shortUsers: "10", shortUnits: "1" });
T.push(eq("ユニットどうし 111人÷20＝6・10ユニット÷2＝5 → 多いほう6人", [both3.readings.map((r) => r.count), both3.requiredTenths], [[6, 5], 60]));
const both4 = calculate({ facility: "tokuyouUnit", residents: "40", units: "5", shortStay: "unit", shortUsers: "10", shortUnits: "2" });
T.push(eq("ユニットどうし 50人÷20＝3・7ユニット÷2＝4 → 多いほう4人", [both4.readings.map((r) => r.count), both4.requiredTenths], [[3, 4], 40]));
T.push(eq("ユニットどうしは短期のユニット数が必須", req({ facility: "tokuyouUnit", residents: "90", units: "9", shortStay: "unit", shortUsers: "10" }), "併設するユニット型の短期入所のユニット数を入力してください。"));

// (7) 老健
T.push(eq("老健 100人 → 2人", req({ facility: "rouken", residents: "100" }), 20));
T.push(eq("老健 見守り → 1.6人", req({ facility: "rouken", residents: "100", mimamori: true }), 16));
T.push(eq("老健 40人＋緊急時の連絡体制 → 1人", req({ facility: "rouken", residents: "40", rouken40: true }), 10));
T.push(eq("老健 39＋1＝40人（短期を足して40）＋連絡体制 → 1人", req({ facility: "rouken", residents: "39", shortUsers: "1", rouken40: true }), 10));
T.push(eq("老健 40.01人＋連絡体制 → 41人なので2人", req({ facility: "rouken", residents: "40.01", rouken40: true }), 20));
T.push(eq("老健 39＋2＝41人＋連絡体制 → 2人", req({ facility: "rouken", residents: "39", shortUsers: "2", rouken40: true }), 20));
T.push(eq("老健 40人＋連絡体制＋見守り → 1人（ただし書が優先）", req({ facility: "rouken", residents: "40", rouken40: true, mimamori: true }), 10));
T.push(eq("老健 40人・連絡体制なし → 2人", req({ facility: "rouken", residents: "40" }), 20));
T.push(eq("ユニット型老健 5ユニット → 3人", req({ facility: "roukenUnit", residents: "50", units: "5" }), 30));
T.push(eq("ユニット型老健に見守りの緩和は無い", req({ facility: "roukenUnit", residents: "50", units: "5", mimamori: true }), 30));

// (8) 1日平均夜勤職員数
T.push(eq("30日・480時間 → 1.00人", dailyAverageHundredths(480 * 60, 30), 100));
T.push(eq("30日・479時間59分 → 0.99人（切り捨て）", dailyAverageHundredths(479 * 60 + 59, 30), 99));
T.push(eq("31日・1000時間 → 2.01人（1000/496=2.016…）", dailyAverageHundredths(1000 * 60, 31), 201));
T.push(eq("28日・1344時間 → 3.00人", dailyAverageHundredths(1344 * 60, 28), 300));
T.push(eq("30日・1439時間 → 2.99人（2.9979…を切り捨て）", dailyAverageHundredths(1439 * 60, 30), 299));
const av = calculate({ facility: "tokuyou", residents: "50", days: "30", nightHours: "1440", nightMinutes: "0" });
T.push(eq("特養50人・30日・1440時間 → 3.00人・加算（2＋1＝3）を満たす", [av.average.hundredths, av.average.bonus.meets], [300, true]));
const av2 = calculate({ facility: "tokuyou", residents: "50", days: "30", nightHours: "1439", nightMinutes: "59" });
T.push(eq("特養50人・30日・1439時間59分 → 2.99人・加算を満たさない", [av2.average.hundredths, av2.average.bonus.meets], [299, false]));
T.push(eq("分だけの入力も受ける", calculate({ facility: "tokuyou", residents: "50", days: "30", nightMinutes: "30" }).average.totalMinutes, 30));

// (9) 加算
const ru = calculate({ facility: "rouken", residents: "60", days: "30", nightHours: "1440" });
T.push(eq("老健60人 → 60÷20＝3人以上かつ2人超・3.00人で満たす", [ru.average.hundredths, ru.average.bonus.meets], [300, true]));
const ru2 = calculate({ facility: "rouken", residents: "41", days: "30", nightHours: "1440" });
T.push(eq("老健41人 → 41÷20＝3人以上・3.00人で満たす", ru2.average.bonus.meets, true));
const ru3 = calculate({ facility: "rouken", residents: "41", days: "30", nightHours: "1439" });
T.push(eq("老健41人・2.99人 → 満たさない", ru3.average.bonus.meets, false));
const ru4 = calculate({ facility: "rouken", residents: "40", days: "30", nightHours: "960" });
T.push(eq("老健40人・2.00人 → 40÷20＝2以上かつ1超で満たす", ru4.average.bonus.meets, true));
const ru5 = calculate({ facility: "rouken", residents: "20", days: "30", nightHours: "480" });
T.push(eq("老健20人・1.00人 → 1人以上だが1を超えないので満たさない", ru5.average.bonus.meets, false));
const ru6 = calculate({ facility: "rouken", residents: "20", days: "30", nightHours: "485" });
T.push(eq("老健20人・1.01人 → 満たす", ru6.average.bonus.meets, true));
const ru7 = calculate({ facility: "rouken", residents: "41", days: "30", nightHours: "960" });
T.push(eq("老健41人・2.00人 → 3人以上が要るので満たさない", ru7.average.bonus.meets, false));
const uu = calculate({ facility: "tokuyouUnit", residents: "100", units: "10", days: "30", nightHours: "2880" });
T.push(eq("ユニット型特養10ユニット → 5＋1＝6人・6.00人で満たす", [uu.average.hundredths, uu.average.bonus.meets], [600, true]));
T.push(eq("見守りの緩和を使うときは加算と比べない", calculate({ facility: "tokuyou", residents: "50", mimamori: true, days: "30", nightHours: "1440" }).average.bonus, null));
T.push(eq("併設（ユニット型特養＋従来型短期）は加算と比べない", calculate({ facility: "tokuyouUnit", residents: "80", units: "8", shortStay: "normal", shortUsers: "20", days: "30", nightHours: "1440" }).average.bonus, null));

// (10) 減算
T.push(eq("3日ばらばら → 減算なし", judgeShortfallDays([3, 10, 20]).reduced, false));
T.push(eq("2日連続 → 減算", judgeShortfallDays([10, 11]).reduced, true));
T.push(eq("2日連続の日を返す", judgeShortfallDays([5, 11, 10]).consecutive, [10, 11]));
T.push(eq("4日ばらばら → 減算", judgeShortfallDays([1, 8, 15, 22]).reduced, true));
T.push(eq("同じ日を2回入れても1日", judgeShortfallDays([3, 3, 10, 20]).days.length, 3));
T.push(eq("1日だけ → 減算なし", judgeShortfallDays([31]).reduced, false));
T.push(eq("30日と31日 → 減算", calculate({ facility: "tokuyou", residents: "50", days: "31", shortfallDays: "30, 31" }).shortfall.reduced, true));
T.push(eq("区切りは読点・空白も可", calculate({ facility: "tokuyou", residents: "50", days: "30", shortfallDays: "3、10 20日" }).shortfall.days, [3, 10, 20]));
T.push(eq("30日の月に31日はエラー", req({ facility: "tokuyou", residents: "50", days: "30", shortfallDays: "31" }), "基準に満たなかった日は 1〜30 の日付を「3, 4, 18」のように入力してください。"));

// (11) 入力の検証
T.push(eq("入所者が空", req({ facility: "tokuyou", residents: "" }), "入所者の数を入力してください。"));
T.push(eq("入所者が0", req({ facility: "tokuyou", residents: "0" }), "入所者の数を入力してください。"));
T.push(eq("入所者が文字", req({ facility: "tokuyou", residents: "abc" }), "入所者の数は 0 以上・小数第2位までの数で入力してください。"));
T.push(eq("入所者 1000人は可", req({ facility: "tokuyou", residents: "1000" }), (4 + ceilDiv(900, 25)) * 10));
T.push(eq("入所者 1000.01人はエラー", req({ facility: "tokuyou", residents: "1000.01" }), "人数は合計 1000 人以下で入力してください。"));
T.push(eq("ユニット数 0 はエラー", req({ facility: "roukenUnit", residents: "10", units: "0" }), "ユニット数は 1〜100 の整数で入力してください。"));
T.push(eq("分が60はエラー", req({ facility: "tokuyou", residents: "50", days: "30", nightHours: "1", nightMinutes: "60" }), "延夜勤時間数は「時間」を 0 以上の整数、「分」を 0〜59 の整数で入力してください。"));
T.push(eq("日数が27はエラー", req({ facility: "tokuyou", residents: "50", days: "27", nightHours: "100" }), "月の日数は 28〜31 から選んでください。"));
T.push(eq("未知の施設は特養（従来型）として扱う", calculate({ facility: "x", residents: "26" }).facility, "tokuyou"));

return T;
}
