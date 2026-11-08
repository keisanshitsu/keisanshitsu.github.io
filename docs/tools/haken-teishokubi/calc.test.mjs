// 派遣の3年ルール（抵触日）のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 条文・指針由来の定数（3年・3か月・60歳・2015-09-30）
//   (2) 民法 第143条第2項の満了日: 応当日の前日／応当日が無ければその月の末日（2月29日開始・月末開始）
//   (3) 抵触日＝満了日の翌日（2026-04-01 開始 → 2029-04-01。前日 2029-03-31 を抵触日にしない）
//   (4) 空白は「3月を超えない」なら継続: ちょうど3か月は継続、1日超えたら数え直し
//   (5) 個人単位と事業所単位の早いほう・延長は事業所単位だけ・意見聴取の期限（一月前の日）と説明の期限（前日）
//   (6) 例外（無期雇用・60歳以上など）と入力の検証

import {
  PERIOD_YEARS,
  GAP_MONTHS,
  REFORM_START,
  AGE_EXEMPT,
  KINDS,
  parseDate,
  fmt,
  periodEnd,
  teishokubi,
  oneMonthBefore,
  gapCheck,
  daysBetween,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});
const D = (s) => parseDate(s);
const F = (dt) => (dt ? fmt(dt) : dt);
const TODAY = "2026-11-08";

export default function cases() {
  const t = [];

  // ── (1) 定数 ─────────────────────────
  t.push(eq("派遣可能期間・個人単位は3年（第40条の2第2項・第35条の3）", PERIOD_YEARS, 3));
  t.push(eq("空白は3か月を超えなければ継続（派遣先指針 第2の14(3)(4)）", GAP_MONTHS, 3));
  t.push(eq("60歳以上は対象外（施行規則 第32条の4）", AGE_EXEMPT, 60));
  t.push(eq("平成27年改正法の施行日", REFORM_START, "2015-09-30"));
  t.push(eq("例外は無期雇用・60歳以上・有期プロジェクト・日数限定・休業の代替の5つ",
    Object.keys(KINDS).filter((k) => KINDS[k].exempt), ["indefinite", "age60", "project", "fewdays", "leave"]));

  // ── 日付の読み取り ─────────────────────────
  t.push(eq("2026-02-30 は実在しない", parseDate("2026-02-30"), null));
  t.push(eq("2028-02-29 は実在する（うるう年）", F(parseDate("2028-02-29")), "2028-02-29"));
  t.push(eq("2100-02-29 は実在しない（100で割り切れる年）", parseDate("2100-02-29"), null));
  t.push(eq("形式違いは読まない（2026/04/01）", parseDate("2026/04/01"), null));

  // ── (2) 満了日（民法 第143条第2項）─────────────────────────
  t.push(eq("2026-04-01 から3年の満了日は 2029-03-31（応当日の前日）", F(periodEnd(D("2026-04-01"), 36)), "2029-03-31"));
  t.push(eq("2028-02-29 から3年: 2031年2月に応当日が無い → 末日 2031-02-28", F(periodEnd(D("2028-02-29"), 36)), "2031-02-28"));
  t.push(eq("2026-01-31 から1か月: 2月31日が無い → 末日 2026-02-28", F(periodEnd(D("2026-01-31"), 1)), "2026-02-28"));
  t.push(eq("2027-11-30 から3か月: 2月30日が無い → うるう年の末日 2028-02-29", F(periodEnd(D("2027-11-30"), 3)), "2028-02-29"));
  t.push(eq("2026-12-15 から3か月は年をまたいで 2027-03-14", F(periodEnd(D("2026-12-15"), 3)), "2027-03-14"));
  t.push(eq("2026-03-01 から1年は 2027-02-28", F(periodEnd(D("2026-03-01"), 12)), "2027-02-28"));

  // ── (3) 抵触日＝満了日の翌日 ─────────────────────────
  t.push(eq("2026-04-01 開始 → 抵触日 2029-04-01", F(teishokubi(D("2026-04-01"))), "2029-04-01"));
  t.push(eq("2015-10-01 開始 → 抵触日 2018-10-01（いわゆる2018年問題）", F(teishokubi(D("2015-10-01"))), "2018-10-01"));
  t.push(eq("2028-02-29 開始 → 抵触日 2031-03-01", F(teishokubi(D("2028-02-29"))), "2031-03-01"));
  t.push(eq("2027-02-28 開始 → 抵触日 2030-02-28（応当日がある）", F(teishokubi(D("2027-02-28"))), "2030-02-28"));
  t.push(eq("2027-03-01 開始 → 抵触日 2030-03-01", F(teishokubi(D("2027-03-01"))), "2030-03-01"));
  t.push(eq("2026-12-31 開始 → 抵触日 2029-12-31", F(teishokubi(D("2026-12-31"))), "2029-12-31"));
  t.push(eq("2026-01-01 開始 → 抵触日 2029-01-01（前年の大みそかは最後の日）", F(teishokubi(D("2026-01-01"))), "2029-01-01"));

  // ── 一月前の日（意見聴取期間の終わり）─────────────────────────
  t.push(eq("抵触日 2029-04-01 の一月前の日は 2029-03-01", F(oneMonthBefore(D("2029-04-01"))), "2029-03-01"));
  t.push(eq("抵触日 2029-03-31 → 2月31日が無い → 早いほうの 2029-02-28", F(oneMonthBefore(D("2029-03-31"))), "2029-02-28"));
  t.push(eq("抵触日 2028-03-31 → うるう年は 2028-02-29", F(oneMonthBefore(D("2028-03-31"))), "2028-02-29"));
  t.push(eq("抵触日 2029-01-15 → 年をさかのぼって 2028-12-15", F(oneMonthBefore(D("2029-01-15"))), "2028-12-15"));
  t.push(eq("抵触日 2029-05-31 → 4月31日が無い → 2029-04-30", F(oneMonthBefore(D("2029-05-31"))), "2029-04-30"));

  // ── (4) 3か月の空白 ─────────────────────────
  const g1 = gapCheck(D("2026-03-31"), D("2026-07-01"));
  t.push(eq("3/31 終了 → 7/1 開始は空白ちょうど3か月（4/1〜6/30）で継続", g1.continuous, true));
  t.push(eq("その空白は91日", g1.gapDays, 91));
  const g2 = gapCheck(D("2026-03-31"), D("2026-07-02"));
  t.push(eq("3/31 終了 → 7/2 開始は3か月を1日超えて数え直し", g2.continuous, false));
  t.push(eq("数え直しになる最も早い開始日は 7/2", F(g2.earliestResetStart), "2026-07-02"));
  t.push(eq("継続になる最後の開始日は 7/1", F(g2.lastContinuousStart), "2026-07-01"));
  const g3 = gapCheck(D("2026-11-29"), D("2027-03-01"));
  t.push(eq("11/29 終了 → 空白 11/30〜2/28 が3か月（2月30日が無い）→ 3/1 開始は継続", g3.continuous, true));
  t.push(eq("同じく 3/2 開始なら数え直し", gapCheck(D("2026-11-29"), D("2027-03-02")).continuous, false));
  t.push(eq("うるう年: 2027-11-29 終了 → 継続になる最後の開始日は 2028-03-01",
    F(gapCheck(D("2027-11-29"), D("2028-03-01")).lastContinuousStart), "2028-03-01"));
  const g4 = gapCheck(D("2026-03-31"), D("2026-04-01"));
  t.push(eq("翌日に次の派遣が始まれば空白0日で継続", [g4.gapDays, g4.continuous], [0, true]));

  // ── (5) calculate ─────────────────────────
  const r1 = calculate({ personStart: "2026-04-01", today: TODAY });
  t.push(eq("個人だけ: 抵触日 2029-04-01・最後に働ける日 2029-03-31",
    [F(r1.binding.teishokubi), F(r1.binding.lastDay), r1.binding.by], ["2029-04-01", "2029-03-31", "person"]));
  t.push(eq("表の個人単位の行: 最後に働ける日は抵触日の前日 2029-03-31", F(r1.person.lastDay), "2029-03-31"));
  t.push(eq("2026-11-08 から抵触日まで 875日", r1.binding.daysLeft, 875));
  t.push(eq("日数の数え方: 2026-11-08→2029-04-01", daysBetween(D("2026-11-08"), D("2029-04-01")), 875));

  const r2 = calculate({ personStart: "2026-04-01", siteStart: "2025-10-01", extensions: 0, today: TODAY });
  t.push(eq("事業所の抵触日 2028-10-01 が個人より先 → 事業所単位で止まる",
    [F(r2.site.teishokubi), r2.binding.by, F(r2.binding.lastDay)], ["2028-10-01", "site", "2028-09-30"]));
  t.push(eq("表の事業所単位の行: 最後に受け入れられる日は 2028-09-30", F(r2.site.lastDay), "2028-09-30"));
  t.push(eq("延長の意見聴取は抵触日の一月前の日 2028-09-01 まで", F(r2.site.hearingDeadline), "2028-09-01"));
  t.push(eq("異議への説明は抵触日の前日 2028-09-30 まで", F(r2.site.explainDeadline), "2028-09-30"));
  t.push(eq("意見聴取期間の始まりは受入開始日", F(r2.site.hearingFrom), "2025-10-01"));

  const r3 = calculate({ personStart: "2026-04-01", siteStart: "2025-10-01", extensions: 1, today: TODAY });
  t.push(eq("事業所を1回延長 → 2031-10-01。個人の 2029-04-01 が先になる（個人は延長できない）",
    [F(r3.site.teishokubi), r3.binding.by, F(r3.binding.teishokubi)], ["2031-10-01", "person", "2029-04-01"]));
  t.push(eq("延長の連鎖は 2028-10-01 → 2031-10-01", r3.site.chain, ["2028-10-01", "2031-10-01"]));
  t.push(eq("延長後の意見聴取期間は延長前の期間が経過した日 2028-10-01 から", F(r3.site.hearingFrom), "2028-10-01"));
  const r3b = calculate({ personStart: "2028-02-29", siteStart: "2028-02-29", extensions: 2, today: TODAY });
  t.push(eq("2月29日起算で2回延長: 2031-03-01 → 2034-03-01 → 2037-03-01", r3b.site.chain, ["2031-03-01", "2034-03-01", "2037-03-01"]));

  const r4 = calculate({ personStart: "2026-04-01", siteStart: "2026-04-01", today: TODAY });
  t.push(eq("事業所と個人が同じ日に始まれば、同じ抵触日で個人単位として扱う", [r4.binding.by, F(r4.binding.teishokubi)], ["person", "2029-04-01"]));

  const r5 = calculate({ personStart: "2023-04-01", today: TODAY });
  t.push(eq("2023-04-01 開始は抵触日 2026-04-01 を過ぎている（残り日数が負）", [F(r5.binding.teishokubi), r5.binding.daysLeft < 0], ["2026-04-01", true]));
  t.push(eq("抵触日当日は残り0日", calculate({ personStart: "2023-11-08", today: TODAY }).binding.daysLeft, 0));

  // 前の派遣との空白
  const r6 = calculate({ personStart: "2026-07-01", prevStart: "2025-04-01", prevEnd: "2026-03-31", today: TODAY });
  t.push(eq("空白ちょうど3か月 → 継続: 起算日は前の派遣の 2025-04-01、抵触日 2028-04-01",
    [r6.gap.continuous, F(r6.person.start), F(r6.person.teishokubi)], [true, "2025-04-01", "2028-04-01"]));
  const r7 = calculate({ personStart: "2026-07-02", prevStart: "2025-04-01", prevEnd: "2026-03-31", today: TODAY });
  t.push(eq("空白が3か月を1日超える → 数え直し: 起算日 2026-07-02、抵触日 2029-07-02",
    [r7.gap.continuous, F(r7.person.start), F(r7.person.teishokubi)], [false, "2026-07-02", "2029-07-02"]));

  // ── (6) 例外 ─────────────────────────
  for (const k of ["indefinite", "age60", "project", "fewdays", "leave"]) {
    const r = calculate({ kind: k, today: TODAY });
    t.push(eq(`${KINDS[k].label} は期間制限の対象外（日付を入れなくてよい）`, [r.ok, r.exempt], [true, true]));
  }
  t.push(eq("有期雇用は対象", calculate({ kind: "fixed", personStart: "2026-04-01", today: TODAY }).exempt, false));
  t.push(eq("不明な種類は有期雇用として扱う（期間制限がかかる側）", calculate({ kind: "zzz", personStart: "2026-04-01", today: TODAY }).exempt, false));

  // ── 入力の検証 ─────────────────────────
  const bad = (name, input) => {
    const r = calculate({ today: TODAY, ...input });
    t.push(eq(name, r.ok, false));
  };
  bad("働き始めた日が空ならエラー", { personStart: "" });
  bad("実在しない日付（2026-02-30）はエラー", { personStart: "2026-02-30" });
  bad("2015-09-29 開始は旧法の経過措置なので扱わない", { personStart: "2015-09-29" });
  t.push(eq("2015-09-30 開始は扱う（施行日）", calculate({ personStart: "2015-09-30", today: TODAY }).ok, true));
  bad("事業所の受入開始が個人より後ならエラー", { personStart: "2026-04-01", siteStart: "2026-05-01" });
  bad("前の派遣の終了日だけではエラー", { personStart: "2026-07-01", prevEnd: "2026-03-31" });
  bad("前の派遣の開始日だけではエラー", { personStart: "2026-07-01", prevStart: "2025-04-01" });
  bad("前の派遣の終了日がいまの開始日と同じならエラー", { personStart: "2026-07-01", prevStart: "2025-04-01", prevEnd: "2026-07-01" });
  bad("前の派遣の開始日が終了日より後ならエラー", { personStart: "2026-07-01", prevStart: "2026-04-01", prevEnd: "2026-03-31" });
  bad("延長6回は範囲外", { personStart: "2026-04-01", siteStart: "2026-04-01", extensions: 6 });
  bad("延長 -1 回は範囲外", { personStart: "2026-04-01", siteStart: "2026-04-01", extensions: -1 });
  bad("延長 1.5 回は範囲外", { personStart: "2026-04-01", siteStart: "2026-04-01", extensions: 1.5 });
  bad("継続とみなされたとき、事業所の受入開始が前の派遣より後ならエラー",
    { personStart: "2026-07-01", prevStart: "2025-04-01", prevEnd: "2026-03-31", siteStart: "2025-10-01" });
  bad("今日の日付が読めなければエラー", { personStart: "2026-04-01", today: "x" });

  return t;
}
