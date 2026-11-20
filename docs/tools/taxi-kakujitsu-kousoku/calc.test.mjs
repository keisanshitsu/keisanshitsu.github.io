// タクシー隔日勤務の拘束時間・休息期間のチェックのテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 告示の定数（2暦日 22時間・2回平均 21時間・休息 24時間が基本／22時間が下限・1か月 262時間／協定で270時間）
//   (2) 2回の平均は前との平均と次との平均が「いずれも」21時間を超えたときだけ違反（通達 第2の2(2)イ）。
//       Q&A 2-4 の 22・22・休日・22時間（2勤務目が違反）を再現する。休日は飛ばして前後の勤務で比べる
//   (3) 「超えない」「下回らない」の境界: 22:00・合計42:00・休息 22:00／24:00・262:00 ちょうど
//   (4) 前または次の勤務が無い勤務の平均と、最後の勤務の休息期間を合格にしない
//   (5) 終業が始業以前なら翌日・同じ時刻なら24時間・同じ日に終わる隔日勤務（追補 Q&A 2-3-2）
//   (6) 入力の検証（一部だけの行・前の勤務と重なる・2024年3月31日以前・24:00 始業）と、入力の順に依らないこと

import {
  DAY, MAX_SHIFTS, SPAN_MAX, PAIR_SUM_MAX, REST_BASE, REST_MIN, MONTH_CAP, MONTH_CAP_EXT, MONTH_RANGE_DAYS, APPLY_FROM,
  parseClock, parseDate, addDays, fmtDur, fmtClock, calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

const H = (h, m = 0) => h * 60 + m;
const s = (date, start, end) => ({ date, start, end });
const run = (shifts, ext270 = false) => calculate({ shifts, ext270 });
const spans = (res) => res.rows.map((r) => r.span);
const pairs = (res) => res.rows.map((r) => r.pair.status);
const rests = (res) => res.rows.map((r) => r.restStatus);

// 1か月の例: 2026年11月に13回、7:00〜翌3:00（20時間）
const MONTH_DAYS = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26, 29];
const nov = (d) => `2026-11-${String(d).padStart(2, "0")}`;
const month13 = (over = {}) => MONTH_DAYS.map((d) => s(nov(d), "7:00", over[d] || "3:00"));

export default function cases() {
  const t = [];

  // ── (1) 定数 ─────────────────────────
  t.push(eq("2暦日の拘束時間 22時間・2回の合計 42時間（第2条第2項第2号）", [SPAN_MAX, PAIR_SUM_MAX], [H(22), H(42)]));
  t.push(eq("休息期間 24時間が基本・22時間が下限（第2条第2項第4号）", [REST_BASE, REST_MIN], [H(24), H(22)]));
  t.push(eq("1か月 262時間・労使協定で270時間（第2条第2項第1号）", [MONTH_CAP, MONTH_CAP_EXT], [H(262), H(270)]));
  t.push(eq("入力は16回分・1か月とみなす範囲は始業日の差30日まで・適用は2024-04-01から",
    [MAX_SHIFTS, MONTH_RANGE_DAYS, APPLY_FROM, DAY], [16, 30, "2024-04-01", 1440]));

  // ── 読み取り ─────────────────────────
  t.push(eq("時刻: 7:00・07:00・700・0700・7 はどれも7時",
    ["7:00", "07:00", "700", "0700", "7"].map(parseClock), [420, 420, 420, 420, 420]));
  t.push(eq("時刻: 全角の ３：３０ も読む", parseClock("３：３０"), H(3, 30)));
  t.push(eq("時刻: 24:00 は1440分・空は null", [parseClock("24:00"), parseClock("")], [1440, null]));
  t.push(eq("時刻: 25:00・7:60・24:30・abc は読めない",
    ["25:00", "7:60", "24:30", "abc"].map((x) => Number.isNaN(parseClock(x))), [true, true, true, true]));
  t.push(eq("日付: 空は null・2026-02-30 と 2026/11/02 は読めない",
    [parseDate(""), Number.isNaN(parseDate("2026-02-30")), Number.isNaN(parseDate("2026/11/02"))], [null, true, true]));
  t.push(eq("日付: 2026-11-02 は月曜日・2028-02-29 は実在する",
    [parseDate("2026-11-02").wd, parseDate("2028-02-29").d], [1, 29]));
  t.push(eq("日付: 月末をまたいで足す（11/30 の翌日は 12/1）", (({ m, d }) => [m, d])(addDays(parseDate("2026-11-30"), 1)), [12, 1]));
  t.push(eq("表示: 1290分は21時間30分・1320分は22時間", [fmtDur(1290), fmtDur(1320)], ["21時間30分", "22時間"]));
  t.push(eq("表示: 翌日の時刻は「翌」・翌日0:00 ちょうどは 24:00", [fmtClock(H(7)), fmtClock(DAY + H(5)), fmtClock(DAY)], ["7:00", "翌5:00", "24:00"]));

  // ── (2) Q&A 2-4: 22・22・休日・22時間 ─────────────────────────
  {
    const r = run([s("2026-11-02", "8:00", "6:00"), s("2026-11-04", "8:00", "6:00"), s("2026-11-07", "8:00", "6:00")]);
    t.push(eq("Q&A 2-4: 拘束時間はどれも22時間（22時間は超えていない）", [spans(r), r.counts.spanOver], [[H(22), H(22), H(22)], 0]));
    t.push(eq("Q&A 2-4: 2勤務目は前（1勤務目）とも次（休日の後の3勤務目）とも平均22時間 → 違反",
      [r.rows[1].pair, r.counts.pairNg], [{ status: "ng", sumPrev: H(44), sumNext: H(44) }, 1]));
    t.push(eq("Q&A 2-4: 1勤務目は前が、3勤務目は次が入っていないので判定できない（合格にしない）",
      [r.rows[0].pair.status, r.rows[2].pair.status], ["unknown", "unknown"]));
    t.push(eq("Q&A 2-4: 休息期間 26時間・50時間・（最後は次が無い）", [r.rows.map((x) => x.rest), rests(r)], [[H(26), H(50), null], ["ok", "ok", "unknown"]]));
  }

  // ── (3) 境界 ─────────────────────────
  {
    const r = run([s("2026-11-02", "8:00", "6:00"), s("2026-11-05", "8:00", "6:01")]);
    t.push(eq("2暦日: 22:00 は超えない・22:01 は超える", [r.rows.map((x) => x.spanStatus), r.counts.spanOver], [["ok", "over"], 1]));
  }
  {
    // A=21:30・B=21:00（合計42:30）・C=20:30（合計42:00）→ 片側が42時間ちょうど＝平均21時間ちょうどなので違反でない
    const r = run([s("2026-11-02", "8:00", "5:00"), s("2026-11-04", "8:00", "5:30"), s("2026-11-06", "8:00", "4:30")]);
    t.push(eq("平均: 前と 42:30・次と 42:00（平均21時間ちょうど）→ 違反でない", [r.rows[1].pair], [{ status: "ok", sumPrev: H(42, 30), sumNext: H(42) }]));
  }
  {
    const r = run([s("2026-11-02", "8:00", "5:00"), s("2026-11-04", "8:00", "5:30"), s("2026-11-06", "8:00", "4:31")]);
    t.push(eq("平均: 前と 42:30・次と 42:01 → 違反", [r.rows[1].pair.status, r.counts.pairNg], ["ng", 1]));
  }
  {
    // A は21時間ちょうどでも、前後が22時間なら平均はいずれも21.5時間（通達の文言どおり違反）
    const r = run([s("2026-11-02", "8:00", "6:00"), s("2026-11-04", "8:00", "5:00"), s("2026-11-06", "8:00", "6:00")]);
    t.push(eq("平均: 21・前22・次22 → 21時間の勤務でも違反（いずれもが21時間を超える）", r.rows[1].pair, { status: "ng", sumPrev: H(43), sumNext: H(43) }));
  }
  {
    const r = run([s("2026-11-02", "8:00", "5:00"), s("2026-11-04", "8:00", "5:00")]);
    t.push(eq("平均: 2回とも21時間なら、1勤務目は次と、2勤務目は前と合計42時間で違反でない（片側で決まる）", pairs(r), ["ok", "ok"]));
  }
  {
    const r = run([s("2026-11-02", "8:00", "6:30"), s("2026-11-04", "8:00", "6:30")]);
    t.push(eq("平均: 2回とも22時間30分でも、片側しか無ければ違反とは言わない（判定できない）", [pairs(r), r.counts.pairNg, r.counts.spanOver], [["unknown", "unknown"], 0, 2]));
  }
  {
    // 休息: 終業 翌6:00 → 次の始業までの時間
    const base = (start) => run([s("2026-11-02", "8:00", "6:00"), s("2026-11-04", start, "6:00")]).rows[0];
    t.push(eq("休息: 22:00 ちょうどは下回らない（努力の24時間には届かない）", [base("4:00").rest, base("4:00").restStatus], [H(22), "short"]));
    t.push(eq("休息: 21:59 は22時間を下回る → 違反", [base("3:59").rest, base("3:59").restStatus], [H(21, 59), "ng"]));
    t.push(eq("休息: 24:00 ちょうどは基本どおり・23:59 は努力の24時間に届かない", [base("6:00").restStatus, base("5:59").restStatus], ["ok", "short"]));
    const r = run([s("2026-11-02", "8:00", "6:00"), s("2026-11-04", "3:59", "1:00")]);
    t.push(eq("休息: 違反の件数に数える", r.counts.restNg, 1));
  }

  // ── (5) 終業の読み方 ─────────────────────────
  {
    const r = run([s("2026-11-02", "7:00", "4:00")]);
    t.push(eq("Q&A 2-3: 7時出勤・28時（翌4時）退勤は21時間", spans(r), [H(21)]));
    const same = run([s("2026-11-02", "1:00", "22:00")]);
    t.push(eq("追補 Q&A 2-3-2: 午前1時出勤・午後10時退勤（同じ日）は21時間", spans(same), [H(21)]));
    const eqt = run([s("2026-11-02", "8:00", "8:00")]);
    t.push(eq("終業＝始業は翌日の同時刻＝24時間（0時間と読まない）→ 22時間を超える", [spans(eqt), eqt.rows[0].spanStatus], [[H(24)], "over"]));
    const m24 = run([s("2026-11-02", "8:00", "24:00")]);
    t.push(eq("終業 24:00 はその日の24時＝16時間", spans(m24), [H(16)]));
    const zero = run([s("2026-11-02", "0:00", "22:00")]);
    t.push(eq("始業 0:00・終業 22:00 は22時間（超えない）", [spans(zero), zero.rows[0].spanStatus], [[H(22)], "ok"]));
  }

  // ── (4)(6) 入力の検証・順序 ─────────────────────────
  {
    const r = run([s("2026-11-07", "8:00", "6:00"), {}, s("2026-11-02", "8:00", "6:00"), s("2026-11-04", "8:00", "6:00")]);
    t.push(eq("入力の順に依らない（始業の早い順に並べ、空の行は飛ばす）",
      [(r.rows || []).map((x) => `${x.date.m}/${x.date.d}`), (r.rows || []).map((x) => x.line), r.rows?.[1]?.pair.status],
      [["11/2", "11/4", "11/7"], [2, 3, 0], "ng"]));
  }
  {
    const r = run([s("2026-11-02", "8:00", "6:00"), s("2026-11-03", "5:00", "3:00")]);
    t.push(eq("前の勤務の終業（翌6:00）より前に次が始まる → エラー", [r.ok, /前の勤務/.test(r.errors?.[0])], [false, true]));
    const ok = run([s("2026-11-02", "8:00", "6:00"), s("2026-11-03", "6:00", "3:00")]);
    t.push(eq("終業ちょうどに次が始まるのは重なりではない（休息0時間 → 違反）", [ok.ok, ok.rows?.[0].rest, ok.rows?.[0].restStatus], [true, 0, "ng"]));
  }
  t.push(eq("一部だけ入れた行 → エラー", (({ ok, errors }) => [ok, /すべて/.test(errors?.[0])])(run([{ date: "2026-11-02", start: "8:00" }])), [false, true]));
  t.push(eq("読めない時刻 → エラー", run([s("2026-11-02", "8:00", "26:00")]).ok, false));
  t.push(eq("読めない日付 → エラー", run([s("2026-02-30", "8:00", "6:00")]).ok, false));
  t.push(eq("始業 24:00 → エラー", run([s("2026-11-02", "24:00", "6:00")]).ok, false));
  t.push(eq("2024-03-31 の勤務 → 改正前の基準なので判定しない", (({ ok, errors }) => [ok, /改正前/.test(errors?.[0])])(run([s("2024-03-31", "8:00", "6:00")])), [false, true]));
  t.push(eq("2024-04-01 の勤務は判定する", run([s("2024-04-01", "8:00", "6:00")]).ok, true));
  t.push(eq("何も入れていない → エラー", run([]).ok, false));
  t.push(eq("空白だけの行は使わない行", run([{ date: " ", start: " ", end: "" }, s("2026-11-02", "8:00", "6:00")]).rows.length, 1));
  t.push(eq("17行目以降は読まない（16回分）", run([...Array.from({ length: 16 }, () => ({})), s("2026-11-02", "8:00", "6:00")]).ok, false));
  {
    const r = run([s("2026-11-02", "8:00", "6:00")]);
    t.push(eq("1回だけ: 平均は判定できない・休息期間は出さない", [r.rows[0].pair.status, r.rows[0].rest, r.rows[0].restStatus], ["unknown", null, "unknown"]));
  }

  // ── 1か月 ─────────────────────────
  {
    const r = run(month13());
    t.push(eq("1か月の例: 13回×20時間＝260時間 → 262時間以下（残り2時間。抜けがあれば増えるので「以下」とだけ言う）",
      [r.month.total, r.month.status, r.month.rest, r.counts.monthNg], [H(260), "under", H(2), 0]));
    t.push(eq("1か月の例: 違反は0件・休息は28時間以上・平均はすべて違反でない（最初と最後も片側で決まる）",
      [r.counts, rests(r).slice(0, -1).every((x) => x === "ok"), pairs(r).every((x) => x === "ok")],
      [{ spanOver: 0, pairNg: 0, restNg: 0, monthNg: 0 }, true, true]));
  }
  {
    const r = run(month13({ 12: "5:00" }));
    t.push(eq("1か月: 1回だけ22時間 → 合計262時間ちょうどは超えない", [r.month.total, r.month.status, r.counts.spanOver], [H(262), "under", 0]));
  }
  {
    const r = run(month13({ 12: "5:01" }));
    t.push(eq("1か月: 262時間1分 → 超える（その勤務は22時間も超える）", [r.month.total, r.month.status, r.counts.monthNg, r.counts.spanOver], [H(262, 1), "ng", 1, 1]));
    const x = run(month13({ 12: "5:01" }), true);
    t.push(eq("1か月: 労使協定で270時間に延長した月なら 262時間1分は超えない", [x.month.cap, x.month.status], [H(270), "under"]));
  }
  {
    const r = run([s("2026-11-01", "7:00", "3:00"), s("2026-12-01", "7:00", "3:00")]);
    t.push(eq("1か月: 始業日の差30日（11/1〜12/1）までは1か月分として比べる", [r.month.rangeDays, r.month.status], [30, "under"]));
    const y = run([s("2026-11-01", "7:00", "3:00"), s("2026-12-02", "7:00", "3:00")]);
    t.push(eq("1か月: 差31日（11/1〜12/2）は1か月を超える範囲なので比べない", [y.month.rangeDays, y.month.status, y.counts.monthNg], [31, "range", 0]));
  }
  {
    // 10月1日〜31日に16回すべて22時間・休息26時間 → 2回平均は中の14回が違反（最初と最後は判定できない）、1か月は 352時間・範囲は 30日
    const all = Array.from({ length: 16 }, (_, i) => s(`2026-10-${String(1 + 2 * i).padStart(2, "0")}`, "8:00", "6:00"));
    const r = run(all);
    t.push(eq("16回すべて22時間: 平均の違反は中の14回・最初と最後は判定できない・1か月 352時間で超える",
      [r.counts.pairNg, r.rows[0].pair.status, r.rows[15].pair.status, r.month.total, r.month.status], [14, "unknown", "unknown", H(352), "ng"]));
  }

  return t;
}
