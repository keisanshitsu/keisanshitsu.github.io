// 歩合給の割増賃金（残業代）の計算のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 法令由来の率: 時間外 25・60時間超 50・休日 35・深夜 25（第37条・割増賃金令）。固定給は 1.0 を含め、歩合給は含めない
//   (2) 施行規則 第20条の 5割・7割5分・6割が「時間外・休日の率＋深夜の率」に一致すること
//   (3) 労働局の計算例: 兵庫労働局委託の資料の事例①（198,575円）・事例②（211,250円）、各行の金額
//   (4) 1時間あたりの賃金: 固定給÷所定（第19条第1項第4号）、歩合給÷総労働時間（第6号）、両方なら別々に（第7号）
//   (5) 月60時間: 60:00 と 60:01 の境、法定休日の労働は60時間に数えない
//   (6) 端数: 途中で丸めない、表示は円未満を切り上げ、合計は端数を持ったまま足してから切り上げ
//   (7) 入力の検証（必要な時間の欠け・総労働時間の不足・1分単位・整数の円・上限）
//   (8) 払われた額との比較（ちょうどは足りる・1円不足）
//   (9) 本文の条文・通知・計算例の引用が calc.js と食い違わないこと

import { readFileSync } from "node:fs";
import {
  RATE,
  LIMIT_60H_MIN,
  parseHours,
  parseYen,
  premium,
  ceilYen,
  calculate,
  fmtPerHour,
  fmtMin,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected: JSON.stringify(expected),
  actual: JSON.stringify(actual),
});

const lineYen = (res, part, key) => res.lines.find((l) => l.part === part && l.key === key)?.yen ?? null;

export default function () {
  const t = [];

  // (1) 率
  t.push(eq("固定給の率（1.0 を含む）: 時間外125・60時間超150・休日135・深夜25", RATE.fixed, { overtime: 125, overtime60: 150, holiday: 135, night: 25 }));
  t.push(eq("歩合給の率（割増分だけ）: 時間外25・60時間超50・休日35・深夜25", RATE.piece, { overtime: 25, overtime60: 50, holiday: 35, night: 25 }));
  t.push(eq("固定給と歩合給の率の差は、時間外・休日で 100（1.0）、深夜で 0", [
    RATE.fixed.overtime - RATE.piece.overtime, RATE.fixed.overtime60 - RATE.piece.overtime60,
    RATE.fixed.holiday - RATE.piece.holiday, RATE.fixed.night - RATE.piece.night], [100, 100, 100, 0]));
  t.push(eq("60時間＝3600分", LIMIT_60H_MIN, 3600));

  // (2) 施行規則 第20条: 時間外＋深夜 5割、60時間超＋深夜 7割5分、休日＋深夜 6割
  t.push(eq("第20条: 時間外＋深夜＝50・60時間超＋深夜＝75・休日＋深夜＝60（歩合給の率の和）", [
    RATE.piece.overtime + RATE.piece.night, RATE.piece.overtime60 + RATE.piece.night, RATE.piece.holiday + RATE.piece.night], [50, 75, 60]));

  // (3) 兵庫労働局委託の資料 事例①: 固定給 91,800・所定170・歩合 80,000・総労働200・時間外30（うち深夜15）
  const ex1 = calculate({ monthly: "91800", monthlyHours: "170", piece: "80000", totalHours: "200", overtime: "30", night: "15" });
  t.push(eq("事例①: 計算できる", ex1.ok, true));
  t.push(eq("事例①: 固定給 91,800÷170×1.25×30＝20,250", lineYen(ex1, "fixed", "overtime"), 20250));
  t.push(eq("事例①: 固定給 91,800÷170×0.25×15＝2,025", lineYen(ex1, "fixed", "night"), 2025));
  t.push(eq("事例①: 歩合給 80,000÷200×0.25×30＝3,000", lineYen(ex1, "piece", "overtime"), 3000));
  t.push(eq("事例①: 歩合給 80,000÷200×0.25×15＝1,500", lineYen(ex1, "piece", "night"), 1500));
  t.push(eq("事例①: 割増賃金の合計 26,775円", ex1.totalYen, 26775));
  t.push(eq("事例①: 賃金の合計 198,575円（資料の「合計」）", ex1.wageTotalYen, 198575));
  t.push(eq("事例①: 固定給の部分 22,275円・歩合給の部分 4,500円", ex1.parts.map((p) => p.subtotalYen), [22275, 4500]));
  t.push(eq("事例①: 1時間あたり 固定給 540.00円（÷所定）・歩合給 400.00円（÷総労働）", ex1.parts.map((p) => fmtPerHour(p.perHour)), ["540.00", "400.00"]));

  // 事例②: オール歩合 200,000・総労働200・時間外30（うち深夜15）
  const ex2 = calculate({ piece: "200000", totalHours: "200", overtime: "30", night: "15" });
  t.push(eq("事例②: 200,000÷200×0.25×30＝7,500・×0.25×15＝3,750", [lineYen(ex2, "piece", "overtime"), lineYen(ex2, "piece", "night")], [7500, 3750]));
  t.push(eq("事例②: 賃金の合計 211,250円", ex2.wageTotalYen, 211250));
  t.push(eq("事例②: 固定給の行は無い", ex2.parts.map((p) => p.kind), ["piece"]));

  // スタートアップ労働条件・中小企業のコラムの例: 歩合給 12万・総労働200・時間外30 → 600×0.25×30＝4,500
  const ex3 = calculate({ piece: "120000", totalHours: "200", overtime: "30" });
  t.push(eq("歩合給 120,000÷200＝600円 ×0.25×30＝4,500円", [fmtPerHour(ex3.parts[0].perHour), ex3.totalYen], ["600.00", 4500]));

  // (4) 歩合給は所定ではなく総労働時間で割る（所定で割ると多く出る）
  const byTotal = calculate({ piece: "80000", totalHours: "200", overtime: "30" }).totalYen;
  t.push(eq("歩合給は総労働時間で割る（200時間なら 3,000円。170時間で割ると 3,530円で誤り）", byTotal, 3000));
  t.push(eq("固定給だけ: 170,000÷170×1.25×10＝12,500", calculate({ monthly: "170000", monthlyHours: "170", overtime: "10" }).totalYen, 12500));
  t.push(eq("固定給だけ: 総労働時間は要らない", calculate({ monthly: "170000", monthlyHours: "170", overtime: "10" }).ok, true));
  t.push(eq("所定内の深夜だけ: 固定給 1,000円/時 ×0.25×8＝2,000", calculate({ monthly: "170000", monthlyHours: "170", night: "8" }).totalYen, 2000));
  t.push(eq("法定休日だけ: 固定給 1,000円/時 ×1.35×8＝10,800、歩合給 500円/時 ×0.35×8＝1,400", (() => {
    const r = calculate({ monthly: "170000", monthlyHours: "170", piece: "100000", totalHours: "200", holiday: "8" });
    return [lineYen(r, "fixed", "holiday"), lineYen(r, "piece", "holiday"), r.totalYen];
  })(), [10800, 1400, 12200]));

  // (5) 月60時間の境（固定給 1,000円/時）
  const at = (ot, extra = {}) => calculate({ monthly: "170000", monthlyHours: "170", overtime: ot, ...extra });
  t.push(eq("60時間ちょうど: 全部 1.25（75,000円）・60時間超の行なし", [at("60").totalYen, at("60").lines.map((l) => l.key)], [75000, ["overtime"]]));
  const r601 = at(String(60 + 1 / 60)); // 60時間1分（3601分）
  t.push(eq("60時間1分: 60時間は 1.25、1分は 1.5（75,000＋25＝75,025円）", [r601.totalYen, r601.hours.overtime, r601.hours.overtime60], [75025, 3600, 1]));
  const r6001 = calculate({ monthly: "170000", monthlyHours: "170", overtime: "60.25" }); // 60時間15分
  t.push(eq("60時間15分: 75,000＋1,000×1.5×0.25＝75,375円", [r6001.totalYen, r6001.hours.overtime60], [75375, 15]));
  t.push(eq("70時間: 75,000＋1,000×1.5×10＝90,000円", at("70").totalYen, 90000));
  t.push(eq("70時間: 60時間超の分は10時間（600分）と注記", at("70").notes, [{ key: "over60", min: 600 }]));
  t.push(eq("歩合給の60時間超: 500円/時 ×0.5×10＝2,500（60時間までは ×0.25×60＝7,500）", (() => {
    const r = calculate({ piece: "120000", totalHours: "240", overtime: "70" });
    return [lineYen(r, "piece", "overtime"), lineYen(r, "piece", "overtime60")];
  })(), [7500, 2500]));
  t.push(eq("法定休日の労働は60時間に数えない（時間外50＋休日20 → 時間外は全部 1.25）", (() => {
    const r = at("50", { holiday: "20" });
    return [r.hours.overtime, r.hours.overtime60, r.hours.holiday, lineYen(r, "fixed", "overtime"), lineYen(r, "fixed", "holiday")];
  })(), [3000, 0, 1200, 62500, 27000]));
  t.push(eq("60時間超と深夜が重なると 1.5＋0.25＝1.75 に当たる（歩合給なら 0.5＋0.25＝0.75）", RATE.fixed.overtime60 + RATE.fixed.night, 175));

  // (6) 端数
  const frac = calculate({ piece: "100000", totalHours: "199", overtime: "1" }); // 502.51...×0.25 = 125.628...
  t.push(eq("端数: 100,000÷199×0.25×1＝125.63… → 126円（切り上げ）", frac.totalYen, 126));
  t.push(eq("端数: 1時間あたり 502.51円（表示は四捨五入）", fmtPerHour(frac.parts[0].perHour), "502.51"));
  t.push(eq("ceilYen: ちょうどは切り上げない", [ceilYen({ num: 300n, den: 100n }), ceilYen({ num: 301n, den: 100n })], [3, 4]));
  t.push(eq("premium: 91,800円・170時間・30時間・125 → 20,250 ちょうど", ceilYen(premium(91800, 170 * 60, 30 * 60, 125)), 20250));
  const sumLater = calculate({ monthly: "100000", monthlyHours: "170", overtime: "1", night: "1" });
  // 588.235.../時: ×1.25 → 735.29… 、×0.25 → 147.05… 和 882.35… → 883（行ごとに切り上げて足すと 736＋148＝884 で1円多い）
  t.push(eq("合計は端数を持ったまま足してから切り上げる（882.35… → 883。行の和 884 ではない）",
    [sumLater.totalYen, sumLater.lines.map((l) => l.yen)], [883, [736, 148]]));
  const bigN = calculate({ monthly: "100000000", monthlyHours: "1", piece: "100000000", totalHours: "744", overtime: "684", holiday: "60", night: "744" });
  t.push(eq("大きい数でも精度を落とさない（BigInt）", [bigN.ok, Number.isSafeInteger(bigN.totalYen)], [true, true]));

  // (7) 入力の検証
  const err = (input) => { const r = calculate(input); return r.ok ? "ok" : r.errors[0]; };
  t.push(eq("固定給も歩合給も無い → エラー", err({ overtime: "10" }).startsWith("固定給（月給）か歩合給"), true));
  t.push(eq("固定給があって所定労働時間が無い → エラー", err({ monthly: "170000", overtime: "10" }).includes("1か月平均所定労働時間"), true));
  t.push(eq("歩合給があって総労働時間が無い → エラー", err({ piece: "80000", overtime: "10" }).includes("総労働時間"), true));
  t.push(eq("時間が全部空欄 → エラー", err({ monthly: "170000", monthlyHours: "170" }).includes("どれかを入力"), true));
  t.push(eq("総労働時間が時間外＋休日より短い → エラー", err({ piece: "80000", totalHours: "30", overtime: "25", holiday: "6" }).includes("より短く"), true));
  t.push(eq("総労働時間＝時間外＋休日ちょうどは通す", err({ piece: "80000", totalHours: "31", overtime: "25", holiday: "6" }), "ok"));
  t.push(eq("深夜が総労働時間より長い → エラー", err({ piece: "80000", totalHours: "10", night: "11" }).includes("深夜"), true));
  t.push(eq("円は整数だけ（1.5円はエラー）", err({ monthly: "1.5", monthlyHours: "170", overtime: "1" }).includes("整数"), true));
  t.push(eq("負の数はエラー", err({ monthly: "-1", monthlyHours: "170", overtime: "1" }).includes("整数"), true));
  t.push(eq("カンマ区切りの円は受け付ける", calculate({ monthly: "170,000", monthlyHours: "170", overtime: "10" }).totalYen, 12500));
  t.push(eq("1分単位にならない時間（0.01時間）はエラー", err({ monthly: "170000", monthlyHours: "170", overtime: "0.01" }).includes("1分単位"), true));
  t.push(eq("744時間を超える時間はエラー", err({ monthly: "170000", monthlyHours: "745", overtime: "1" }).includes("744時間"), true));
  t.push(eq("744時間ちょうどは通す", err({ piece: "80000", totalHours: "744", overtime: "1" }), "ok"));
  t.push(eq("1億円を超える額はエラー", err({ monthly: "100000001", monthlyHours: "170", overtime: "1" }).includes("整数"), true));
  t.push(eq("parseHours: 7.75 → 465分・空欄 undefined・文字 null", [parseHours("7.75"), parseHours(""), parseHours("abc")], [465, undefined, null]));
  t.push(eq("parseYen: 0 は 0・空欄 undefined", [parseYen("0"), parseYen(" ")], [0, undefined]));
  t.push(eq("固定給 0 円・歩合給ありは歩合給だけで計算", calculate({ monthly: "0", piece: "200000", totalHours: "200", overtime: "30" }).parts.map((p) => p.kind), ["piece"]));

  // (8) 払われた額との比較
  const cmp = (paid) => calculate({ monthly: "91800", monthlyHours: "170", piece: "80000", totalHours: "200", overtime: "30", night: "15", paid }).comparison;
  t.push(eq("払われた額 26,775円（ちょうど）は足りる", cmp("26775"), { paid: 26775, short: 0, ok: true }));
  t.push(eq("払われた額 26,774円 は1円不足", cmp("26774"), { paid: 26774, short: 1, ok: false }));
  t.push(eq("払われた額が空欄なら比較しない", cmp(""), null));
  t.push(eq("払われた額 30,000円 は最低額以上", cmp("30000").ok, true));

  // 表示の関数
  t.push(eq("fmtMin: 60時間・60時間15分", [fmtMin(3600), fmtMin(3615)], ["60時間", "60時間15分"]));
  t.push(eq("fmtPerHour: 1,000.00", fmtPerHour({ num: 170000n * 60n, den: 10200n }), "1,000.00"));

  // (9) 本文の引用
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const s of [
    "当該延長して労働させた時間が一箇月について六十時間を超えた場合においては、その超えた時間の労働については、通常の労働時間の賃金の計算額の五割以上の率で計算した割増賃金を支払わなければならない",
    "延長した労働時間の労働については二割五分とし、これらの規定により労働させた休日の労働については三割五分とする",
    "出来高払制その他の請負制によつて計算された賃金の総額を当該賃金算定期間における、総労働時間数で除した金額",
    "その金額を月における所定労働時間数（月によつて所定労働時間数が異る場合には、一年間における一月平均所定労働時間数）で除した金額",
    "労働者の受ける賃金が前各号の二以上の賃金よりなる場合には、その部分について各号によつてそれぞれ算定した金額の合計額",
    "100％分については支払い済みであると考えられ、割増賃金としては、割増分のみの支払いで足りるのが原則とされています",
    "月60時間の時間外労働時間の算定には、法定休日に行った労働時間は含まれませんが、それ以外の休日に行った労働時間は含まれます",
  ]) t.push(eq(`本文に条文・通知の逐語「${s.slice(0, 30)}…」がある`, html.includes(s), true));
  t.push(eq("本文の事例①の数字（20,250・2,025・3,000・1,500・198,575）が計算と一致",
    ["20,250", "2,025", "3,000", "1,500", "198,575"].map((s) => html.includes(s)), [true, true, true, true, true]));
  t.push(eq("本文の事例②の数字（7,500・3,750・211,250）と FAQ の内訳（22,275・4,500・26,775）がある",
    ["7,500", "3,750", "211,250", "22,275円", "4,500円", "26,775円"].map((s) => html.includes(s)), [true, true, true, true, true, true]));
  t.push(eq("本文の率の表記（×1.25・×0.25・1.35・0.35・1.5・0.5）が calc.js と一致",
    [RATE.fixed.overtime === 125 && html.includes("1.25"), RATE.piece.overtime === 25 && html.includes("0.25"),
      RATE.fixed.holiday === 135 && html.includes("1.35"), RATE.piece.holiday === 35 && html.includes("0.35"),
      RATE.fixed.overtime60 === 150 && html.includes("60時間超 1.5"), RATE.piece.overtime60 === 50 && html.includes("60時間超 0.5")],
    [true, true, true, true, true, true]));
  t.push(eq("プリセット（労働局の例①）が事例①の入力と同じ",
    html.includes('mix: { monthly: 91800, monthlyHours: 170, piece: 80000, totalHours: 200, overtime: 30, night: 15 }'), true));

  return t;
}
