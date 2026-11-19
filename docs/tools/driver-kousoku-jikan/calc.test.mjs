// トラック・タクシー運転者の拘束時間・休息期間・運転時間のチェックのテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 告示・通達の定数（13時間・最大15時間・14時間超の目安 トラック週2回／タクシー週3回・休息 11時間／9時間・2日平均9時間・2週平均44時間）
//   (2) 1日＝始業から24時間。翌日の始業が早まると前日の1日に入る（パンフレット P6 の 13＋2＝15時間を再現）
//   (3) 「超えない」「下回らない」の境界: 13:00・15:00・14:00 ちょうど、休息 9:00・11:00 ちょうど、2日の合計 18:00・2週 88:00 ちょうど
//   (4) 2日平均は前日との平均と翌日との平均が「いずれも」9時間を超えたときだけ違反（パンフレット P8 の 10・9・9 は違反でない）
//   (5) 未入力の日を休日（0時間）として合格にしない
//   (6) 入力の検証（終業＝始業・前日の勤務と重なる・運転時間が長すぎる・休の日に時刻）

import {
  DAY, DAYS, OVER14, DRIVE_2DAY_SUM, DRIVE_2WEEK_SUM, RULES,
  parseClock, parseDuration, parseDate, addDays, fmtDur, fmtClock, calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

const MON = "2026-11-16"; // 月曜日
const H = (h, m = 0) => h * 60 + m;
const w = (start, end, drive = "") => ({ start, end, drive });
const off = { off: true };
const run = (mode, days, startDate = MON) => calculate({ mode, startDate, days });
const row = (res, i) => res.rows[i];

export default function cases() {
  const t = [];

  // ── (1) 定数 ─────────────────────────
  t.push(eq("1日は24時間・2週は14日", [DAY, DAYS], [1440, 14]));
  t.push(eq("トラック: 13時間・最大15時間・休息11／9時間（第4条第1項第3号・第5号）",
    [RULES.truck.base, RULES.truck.max, RULES.truck.restBase, RULES.truck.restMin], [H(13), H(15), H(11), H(9)]));
  t.push(eq("タクシー日勤: 13時間・最大15時間・休息11／9時間（第2条第1項第2号・第4号）",
    [RULES.taxi.base, RULES.taxi.max, RULES.taxi.restBase, RULES.taxi.restMin], [H(13), H(15), H(11), H(9)]));
  t.push(eq("14時間超の目安はトラック週2回・タクシー週3回（通達 第2の4(2)・第2の2(1)イ）",
    [OVER14, RULES.truck.over14PerWeek, RULES.taxi.over14PerWeek], [H(14), 2, 3]));
  t.push(eq("運転時間: 2日の合計18時間・2週の合計88時間（第4条第1項第6号）", [DRIVE_2DAY_SUM, DRIVE_2WEEK_SUM], [H(18), H(88)]));
  t.push(eq("運転時間の上限はトラックだけ（タクシーには無い）", [RULES.truck.driving, RULES.taxi.driving], [true, false]));
  t.push(eq("1か月の拘束時間 トラック284・タクシー日勤288", [RULES.truck.monthCap, RULES.taxi.monthCap], [H(284), H(288)]));

  // ── 読み取り ─────────────────────────
  t.push(eq("時刻: 8:00・08:00・800・0800・8 はどれも8時",
    ["8:00", "08:00", "800", "0800", "8"].map(parseClock), [480, 480, 480, 480, 480]));
  t.push(eq("時刻: 全角の ２１：３０ も読む", parseClock("２１：３０"), H(21, 30)));
  t.push(eq("時刻: 24:00 は1440分（終業だけに使う）", parseClock("24:00"), 1440));
  t.push(eq("時刻: 空は null", parseClock(""), null));
  t.push(eq("時刻: 25:00・8:60・24:30・abc は読めない",
    ["25:00", "8:60", "24:30", "abc"].map((s) => Number.isNaN(parseClock(s))), [true, true, true, true]));
  t.push(eq("運転時間: 9:30・9.5・9・24",
    ["9:30", "9.5", "9", "24"].map(parseDuration), [570, 570, 540, 1440]));
  t.push(eq("運転時間: 9.25 は 555分", parseDuration("9.25"), 555));
  t.push(eq("運転時間: 空は null", parseDuration(""), null));
  t.push(eq("運転時間: 24.5・9:75・-1 は読めない",
    ["24.5", "9:75", "-1"].map((s) => Number.isNaN(parseDuration(s))), [true, true, true]));
  t.push(eq("日付: 2026-02-30 は実在しない", parseDate("2026-02-30"), null));
  t.push(eq("2026-11-16 は月曜日・13日後は 11/29（日）", [addDays(parseDate(MON), 0).wd, addDays(parseDate(MON), 13)],
    [1, { y: 2026, m: 11, d: 29, wd: 0 }]));
  t.push(eq("表示: 790分は 13時間10分、900分は 15時間", [fmtDur(790), fmtDur(900)], ["13時間10分", "15時間"]));
  t.push(eq("表示: 翌1時・24時", [fmtClock(DAY + 60), fmtClock(DAY)], ["翌1:00", "24:00"]));

  // ── (2) パンフレット P6: 翌日の始業が早まる ─────────────────────────
  {
    const r = run("truck", [w("8:00", "21:00"), w("6:00", "19:00"), w("6:00", "17:00")]);
    t.push(eq("P6: 月 8:00〜21:00・火 6:00 始業 → 月曜から始まる1日は 13＋2＝15時間", [row(r, 0).span, row(r, 0).overlap, row(r, 0).kousoku], [H(13), H(2), H(15)]));
    t.push(eq("P6: 火 6:00〜19:00・水 6:00 始業 → 火曜から始まる1日は13時間（重なり0）", [row(r, 1).overlap, row(r, 1).kousoku], [0, H(13)]));
    t.push(eq("P6: 15時間は最大拘束時間ちょうどで違反でない（延長）", row(r, 0).kousokuStatus, "ext"));
    t.push(eq("P6: 休息期間 9時間（21:00→6:00）と11時間（19:00→6:00）", [row(r, 0).rest, row(r, 1).rest], [H(9), H(11)]));
    t.push(eq("P6: 1か月の数え方では重なりを二重に数えない（13＋13＋11＝37時間）", r.totalSpan, H(37)));
  }
  {
    // 翌日の勤務が24時間の枠の中で始まって終わる
    const r = run("truck", [w("8:00", "12:00"), w("2:00", "6:00")]);
    t.push(eq("翌日の勤務がまるごと枠に入る: 4＋4＝8時間", [row(r, 0).overlap, row(r, 0).kousoku], [H(4), H(8)]));
  }

  // ── パンフレット P5: 1週間の例 ─────────────────────────
  {
    const r = run("truck", [w("8:00", "23:00"), w("8:00", "21:00"), w("8:00", "22:00"), w("9:00", "23:00"), w("9:00", "21:00"), off, off]);
    t.push(eq("P5: 1日の拘束時間 15・13・14・14・12", [0, 1, 2, 3, 4].map((i) => row(r, i).kousoku), [15, 13, 14, 14, 12].map((h) => H(h))));
    t.push(eq("P5: 休息期間 9・11・11・10", [0, 1, 2, 3].map((i) => row(r, i).rest), [9, 11, 11, 10].map((h) => H(h))));
    t.push(eq("P5: 14時間ちょうどは「超える」に数えない（14時間超は月曜の1回だけ）", [r.weeks[0].count, r.weeks[0].exceeded], [1, false]));
    t.push(eq("P5: 月曜の休息9時間は下限ちょうどで違反でない（11時間未満）", row(r, 0).restStatus, "short"));
    t.push(eq("P5: 金曜の次の勤務は2週目で未入力 → 休息期間は判定しない", [row(r, 4).rest, row(r, 4).restStatus], [null, "unknown"]));
    t.push(eq("P5: 違反は0件", r.counts, { over: 0, restNg: 0, drive2Ng: 0, twoWeekNg: 0 }));
  }

  // ── パンフレット P7: 1日の拘束時間と休息期間 ─────────────────────────
  {
    const r = run("truck", [w("8:00", "21:00"), w("8:00", "23:00"), w("8:00", "1:00"), w("8:00", "17:00")]);
    t.push(eq("P7: 8:00〜21:00 → 13時間○・休息11時間○", [row(r, 0).kousokuStatus, row(r, 0).restStatus], ["ok", "ok"]));
    t.push(eq("P7: 8:00〜23:00 → 15時間○・休息9時間○", [row(r, 1).kousoku, row(r, 1).kousokuStatus, row(r, 1).rest, row(r, 1).restStatus], [H(15), "ext", H(9), "short"]));
    t.push(eq("P7: 8:00〜翌1:00 → 17時間×・休息7時間×", [row(r, 2).kousoku, row(r, 2).kousokuStatus, row(r, 2).rest, row(r, 2).restStatus], [H(17), "over", H(7), "ng"]));
  }

  // ── (3) 境界 ─────────────────────────
  {
    const r = run("truck", [w("8:00", "21:00"), w("8:00", "21:01"), w("8:00", "23:00"), w("8:00", "23:01"), off, off, off]);
    t.push(eq("13:00 ちょうどは原則内、13:01 は延長", [row(r, 0).kousokuStatus, row(r, 1).kousokuStatus], ["ok", "ext"]));
    t.push(eq("15:00 ちょうどは延長、15:01 は最大拘束時間を超える", [row(r, 2).kousokuStatus, row(r, 3).kousokuStatus], ["ext", "over"]));
  }
  {
    const r = run("truck", [w("8:00", "22:00"), w("8:00", "22:01"), off]);
    t.push(eq("14:00 ちょうどは14時間超に数えない、14:01 は数える", [row(r, 0).over14, row(r, 1).over14], [false, true]));
  }
  {
    const r = run("truck", [w("8:00", "21:00"), w("6:00", "17:00"), w("4:00", "15:00"), w("2:00", "13:00"), off]);
    t.push(eq("休息 9:00 ちょうど（21:00→6:00）は下限内・11時間未満", [row(r, 0).rest, row(r, 0).restStatus], [H(9), "short"]));
    t.push(eq("休息 11:00 ちょうど（17:00→4:00）は11時間以上", [row(r, 1).rest, row(r, 1).restStatus], [H(11), "ok"]));
    t.push(eq("休息 11:00（15:00→2:00）でも翌日の始業が2時間早まれば前日の1日は 11＋2＝13時間", [row(r, 2).rest, row(r, 2).kousoku], [H(11), H(13)]));
  }
  {
    const r = run("truck", [w("8:00", "21:00"), w("5:59", "15:00"), w("8:00", "21:00"), w("7:59", "15:00"), off]);
    t.push(eq("休息 8:59（21:00→5:59）は下限を下回る", [row(r, 0).rest, row(r, 0).restStatus], [H(8, 59), "ng"]));
    t.push(eq("休息 10:59（21:00→7:59）は11時間未満", [row(r, 2).rest, row(r, 2).restStatus], [H(10, 59), "short"]));
    t.push(eq("翌日の始業が2時間1分早まると前日の1日は 13＋2:01＝15:01 で超える", [row(r, 0).kousoku, row(r, 0).kousokuStatus], [H(15, 1), "over"]));
  }

  // ── 14時間超の回数（トラック週2・タクシー週3）と連続 ─────────────────────────
  {
    const days = [w("7:00", "21:30"), off, w("7:00", "21:30"), off, w("7:00", "21:30"), off, off];
    const tr = run("truck", days), tx = run("taxi", days);
    t.push(eq("週3回の14時間超: トラックは目安超え・タクシーは目安内", [tr.weeks[0].count, tr.weeks[0].exceeded, tx.weeks[0].exceeded], [3, true, false]));
    const tx4 = run("taxi", [w("7:00", "21:30"), off, w("7:00", "21:30"), w("7:00", "21:30"), off, w("7:00", "21:30"), off]);
    t.push(eq("週4回はタクシーも目安超え", [tx4.weeks[0].count, tx4.weeks[0].exceeded], [4, true]));
    t.push(eq("14時間超が連続した日を拾う", tx4.consecutive14, [[2, 3]]));
    t.push(eq("2週目は8日目から数える", run("truck", [off, off, off, off, off, off, off, w("7:00", "21:30")]).weeks.map((x) => x.count), [0, 1]));
  }

  // ── (4) 2日平均の運転時間（パンフレット P8） ─────────────────────────
  {
    const r = run("truck", [w("8:00", "21:00", "10"), w("8:00", "21:00", "9"), w("8:00", "21:00", "9"), off]);
    t.push(eq("P8: 4/2 は (10+9)/2＝9.5 だが (9+9)/2＝9 なので違反でない", [row(r, 1).drive2.sumPrev, row(r, 1).drive2.sumNext, row(r, 1).drive2.status], [H(19), H(18), "ok"]));
    t.push(eq("P8: 1日目は前日が範囲外で、翌日との平均が9時間超 → 判定できない", row(r, 0).drive2.status, "unknown"));
    t.push(eq("P8: 3日目は前日との合計18時間ちょうど → 違反でない", row(r, 2).drive2.status, "ok"));
  }
  {
    const r = run("truck", [w("6:00", "21:00", "10"), w("6:00", "21:00", "10"), w("6:00", "21:00", "10"), off]);
    t.push(eq("10・10・10: 2日目は前後どちらの平均も10時間 → 違反（違反は2日目の1件）", [row(r, 1).drive2.status, r.counts.drive2Ng], ["ng", 1]));
    t.push(eq("10・10・10: 3日目も前日10・翌日休み(0)… 翌日との平均5時間 → 違反でない", row(r, 2).drive2.status, "ok"));
  }
  {
    const r = run("truck", [w("6:00", "21:00", "9:01"), w("6:00", "21:00", "8:59"), w("6:00", "21:00", "9:02"), off]);
    t.push(eq("合計18:00 ちょうどは違反でない（9:01＋8:59）", row(r, 1).drive2.sumPrev, H(18)));
    t.push(eq("合計18:01 と 18:00 → 前日側が18時間ちょうどなので違反でない", row(r, 1).drive2.status, "ok"));
  }
  {
    const r = run("truck", [w("6:00", "21:00", "9:30"), w("6:00", "21:00", "9:30"), off]);
    t.push(eq("休みの日の運転時間は0時間として数える", row(r, 1).drive2.sumNext, H(9, 30)));
    t.push(eq("運転時間を入れていない勤務の日は判定しない", run("truck", [w("8:00", "21:00"), off]).rows[0].drive2.status, "unknown"));
  }

  // ── 2週の運転時間（パンフレット P9） ─────────────────────────
  {
    const mk = (a, b) => [
      w("6:00", "20:00", String(a[0])), w("6:00", "20:00", String(a[1])), w("6:00", "20:00", String(a[2])), w("6:00", "20:00", String(a[3])), w("6:00", "20:00", String(a[4])), off, off,
      w("6:00", "20:00", String(b[0])), w("6:00", "20:00", String(b[1])), w("6:00", "20:00", String(b[2])), w("6:00", "20:00", String(b[3])), w("6:00", "20:00", String(b[4])), off, off,
    ];
    const p1 = run("truck", mk([9, 9, 9, 9, 8], [9, 9, 9, 9, 8]));
    const p2 = run("truck", mk([9, 9, 8, 8, 8], [9, 9, 9, 9, 10]));
    const p3 = run("truck", mk([10, 9, 9, 9, 9], [9, 9, 9, 9, 8]));
    t.push(eq("P9 ①: 44＋44＝88時間 → 違反でない", [p1.twoWeek.sum, p1.twoWeek.status], [H(88), "ok"]));
    t.push(eq("P9 ②: 42＋46＝88時間 → 違反でない", [p2.twoWeek.sum, p2.twoWeek.status], [H(88), "ok"]));
    t.push(eq("P9 ③: 46＋44＝90時間 → 違反", [p3.twoWeek.sum, p3.twoWeek.status, p3.counts.twoWeekNg], [H(90), "ng", 1]));
  }

  // ── (5) 未入力の日を合格にしない ─────────────────────────
  {
    const r = run("truck", [w("8:00", "21:00", "8"), w("8:00", "21:00", "8")]);
    t.push(eq("2週の途中までしか入れていない → 2週の運転時間は判定できない", [r.twoWeek.known, r.twoWeek.status, r.twoWeek.rest], [false, "unknown", H(72)]));
    t.push(eq("最後の勤務の翌日が未入力 → 1日の拘束時間は下限（翌日の始業が早ければ増える）", [row(r, 1).kousoku, row(r, 1).kousokuKnown], [H(13), false]));
    t.push(eq("翌日が休みなら1日の拘束時間は確定", run("truck", [w("8:00", "21:00"), off]).rows[0].kousokuKnown, true));
    t.push(eq("始業が0:00なら翌日が未入力でも確定（翌日の始業が枠に入らない）", run("truck", [w("0:00", "13:00")]).rows[0].kousokuKnown, true));
    const big = run("truck", [w("4:00", "18:00", "13"), w("4:00", "18:00", "13"), w("4:00", "18:00", "13"), w("4:00", "18:00", "13"), w("4:00", "18:00", "13"), w("4:00", "18:00", "13"), w("4:00", "18:00", "13")]);
    t.push(eq("未入力の日があっても、入れた分だけで88時間を超えれば違反", [big.twoWeek.sum, big.twoWeek.status], [H(91), "ng"]));
    const gap = run("truck", [w("8:00", "21:00", "10"), {}, w("8:00", "21:00", "10")]);
    t.push(eq("間の日が未入力 → 休息期間も2日平均も判定しない", [row(gap, 0).restStatus, row(gap, 0).drive2.status], ["unknown", "unknown"]));
    const viaOff = run("truck", [w("8:00", "21:00"), off, w("8:00", "21:00")]);
    t.push(eq("間が休みなら次の勤務までを休息期間に数える（21:00→翌々日8:00＝35時間）", row(viaOff, 0).rest, H(35)));
  }

  // ── タクシー ─────────────────────────
  {
    const r = run("taxi", [w("8:00", "21:00", "12"), w("8:00", "21:00", "12"), off]);
    t.push(eq("タクシーは運転時間を判定しない（入れても無視）", [row(r, 0).drive2, r.twoWeek, row(r, 0).drive], [undefined, null, null]));
    t.push(eq("タクシーも1日の拘束時間と休息期間は同じ基準", [row(r, 0).kousokuStatus, row(r, 0).restStatus], ["ok", "ok"]));
  }

  // ── 24:00 と 0:00 の終業 ─────────────────────────
  t.push(eq("終業 24:00 と 0:00 はどちらも16時間（8:00 始業）",
    [run("truck", [w("8:00", "24:00"), off]).rows[0].span, run("truck", [w("8:00", "0:00"), off]).rows[0].span], [H(16), H(16)]));
  t.push(eq("16時間は原則の最大15時間を超える（長距離の特例は扱わない）", run("truck", [w("8:00", "24:00"), off]).rows[0].kousokuStatus, "over"));
  t.push(eq("夜勤 22:00〜翌7:00 は9時間", run("truck", [w("22:00", "7:00"), off]).rows[0].span, H(9)));

  // ── (6) 入力の検証 ─────────────────────────
  const err = (days, mode = "truck", startDate = MON) => {
    const r = calculate({ mode, startDate, days });
    return r.ok ? "ok" : r.errors[0];
  };
  t.push(eq("終業＝始業はエラー", /同じ時刻/.test(err([w("8:00", "8:00")])), true));
  t.push(eq("前日の勤務が終わる前に始業するとエラー", /前日の勤務が終わる前/.test(err([w("20:00", "8:00"), w("7:00", "15:00")])), true));
  t.push(eq("運転時間が始業〜終業より長いとエラー", /長く/.test(err([w("8:00", "17:00", "10")])), true));
  t.push(eq("休の日に時刻があるとエラー", /休/.test(err([{ off: true, start: "8:00", end: "" }])), true));
  t.push(eq("始業だけ入れるとエラー", /両方/.test(err([{ start: "8:00", end: "" }])), true));
  t.push(eq("時刻が読めないとエラー", /時刻/.test(err([w("25:00", "8:00")])), true));
  t.push(eq("始業 24:00 はエラー", /24:00/.test(err([w("24:00", "8:00")])), true));
  t.push(eq("運転時間が読めないとエラー", /運転時間は/.test(err([w("8:00", "17:00", "abc")])), true));
  t.push(eq("日付が無いとエラー", /日付/.test(err([w("8:00", "17:00")], "truck", "")), true));
  t.push(eq("種類が無いとエラー", /種類/.test(err([w("8:00", "17:00")], "bus")), true));
  t.push(eq("全部空ならエラー（勤務が無い）", /勤務した日/.test(err([])), true));
  t.push(eq("休だけでもエラー（勤務が無い）", /勤務した日/.test(err([off, off])), true));

  return t;
}

// 直接実行したとき
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("calc.test.mjs")) {
  const r = cases();
  const ng = r.filter((x) => !x.ok);
  for (const x of ng) console.log("NG", x.name, "\n   expected", JSON.stringify(x.expected), "\n   actual  ", JSON.stringify(x.actual));
  console.log(`${r.length - ng.length}/${r.length} PASS`);
}
