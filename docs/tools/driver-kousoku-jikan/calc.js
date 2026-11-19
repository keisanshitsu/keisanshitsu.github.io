// トラック・タクシー運転者の拘束時間・休息期間・運転時間のチェック（改善基準告示）
//
// 告示（自動車運転者の労働時間等の改善のための基準・平成元年労働省告示第7号。令和4年厚生労働省告示第367号による
//   改正後全文 https://www.mhlw.go.jp/content/001035032.pdf で逐語確認・2024-04-01 適用）:
//   第2条第1項（タクシー日勤）「拘束時間（労働時間、休憩時間その他の使用者に拘束されている時間をいう。以下同じ。）及び
//     休息期間（使用者の拘束を受けない期間をいう。以下同じ。）」
//     第2号「一日（始業時刻から起算して二十四時間をいう。以下同じ。）についての拘束時間は、十三時間を超えないものとし、
//     当該拘束時間を延長する場合であっても、一日についての拘束時間の限度（以下「最大拘束時間」という。）は、十五時間とすること。」
//     第4号「勤務終了後、継続十一時間以上の休息期間を与えるよう努めることを基本とし、休息期間が継続九時間を下回らないものとすること。」
//   第4条第1項（トラック）第3号「一日についての拘束時間は、十三時間を超えないものとし、…最大拘束時間は十五時間とすること。」
//     第5号 休息期間は第2条と同じ文言。第6号「運転時間は、二日（始業時刻から起算して四十八時間をいう。…）を平均し一日当たり
//     九時間、二週間を平均し一週間当たり四十四時間を超えないものとすること。」
//
// 施行通達（基発1223第3号・令和4年12月23日 https://www.mhlw.go.jp/content/001179482.pdf で逐語確認）:
//   トラック 第2の4(2)「当該回数については、１週間について２回以内を目安とすること。この場合において、１日の拘束時間が
//     「14 時間」を超える日が連続することは望ましくないこと。」 タクシー日勤 第2の2(1)イ「１週間に３回以内を目安とすること。」
//   第2の4(4)「次の①②のいずれもが「９時間」を超えた場合に、初めて違反と判断される。①特定日の運転時間（Ａ時間）と特定日の
//     前日の運転時間（Ｂ時間）との平均、② 特定日の運転時間（Ａ時間）と特定日の翌日の運転時間（Ｃ時間）との平均」
//     「２週間における総運転時間を計算する場合は、特定の日を起算日として２週間ごとに区切り、その２週間ごとに計算しなければならない」
//
// 数え方（厚労省パンフレット「トラック運転者の労働時間等の改善基準のポイント」2024.12版 P4〜P9 の計算例で確認）:
//   1日の拘束時間＝始業から24時間の中の拘束時間。翌日の始業が早まると、その分が前日の1日にも入る（二重に数える）。
//     P6「月曜日 始業8：00～終業21：00 13時間・火曜日 始業6：00～8：00 2時間 合計15時間」「火曜日 始業6：00～終業19：00 13時間」
//   1か月の拘束時間＝各勤務の始業から終業までを「そのまま合計」（P4。重なりは二重に数えない）
//   2日平均は合計で比べる: 平均が9時間を超える ⇔ 2日の合計が18時間を超える。2週は起算日から14日の合計が88時間を超えるか
//
// 誤差の向き:
//   時刻は分の整数で持つ。14時間・9時間・11時間ちょうどは「超えない／下回らない」側（告示と通達の文言どおり）。
//   未入力の日を休日（運転0時間）にしない。休日は「休」の印をつけた日だけ。未入力の日が要る判定は「判定できない」にする。
//   運転時間は勤務ごとに入れた値をその始業日の運転時間とし、前日の24時間への重なりは数え直さない
//   （告示・通達・パンフレットに運転時間の重なりの数え方の記述が見当たらないため。拘束時間の重なりは数える）。

export const DAY = 24 * 60;
export const DAYS = 14; // 2週（通達「２週間ごとに区切り」）
export const OVER14 = 14 * 60;
export const DRIVE_2DAY_SUM = 18 * 60; // 2日平均9時間（第4条第1項第6号）
export const DRIVE_2WEEK_SUM = 88 * 60; // 2週平均44時間（同）

export const RULES = {
  truck: {
    label: "トラック",
    article: "告示 第4条第1項",
    base: 13 * 60, max: 15 * 60, restBase: 11 * 60, restMin: 9 * 60,
    over14PerWeek: 2, // 通達 第2の4(2)
    driving: true,
    monthCap: 284 * 60, // 第4条第1項第1号（労使協定で年6か月まで310時間）
  },
  taxi: {
    label: "タクシー（日勤）",
    article: "告示 第2条第1項",
    base: 13 * 60, max: 15 * 60, restBase: 11 * 60, restMin: 9 * 60,
    over14PerWeek: 3, // 通達 第2の2(1)イ
    driving: false, // タクシーには運転時間の上限が無い
    monthCap: 288 * 60, // 第2条第1項第1号（車庫待ち等は労使協定で300時間）
  },
};

const toAscii = (s) => String(s ?? "")
  .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  .replace(/[：]/g, ":").replace(/[．]/g, ".").trim();

// 時刻 "8:00" "08:00" "800" "0800" "8" → 分。空は null、読めなければ NaN。24:00 は終業だけに使う
export function parseClock(s) {
  const t = toAscii(s);
  if (t === "") return null;
  let h, m;
  let mt = t.match(/^(\d{1,2}):(\d{2})$/);
  if (mt) { h = +mt[1]; m = +mt[2]; }
  else if ((mt = t.match(/^(\d{1,2})$/))) { h = +mt[1]; m = 0; }
  else if ((mt = t.match(/^(\d{1,2})(\d{2})$/))) { h = +mt[1]; m = +mt[2]; }
  else return NaN;
  if (m > 59 || h > 24 || (h === 24 && m !== 0)) return NaN;
  return h * 60 + m;
}

// 運転時間 "9:30" "9.5" "9" → 分。空は null、読めなければ NaN。24時間まで
export function parseDuration(s) {
  const t = toAscii(s);
  if (t === "") return null;
  let v;
  let mt = t.match(/^(\d{1,2}):(\d{2})$/);
  if (mt) {
    if (+mt[2] > 59) return NaN;
    v = +mt[1] * 60 + +mt[2];
  } else if (/^\d{1,2}(\.\d{1,2})?$/.test(t)) {
    v = Math.round(parseFloat(t) * 60);
  } else return NaN;
  return v <= DAY ? v : NaN;
}

export function parseDate(s) {
  const mt = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!mt) return null;
  const y = +mt[1], m = +mt[2], d = +mt[3];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function addDays(dt, n) {
  const x = new Date(Date.UTC(dt.y, dt.m - 1, dt.d + n));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), wd: x.getUTCDay() };
}

// 表示: 790分 → "13時間10分"
export function fmtDur(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

// 表示: その日の0時からの分 → "21:00" / 翌日なら "翌1:00"
export function fmtClock(minFromDay) {
  const next = minFromDay >= DAY;
  const v = minFromDay % DAY;
  const s = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
  return next ? (v === 0 ? "24:00" : `翌${s}`) : s;
}

export function calculate({ mode, startDate, days }) {
  const rule = RULES[mode];
  const errors = [];
  if (!rule) return { ok: false, errors: ["運転者の種類を選んでください。"] };
  const start = parseDate(startDate);
  if (!start) return { ok: false, errors: ["1日目の日付を入力してください。"] };
  const list = Array.from({ length: DAYS }, (_, i) => (days && days[i]) || {});

  // ── 1. 日ごとの入力を読む ──
  const rows = list.map((r, i) => {
    const date = addDays(start, i);
    const label = `${date.m}/${date.d}`;
    const s = parseClock(r.start), e = parseClock(r.end);
    const dv = rule.driving ? parseDuration(r.drive) : null;
    if (r.off) {
      if (s != null || e != null || dv != null) errors.push(`${label}: 「休」の日に始業・終業・運転時間が入っています。`);
      return { i, date, status: "off" };
    }
    if (s == null && e == null && dv == null) return { i, date, status: "unknown" };
    if (s == null || e == null) { errors.push(`${label}: 始業と終業の両方を入れてください（休みなら「休」に印を）。`); return { i, date, status: "error" }; }
    if (Number.isNaN(s) || Number.isNaN(e)) { errors.push(`${label}: 時刻は 8:00 や 21:30 の形で入れてください。`); return { i, date, status: "error" }; }
    if (s === DAY) { errors.push(`${label}: 始業に 24:00 は使えません（翌日の 0:00 として入れてください）。`); return { i, date, status: "error" }; }
    if (e === s) { errors.push(`${label}: 始業と終業が同じ時刻です。`); return { i, date, status: "error" }; }
    const S = i * DAY + s;
    const E = i * DAY + (e > s ? e : e + DAY); // 終業が始業以前なら翌日（隔日勤務は扱わない）
    if (Number.isNaN(dv)) { errors.push(`${label}: 運転時間は 9:30 や 9.5 の形で入れてください。`); return { i, date, status: "error" }; }
    if (dv != null && dv > E - S) { errors.push(`${label}: 運転時間が始業から終業までの時間より長くなっています。`); return { i, date, status: "error" }; }
    return { i, date, status: "work", S, E, span: E - S, drive: dv };
  });
  for (let i = 0; i + 1 < DAYS; i++) {
    const a = rows[i], b = rows[i + 1];
    if (a.status === "work" && b.status === "work" && b.S < a.E) {
      errors.push(`${b.date.m}/${b.date.d}: 前日の勤務が終わる前に始業しています（${a.date.m}/${a.date.d} の終業 ${fmtClock(a.E - a.i * DAY)}）。`);
    }
  }
  if (errors.length) return { ok: false, errors };
  if (!rows.some((r) => r.status === "work")) return { ok: false, errors: ["勤務した日の始業と終業を入れてください。"] };

  // ── 2. 1日（始業から24時間）の拘束時間と休息期間 ──
  for (const r of rows) {
    if (r.status !== "work") continue;
    const next = rows[r.i + 1];
    const W = r.S + DAY;
    let overlap = 0, known = true;
    if (next && next.status === "work") {
      overlap = next.S < W ? Math.min(next.E, W) - next.S : 0;
    } else if (!next || next.status === "unknown") {
      // 翌日の始業がこの日の始業時刻より早ければ増える。始業が0:00なら翌日に重なる余地は無い
      known = r.S - r.i * DAY === 0;
    }
    r.overlap = overlap;
    r.kousoku = r.span + overlap;
    r.kousokuKnown = known;
    r.kousokuStatus = r.kousoku > rule.max ? "over" : r.kousoku > rule.base ? "ext" : "ok";
    r.over14 = r.kousoku > OVER14;

    // 休息期間: 次の勤務まで（間が「休」だけなら越えて数える。未入力の日があれば分からない）
    r.rest = null;
    for (let k = r.i + 1; k < DAYS; k++) {
      if (rows[k].status === "off") continue;
      if (rows[k].status === "work") r.rest = rows[k].S - r.E;
      break;
    }
    r.restStatus = r.rest == null ? "unknown" : r.rest < rule.restMin ? "ng" : r.rest < rule.restBase ? "short" : "ok";
  }

  // ── 3. 14時間超の回数（1日目から7日ごと）と連続 ──
  const weeks = [0, 1].map((w) => {
    const ds = rows.slice(w * 7, w * 7 + 7).filter((r) => r.status === "work" && r.over14);
    return { w, count: ds.length, limit: rule.over14PerWeek, exceeded: ds.length > rule.over14PerWeek, days: ds.map((r) => r.i) };
  });
  const consecutive14 = [];
  for (let i = 0; i + 1 < DAYS; i++) {
    if (rows[i].status === "work" && rows[i + 1].status === "work" && rows[i].over14 && rows[i + 1].over14) consecutive14.push([i, i + 1]);
  }

  // ── 4. 運転時間（トラックだけ） ──
  let twoWeek = null;
  if (rule.driving) {
    const driveOf = (k) => {
      if (k < 0 || k >= DAYS) return null;
      const r = rows[k];
      if (r.status === "off") return 0;
      if (r.status === "work") return r.drive;
      return null;
    };
    for (const r of rows) {
      if (r.status !== "work") continue;
      if (r.drive == null) { r.drive2 = { status: "unknown", why: "この日の運転時間が未入力" }; continue; }
      const B = driveOf(r.i - 1), C = driveOf(r.i + 1);
      const sumB = B == null ? null : r.drive + B;
      const sumC = C == null ? null : r.drive + C;
      let status;
      if ((sumB != null && sumB <= DRIVE_2DAY_SUM) || (sumC != null && sumC <= DRIVE_2DAY_SUM)) status = "ok";
      else if (sumB != null && sumC != null) status = "ng";
      else status = "unknown";
      r.drive2 = { status, sumPrev: sumB, sumNext: sumC };
    }
    let sum = 0, known = true;
    for (let k = 0; k < DAYS; k++) {
      const d = driveOf(k);
      if (d == null) known = false; else sum += d;
    }
    twoWeek = { sum, known, status: sum > DRIVE_2WEEK_SUM ? "ng" : known ? "ok" : "unknown", rest: DRIVE_2WEEK_SUM - sum };
  }

  const work = rows.filter((r) => r.status === "work");
  return {
    ok: true,
    mode, rule, start,
    rows, weeks, consecutive14, twoWeek,
    totalSpan: work.reduce((a, r) => a + r.span, 0), // 1か月の数え方（P4）: 始業〜終業をそのまま合計
    counts: {
      over: work.filter((r) => r.kousokuStatus === "over").length,
      restNg: work.filter((r) => r.restStatus === "ng").length,
      drive2Ng: work.filter((r) => r.drive2 && r.drive2.status === "ng").length,
      twoWeekNg: twoWeek && twoWeek.status === "ng" ? 1 : 0,
    },
  };
}
