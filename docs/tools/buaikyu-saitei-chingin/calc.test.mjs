// 歩合給の最低賃金チェックのテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 最低賃金額と発効日: calc.js の表（厚労省 xlsx から生成）が、別の資料（厚労省 PDF の全国一覧）と47行すべて一致する
//   (2) 換算の式（施行規則 第2条）: 月給÷1か月平均所定労働時間、日給÷1日の所定労働時間、歩合給÷総労働時間、時給はそのまま。組み合わせは合計
//   (3) 労働局の計算例と同じ値になる（奈良: 720円・740円、新潟: 780円、徳島: 172時間・1,075円・1,108円）
//   (4) 判定は「以上」で、分数のまま比べる（ちょうど同じは満たす・1円足りなければ満たさない）
//   (5) 期間の初日の額・期間中に発効する額の両方で判定し、2027-10-01 以降と収録より前は判定しない
//   (6) 最低賃金に届く額は、施行規則 第2条の式を逆に解いて円未満を切り上げたもの
//   (7) 入力の検証

import { readFileSync } from "node:fs";
import {
  SUPPORTED_FROM,
  UNKNOWN_FROM,
  PREFS,
  rat,
  cmp,
  fmt2,
  fmtHours,
  parseYen,
  parseDecimal,
  validDate,
  rateOn,
  ratesForPeriod,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

// 厚労省「令和８年度地域別最低賃金全国一覧」（https://www.mhlw.go.jp/content/11200000/001753404.pdf）の47行を
// pypdf で抜き出した値（2026-11-24）。並びは北海道〜沖縄。[令和8年度の額, 前年度の額, 引上げ額, 発効年月日]
// calc.js の表は別の資料（xlsx）から作ったので、ここが一致すれば2つの資料が一致していることになる。
const PDF_ROWS = [
  [1131, 1075, 56, "2026-10-01"],
  [1090, 1029, 61, "2026-10-29"],
  [1090, 1031, 59, "2026-12-01"],
  [1098, 1038, 60, "2026-10-01"],
  [1090, 1031, 59, "2026-10-14"],
  [1092, 1032, 60, "2026-10-30"],
  [1094, 1033, 61, "2026-10-16"],
  [1136, 1074, 62, "2026-10-18"],
  [1125, 1068, 57, "2026-10-01"],
  [1120, 1063, 57, "2026-10-03"],
  [1196, 1141, 55, "2026-10-01"],
  [1195, 1140, 55, "2026-10-01"],
  [1280, 1226, 54, "2026-10-01"],
  [1279, 1225, 54, "2026-10-01"],
  [1108, 1050, 58, "2026-10-01"],
  [1119, 1062, 57, "2026-10-01"],
  [1113, 1054, 59, "2026-10-03"],
  [1112, 1053, 59, "2026-10-04"],
  [1113, 1052, 61, "2026-11-01"],
  [1117, 1061, 56, "2026-10-02"],
  [1121, 1065, 56, "2026-10-01"],
  [1154, 1097, 57, "2026-10-15"],
  [1195, 1140, 55, "2026-10-01"],
  [1143, 1087, 56, "2026-10-01"],
  [1136, 1080, 56, "2026-10-03"],
  [1180, 1122, 58, "2026-11-16"],
  [1231, 1177, 54, "2026-10-01"],
  [1172, 1116, 56, "2026-10-01"],
  [1107, 1051, 56, "2026-10-04"],
  [1101, 1045, 56, "2026-10-03"],
  [1090, 1030, 60, "2026-10-03"],
  [1092, 1033, 59, "2026-10-10"],
  [1104, 1047, 57, "2026-10-02"],
  [1141, 1085, 56, "2026-10-11"],
  [1101, 1043, 58, "2026-10-08"],
  [1103, 1046, 57, "2026-11-01"],
  [1092, 1036, 56, "2026-10-01"],
  [1093, 1033, 60, "2026-11-01"],
  [1086, 1023, 63, "2026-10-29"],
  [1114, 1057, 57, "2026-10-04"],
  [1095, 1030, 65, "2026-11-15"],
  [1087, 1031, 56, "2026-11-02"],
  [1092, 1034, 58, "2026-12-01"],
  [1096, 1035, 61, "2026-11-01"],
  [1085, 1023, 62, "2026-10-24"],
  [1090, 1026, 64, "2026-10-25"],
  [1086, 1023, 63, "2026-12-02"],
];

const TOKYO = 13, KYOTO = 26, NARA = 29, TOKUSHIMA = 36, AKITA = 5;
const NOV = { start: "2026-11-01", end: "2026-11-30" };
const base = (o) => ({ pref: TOKYO, ...NOV, ...o });
const total = (r) => (r.ok ? fmt2(r.total) : r.errors);

export default function cases() {
  const t = [];

  // ── (1) 最低賃金の表 ─────────────────────────
  t.push(eq("47都道府県", PREFS.length, 47));
  t.push(eq("コードは1〜47の連番", PREFS.map((p) => p.code), Array.from({ length: 47 }, (_, i) => i + 1)));
  PREFS.forEach((p, i) => {
    const [r8, r7, diff, from] = PDF_ROWS[i];
    const got = [p.rates[2].yen, p.rates[1].yen, p.rates[2].yen - p.rates[1].yen, p.rates[2].from];
    t.push(eq(`${p.name}: 令和8年度 ${r8}円（前年度 ${r7}円・＋${diff}円）${from} 発効が厚労省PDFと一致`, got, [r8, r7, diff, from]));
  });
  t.push(eq("各都道府県で 令和6<7<8 の額・発効日も昇順",
    PREFS.filter((p) => !(p.rates[0].yen < p.rates[1].yen && p.rates[1].yen < p.rates[2].yen &&
      p.rates[0].from < p.rates[1].from && p.rates[1].from < p.rates[2].from)).map((p) => p.name), []));
  t.push(eq("年度は 2024・2025・2026", [...new Set(PREFS.flatMap((p) => p.rates.map((r) => r.fy)))], [2024, 2025, 2026]));
  t.push(eq("収録の初日は令和6年度の最後の発効日（徳島 2024-11-01）", SUPPORTED_FROM, PREFS.map((p) => p.rates[0].from).sort().at(-1)));
  t.push(eq("令和7年度の最後の発効日は秋田の 2026-03-31", PREFS.map((p) => p.rates[1].from).sort().at(-1), "2026-03-31"));
  t.push(eq("令和8年度の最後の発効日は沖縄の 2026-12-02（PDFの答申どおり 10/1〜12/2）", PREFS.map((p) => p.rates[2].from).sort().at(-1), "2026-12-02"));
  t.push(eq("未決定の令和9年度が発効しうる日は 2027-10-01", UNKNOWN_FROM, "2027-10-01"));
  t.push(eq("最高は東京 1,280円・最低は宮崎 1,085円（令和8年度）",
    [PREFS.reduce((a, p) => (p.rates[2].yen > a.rates[2].yen ? p : a)).name, PREFS.reduce((a, p) => (p.rates[2].yen < a.rates[2].yen ? p : a)).name], ["東京都", "宮崎県"]));

  // 発効日の前日と当日
  t.push(eq("東京 2026-09-30 は令和7年度 1,226円", rateOn(TOKYO, "2026-09-30")?.yen, 1226));
  t.push(eq("東京 2026-10-01 から 1,280円", rateOn(TOKYO, "2026-10-01")?.yen, 1280));
  t.push(eq("京都 2026-11-15 は 1,122円", rateOn(KYOTO, "2026-11-15")?.yen, 1122));
  t.push(eq("京都 2026-11-16 から 1,180円", rateOn(KYOTO, "2026-11-16")?.yen, 1180));
  t.push(eq("秋田 2026-03-30 は令和6年度 951円（令和7年度の発効が 3/31）", rateOn(AKITA, "2026-03-30")?.yen, 951));
  t.push(eq("秋田 2026-03-31 から 1,031円", rateOn(AKITA, "2026-03-31")?.yen, 1031));
  t.push(eq("徳島 2024-10-31 は収録外", rateOn(TOKUSHIMA, "2024-10-31"), null));
  t.push(eq("徳島 2024-11-01 は 980円", rateOn(TOKUSHIMA, "2024-11-01")?.yen, 980));
  t.push(eq("2027-10-01 は未決定で null", rateOn(TOKYO, "2027-10-01"), null));
  t.push(eq("2027-09-30 は令和8年度 1,280円", rateOn(TOKYO, "2027-09-30")?.yen, 1280));

  // 期間
  t.push(eq("京都 11/1〜11/30 は期間中に発効 → 2つの額", ratesForPeriod(KYOTO, "2026-11-01", "2026-11-30").rates?.map((r) => r.yen), [1122, 1180]));
  t.push(eq("京都 11/16〜12/15 は 1,180円だけ（初日が発効日）", ratesForPeriod(KYOTO, "2026-11-16", "2026-12-15").rates?.map((r) => r.yen), [1180]));
  t.push(eq("京都 10/16〜11/15 は 1,122円だけ（末日が発効日の前日）", ratesForPeriod(KYOTO, "2026-10-16", "2026-11-15").rates?.map((r) => r.yen), [1122]));
  t.push(eq("京都 10/17〜11/16 は2つの額（末日がちょうど発効日）", ratesForPeriod(KYOTO, "2026-10-17", "2026-11-16").rates?.map((r) => r.yen), [1122, 1180]));
  t.push(eq("東京 11/1〜11/30 は 1,280円だけ", ratesForPeriod(TOKYO, "2026-11-01", "2026-11-30").rates?.map((r) => r.yen), [1280]));
  t.push(eq("秋田 2025-09-01〜2026-10-31 は3つの額", ratesForPeriod(AKITA, "2025-09-01", "2026-10-31").rates?.map((r) => r.yen), [951, 1031, 1090]));
  t.push(eq("末日 2027-09-30 は判定する", ratesForPeriod(TOKYO, "2027-09-01", "2027-09-30").ok, true));
  t.push(eq("末日 2027-10-01 は判定しない", ratesForPeriod(TOKYO, "2027-09-02", "2027-10-01").ok, false));
  t.push(eq("初日が収録より前は判定しない", ratesForPeriod(TOKUSHIMA, "2024-10-16", "2024-11-15").ok, false));
  t.push(eq("初日が末日より後はエラー", ratesForPeriod(TOKYO, "2026-11-30", "2026-11-01").ok, false));
  t.push(eq("初日と末日が同じ日は可", ratesForPeriod(TOKYO, "2026-11-01", "2026-11-01").ok, true));
  t.push(eq("存在しない日（2026-02-30）はエラー", ratesForPeriod(TOKYO, "2026-02-01", "2026-02-30").ok, false));
  t.push(eq("2028-02-29 は存在する日・2027-02-29 は存在しない", [validDate("2028-02-29"), validDate("2027-02-29")], [true, false]));
  t.push(eq("都道府県コード 0 はエラー", ratesForPeriod(0, "2026-11-01", "2026-11-30").ok, false));

  // ── (2)(3) 換算の式と労働局の計算例 ─────────────────────────
  // 奈良労働局「タクシー運転者の最低賃金」: 歩合給 144,000円 ÷ 月間総労働時間 200時間 ＝ 720円
  const naraAll = calculate(base({ pref: NARA, piece: 144000, pieceHours: 200 }));
  t.push(eq("奈良の例（オール歩合）: 144,000÷200＝720円", total(naraAll), "720.00"));
  // 固定給 85,000円 ÷ 所定労働時間 170時間 ＝ 500円、歩合給 48,000円 ÷ 200時間 ＝ 240円、合算 740円
  const naraMix = calculate(base({ pref: NARA, monthly: 85000, monthlyHours: 170, piece: 48000, pieceHours: 200 }));
  t.push(eq("奈良の例（固定＋歩合）: 500＋240＝740円", [naraMix.parts?.map((p) => fmt2(p.perHour)), total(naraMix)], [["500.00", "240.00"], "740.00"]));
  // 新潟労働局（H28.3）: 85,000÷170＝500、56,000÷200＝280、合算 780円
  t.push(eq("新潟の例（固定＋歩合）: 500＋280＝780円", total(calculate(base({ monthly: 85000, monthlyHours: 170, piece: 56000, pieceHours: 200 }))), "780.00"));
  // 徳島労働局「最低賃金額以上かどうかの確認方法」例1: 8時間×258日÷12ヶ月＝172時間、185,000円÷172時間＝1,075円 < 1,103円（令和8年11月1日改正）
  const toku1 = calculate({ pref: TOKUSHIMA, ...NOV, monthly: 185000, annualDays: 258, dayHours: 8 });
  t.push(eq("徳島の例1: 8時間×258日÷12＝172時間", toku1.ok && fmtHours(toku1.parts[0].hours), "172"));
  t.push(eq("徳島の例1: 185,000÷172＝1,075.58円（労働局の表示は 1,075円）", total(toku1), "1,075.58"));
  t.push(eq("徳島の例1: 1,103円に届かない（最低賃金法に違反）", toku1.ok && [toku1.comparisons[0].yen, toku1.comparisons[0].ok], [1103, false]));
  t.push(eq("徳島の例1: 1時間あたり 27.42円足りない（切り上げて表示）", toku1.ok && fmt2(toku1.comparisons[0].short, false), "27.42"));
  t.push(eq("徳島の例1: 届く月給は 1,103×172＝189,716円（あと 4,716円）", toku1.ok && toku1.comparisons[0].need, { kind: "monthly", yen: 189716, more: 4716 }));
  // 例2: 時間給1,050円＋職務手当10,000円（月額）÷172時間 ＝ 1,108円 > 1,103円
  const toku2 = calculate({ pref: TOKUSHIMA, ...NOV, hourly: 1050, monthly: 10000, monthlyHours: 172 });
  t.push(eq("徳島の例2: 1,050＋10,000÷172＝1,108.13円（労働局の表示は 1,108円）", total(toku2), "1,108.13"));
  t.push(eq("徳島の例2: 1,103円以上（適法）", toku2.ok && toku2.allOk, true));
  t.push(eq("徳島の例2: 届いているので不足は0", toku2.ok && fmt2(toku2.comparisons[0].short), "0.00"));

  t.push(eq("日給 10,000円 ÷ 8時間 ＝ 1,250円", total(calculate(base({ daily: 10000, dayHours: 8 }))), "1,250.00"));
  t.push(eq("日給 9,000円 ÷ 7.5時間 ＝ 1,200円", total(calculate(base({ daily: 9000, dayHours: 7.5 }))), "1,200.00"));
  t.push(eq("時給はそのまま", total(calculate(base({ hourly: 1300 }))), "1,300.00"));
  t.push(eq("月給＋日給＋時給＋歩合給の4つの合計", total(calculate(base({ monthly: 17000, monthlyHours: 170, daily: 800, dayHours: 8, hourly: 900, piece: 40000, pieceHours: 200 }))), "1,300.00"));
  t.push(eq("年間所定労働日数と1日の所定労働時間から1か月平均: 245日×8時間÷12＝163.33…時間",
    (() => { const r = calculate(base({ monthly: 200000, annualDays: 245, dayHours: 8 })); return r.ok && [fmtHours(r.parts[0].hours), r.parts[0].hoursFrom]; })(), ["163.33…", "annual"]));
  t.push(eq("1日の所定労働時間 7.75時間（7時間45分）も使える", total(calculate(base({ daily: 9920, dayHours: 7.75 }))), "1,280.00"));
  t.push(eq("1か月平均と年間の両方を入れたら1か月平均を使い、注記を出す",
    (() => { const r = calculate(base({ monthly: 200000, monthlyHours: 160, annualDays: 245, dayHours: 8 })); return r.ok && [r.parts[0].hoursFrom, r.notes.map((n) => n.key)]; })(), ["input", ["monthlyHoursBoth"]]));
  t.push(eq("両方を入れても一致していれば注記なし（240日×8時間÷12＝160）",
    (() => { const r = calculate(base({ monthly: 200000, monthlyHours: 160, annualDays: 240, dayHours: 8 })); return r.ok && r.notes.length; })(), 0));
  t.push(eq("歩合給0円（総労働時間あり）は時間額0円", total(calculate(base({ piece: 0, pieceHours: 180 }))), "0.00"));

  // ── (4) 判定は「以上」・分数のまま ─────────────────────────
  const at = (monthly, hours) => calculate(base({ monthly, monthlyHours: hours }));
  t.push(eq("東京 1,280×160＝204,800円 ÷ 160時間 はちょうど最低賃金 → 満たす", at(204800, 160).allOk, true));
  t.push(eq("204,799円 は 1,279.99…円 → 満たさない", [at(204799, 160).allOk, total(at(204799, 160))], [false, "1,279.99"]));
  t.push(eq("245日×8時間: 209,067円は満たす（1,280.0020…円）", calculate(base({ monthly: 209067, annualDays: 245, dayHours: 8 })).allOk, true));
  t.push(eq("245日×8時間: 209,066円は満たさない（1,279.9959…円）", calculate(base({ monthly: 209066, annualDays: 245, dayHours: 8 })).allOk, false));
  t.push(eq("245日×8時間で届く月給は ceil(1,280×163.33…)＝209,067円",
    calculate(base({ monthly: 200000, annualDays: 245, dayHours: 8 })).comparisons?.[0].need, { kind: "monthly", yen: 209067, more: 9067 }));
  // 3で割り切れない2つの部分がちょうど最低賃金になる: 128,000÷300 ＋ 256,000÷300 ＝ 1,280
  const thirds = calculate(base({ monthly: 128000, monthlyHours: 300, piece: 256000, pieceHours: 300 }));
  t.push(eq("426.66…＋853.33…＝ちょうど1,280円 → 満たす・不足0", [thirds.allOk, fmt2(thirds.comparisons?.[0].short ?? rat(-1))], [true, "0.00"]));
  t.push(eq("歩合給 255,999円 ÷ 200時間 ＝ 1,279.995円 → 満たさない（表示は切り捨て 1,279.99）",
    (() => { const r = calculate(base({ piece: 255999, pieceHours: 200 })); return [r.allOk, total(r), fmt2(r.comparisons[0].short, false)]; })(), [false, "1,279.99", "0.01"]));
  t.push(eq("歩合給 256,000円 ÷ 200時間 ＝ 1,280円 → 満たす", calculate(base({ piece: 256000, pieceHours: 200 })).allOk, true));
  t.push(eq("分数の比較: 1/3 < 0.34", cmp(rat(1, 3), rat(34, 100)), -1));
  t.push(eq("1,075.5813… は切り捨て 1,075.58・切り上げ 1,075.59", [fmt2(rat(185000 * 100, 17200)), fmt2(rat(185000 * 100, 17200), false)], ["1,075.58", "1,075.59"]));

  // ── (5) 発効日をまたぐ期間 ─────────────────────────
  const kyoto = calculate({ pref: KYOTO, ...NOV, monthly: 184000, monthlyHours: 160 });
  t.push(eq("京都 11月（11/16 発効）: 1,150円は旧 1,122円以上・新 1,180円未満", kyoto.ok && kyoto.comparisons.map((c) => [c.yen, c.ok]), [[1122, true], [1180, false]]));
  t.push(eq("またぐ期間は straddle・allOk=false・anyOk=true", kyoto.ok && [kyoto.straddle, kyoto.allOk, kyoto.anyOk], [true, false, true]));
  t.push(eq("東京 11月はまたがない", calculate(base({ hourly: 1300 })).straddle, false));
  t.push(eq("31日を超える期間は注記", calculate({ pref: TOKYO, start: "2026-10-01", end: "2026-11-30", hourly: 1300 }).notes.map((n) => n.key), ["longPeriod"]));
  t.push(eq("31日の期間（10/1〜10/31）は注記なし", calculate({ pref: TOKYO, start: "2026-10-01", end: "2026-10-31", hourly: 1300 }).notes.length, 0));
  t.push(eq("32日の期間（10/1〜11/1）は注記", calculate({ pref: TOKYO, start: "2026-10-01", end: "2026-11-01", hourly: 1300 }).notes.map((n) => n.key), ["longPeriod"]));
  t.push(eq("2027-10-01 を含む期間は判定しない", calculate({ pref: TOKYO, start: "2027-09-16", end: "2027-10-15", hourly: 1300 }).ok, false));

  // ── (6) 最低賃金に届く額 ─────────────────────────
  t.push(eq("東京 11月・オール歩合 144,000円/200時間 → 届く歩合給 1,280×200＝256,000円（あと 112,000円）",
    calculate(base({ piece: 144000, pieceHours: 200 })).comparisons[0].need, { kind: "piece", yen: 256000, more: 112000 }));
  t.push(eq("東京 11月・固定85,000/170＋歩合48,000/200 → 届く歩合給 (1,280−500)×200＝156,000円",
    calculate(base({ monthly: 85000, monthlyHours: 170, piece: 48000, pieceHours: 200 })).comparisons[0].need, { kind: "piece", yen: 156000, more: 108000 }));
  t.push(eq("届く歩合給は円未満を切り上げ: (1,280−500)×190.5時間＝148,590円",
    calculate(base({ monthly: 85000, monthlyHours: 170, piece: 48000, pieceHours: 190.5 })).comparisons[0].need.yen, 148590));
  t.push(eq("切り上げ: (1,280−0)×163.33…＝209,066.66… → 209,067円",
    calculate(base({ monthly: 1, annualDays: 245, dayHours: 8 })).comparisons[0].need.yen, 209067));
  t.push(eq("固定給だけで届いていれば、届く歩合給は0円",
    calculate(base({ monthly: 220000, monthlyHours: 160, piece: 10000, pieceHours: 200 })).comparisons[0].need, { kind: "piece", yen: 0, more: 0 }));
  t.push(eq("日給だけなら届く日給 1,280×8＝10,240円", calculate(base({ daily: 10000, dayHours: 8 })).comparisons[0].need, { kind: "daily", yen: 10240, more: 240 }));
  t.push(eq("時給だけなら届く時給は最低賃金そのもの", calculate(base({ hourly: 1200 })).comparisons[0].need, { kind: "hourly", yen: 1280, more: 80 }));
  t.push(eq("またぐ期間は額ごとに届く額を出す（京都 160時間: 179,520円・188,800円）",
    kyoto.ok && kyoto.comparisons.map((c) => c.need.yen), [179520, 188800]));

  // ── (7) 入力の検証 ─────────────────────────
  const err = (o) => { const r = calculate(base(o)); return r.ok ? "ok" : r.errors.length > 0; };
  t.push(eq("何も入れなければエラー", err({}), true));
  t.push(eq("月給だけで時間が無いとエラー", err({ monthly: 200000 }), true));
  t.push(eq("月給と年間日数だけ（1日の時間なし）はエラー", err({ monthly: 200000, annualDays: 245 }), true));
  t.push(eq("日給だけで1日の時間が無いとエラー", err({ daily: 10000 }), true));
  t.push(eq("歩合給だけで総労働時間が無いとエラー", err({ piece: 100000 }), true));
  t.push(eq("総労働時間 0 はエラー", err({ piece: 100000, pieceHours: 0 }), true));
  t.push(eq("総労働時間 744 は可", err({ piece: 100000, pieceHours: 744 }), "ok"));
  t.push(eq("総労働時間 744.01 はエラー", err({ piece: 100000, pieceHours: 744.01 }), true));
  t.push(eq("1日の所定労働時間 24 は可・24.01 はエラー", [err({ daily: 10000, dayHours: 24 }), err({ daily: 10000, dayHours: 24.01 })], ["ok", true]));
  t.push(eq("年間所定労働日数 366 は可・367 はエラー", [err({ monthly: 1, annualDays: 366, dayHours: 1 }), err({ monthly: 1, annualDays: 367, dayHours: 1 })], ["ok", true]));
  t.push(eq("年間所定労働日数の小数（245.5）はエラー", err({ monthly: 200000, annualDays: 245.5, dayHours: 8 }), true));
  t.push(eq("負の金額はエラー", err({ hourly: -1 }), true));
  t.push(eq("小数の金額はエラー", err({ hourly: 1280.5 }), true));
  t.push(eq("1億円を超える金額はエラー", err({ hourly: 100000001 }), true));
  t.push(eq("時間の小数第3位（160.125）はエラー", err({ monthly: 200000, monthlyHours: 160.125 }), true));
  t.push(eq("金額のカンマは読む（\"204,800\"）", parseYen("204,800"), { value: 204800 }));
  t.push(eq("空欄は未入力", [parseYen(""), parseDecimal("  ")], [{ blank: true }, { blank: true }]));
  t.push(eq("時間 \"173.3\" は 1733/10", (() => { const v = parseDecimal("173.3").value; return [String(v.n), String(v.d)]; })(), ["1733", "10"]));
  t.push(eq("時給 0 円だけでも判定する（0円は満たさない）", calculate(base({ hourly: 0 })).allOk, false));

  // ── 本文の静的な表と選択肢が calc.js の表と一致する ─────────────────────────
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const tbody = (html.match(/<tbody id="mwTable">([\s\S]*?)<\/tbody>/) ?? [, ""])[1];
  const rows = [...tbody.matchAll(/<tr><td>(.+?)<\/td><td>([\d,]+)円<\/td><td>(\d+)年(\d+)月(\d+)日<\/td><td>([\d,]+)円<\/td><\/tr>/g)]
    .map((m) => [m[1], +m[2].replace(/,/g, ""), `${m[3]}-${m[4].padStart(2, "0")}-${m[5].padStart(2, "0")}`, +m[6].replace(/,/g, "")]);
  t.push(eq("本文の最低賃金の表（47行）が calc.js と一致", rows,
    PREFS.map((p) => [p.name, p.rates[2].yen, p.rates[2].from, p.rates[1].yen])));
  const opts = [...html.matchAll(/<option value="(\d+)"[^>]*>(.+?)<\/option>/g)].map((m) => [+m[1], m[2]]);
  t.push(eq("都道府県の選択肢（47）が calc.js と一致", opts, PREFS.map((p) => [p.code, p.name])));
  t.push(eq("日付の入力の範囲が収録範囲と一致（min 2024-11-01・max 2027-09-30）",
    [...html.matchAll(/type="date" min="([\d-]+)" max="([\d-]+)"/g)].map((m) => [m[1], m[2]]),
    [[SUPPORTED_FROM, "2027-09-30"], [SUPPORTED_FROM, "2027-09-30"]]));

  return t;
}
