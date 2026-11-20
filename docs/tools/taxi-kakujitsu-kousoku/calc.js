// タクシー隔日勤務の拘束時間・休息期間のチェック（改善基準告示 第2条第2項）
//
// 告示（自動車運転者の労働時間等の改善のための基準・平成元年労働省告示第7号。令和4年厚生労働省告示第367号による
//   改正後全文 https://www.mhlw.go.jp/content/001035032.pdf で逐語確認・2024-04-01 適用）:
//   第2条第1項「隔日勤務（始業及び終業の時刻が同一の日に属さない業務をいう。以下同じ。）」
//   第2条第2項 第1号「拘束時間は、一箇月について二百六十二時間を超えないものとすること。ただし、地域的事情その他の
//     特別の事情がある場合において、労使協定により、一年について六箇月までは、一箇月の拘束時間を二百七十時間まで
//     延長することができるものとする。」
//   第2号「二暦日についての拘束時間は、二十二時間を超えないものとし、かつ、二回の隔日勤務を平均し隔日勤務一回当たり
//     二十一時間を超えないものとすること。」
//   第4号「勤務終了後、継続二十四時間以上の休息期間を与えるよう努めることを基本とし、休息期間が継続二十二時間を
//     下回らないものとすること。」
//   第3項は「隔日勤務一回についての拘束時間が二十二時間を超えた場合」と書く＝2暦日の拘束時間は隔日勤務1回の拘束時間
//
// 施行通達（基発1223第3号・令和4年12月23日 https://www.mhlw.go.jp/content/001179482.pdf）第2の2(2)イ:
//   「次の①②のいずれもが「21 時間」を超えた場合に、初めて違反と判断される。①特定の隔日勤務の拘束時間（Ａ時間）と、
//   特定の隔日勤務の前の隔日勤務の拘束時間（Ｂ時間）との平均、②特定の隔日勤務の拘束時間（Ａ時間）と特定の隔日勤務の
//   次の隔日勤務の拘束時間（Ｃ時間）との平均」
// Q&A（基発0331第49号 https://www.mhlw.go.jp/content/001082040.pdf）2-4: 22・22・休日・22時間は違反。
//   「隔日勤務の間に休日がある場合は、休日の前後の２回の隔日勤務の拘束時間の平均を計算します。」
//   ＝前後の隔日勤務は暦の隣の日ではなく、入力した勤務の並びで前と次
// 追補（基発0311第79号・令和7年3月11日 https://www.mhlw.go.jp/content/001441923.pdf）2-3-2:
//   午前1時出勤・午後10時退勤のように始業と終業が同じ日でも、実態が2労働日をまとめた勤務なら隔日勤務の規定を適用してよい
//
// 誤差の向き:
//   時刻は分の整数。終業が始業より後ならその日、始業以前なら翌日。終業＝始業は翌日の同時刻（24時間）と読む
//   （0時間と読んで違反を見落とさない側）。22時間・平均21時間（2回の合計42時間）・262時間ちょうどは「超えない」、
//   休息22時間・24時間ちょうどは「下回らない」側（告示と通達の文言どおり）。
//   前または次の勤務が入っていない勤務の平均は「判定できない」（片側の合計が42時間以下なら、その時点で違反ではない）。
//   最後の勤務の休息期間は次の勤務が無いので出さない。合格に倒さない。
//   月をまたぐ勤務の振り分けは告示・通達・Q&A に定めが見当たらないので、入力した勤務の拘束時間をそのまま合計する。

export const DAY = 24 * 60;
export const MAX_SHIFTS = 16; // 1か月（31日）に隔日勤務は最大16回
export const SPAN_MAX = 22 * 60; // 2暦日の拘束時間（第2条第2項第2号）
export const PAIR_SUM_MAX = 42 * 60; // 2回の隔日勤務の平均21時間＝合計42時間
export const REST_BASE = 24 * 60; // 休息期間 継続24時間が基本（第4号）
export const REST_MIN = 22 * 60; // 休息期間 継続22時間を下回らない（第4号）
export const MONTH_CAP = 262 * 60; // 1か月（第1号）
export const MONTH_CAP_EXT = 270 * 60; // 労使協定で年6か月まで
export const MONTH_RANGE_DAYS = 30; // 最初と最後の勤務の始業日の差がこれ以下なら1か月分として合計を比べる
export const APPLY_FROM = "2024-04-01"; // 改正後の告示の適用日

const toAscii = (s) => String(s ?? "")
  .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  .replace(/[：]/g, ":").trim();

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

// "2026-11-02" → { y, m, d, wd, n }（n は 1970-01-01 からの日数）。空は null、実在しなければ NaN
export function parseDate(s) {
  const t = String(s ?? "").trim();
  if (t === "") return null;
  const mt = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!mt) return NaN;
  const y = +mt[1], m = +mt[2], d = +mt[3];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return NaN;
  return { y, m, d, wd: dt.getUTCDay(), n: Math.round(dt.getTime() / 86400000) };
}

export function addDays(dt, k) {
  const x = new Date(Date.UTC(dt.y, dt.m - 1, dt.d + k));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), wd: x.getUTCDay(), n: dt.n + k };
}

// 表示: 1290分 → "21時間30分"
export function fmtDur(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

// 表示: その日の0時からの分 → "21:00" / 翌日なら "翌1:00"（翌日の0:00 ちょうどは "24:00"）
export function fmtClock(minFromDay) {
  const next = minFromDay >= DAY;
  const v = minFromDay % DAY;
  const s = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
  return next ? (v === 0 ? "24:00" : `翌${s}`) : s;
}

const isBlank = (r) => !String(r?.date ?? "").trim() && !String(r?.start ?? "").trim() && !String(r?.end ?? "").trim();

export function calculate({ shifts, ext270 = false }) {
  const errors = [];
  const list = Array.from({ length: MAX_SHIFTS }, (_, i) => (shifts && shifts[i]) || {});
  const from = parseDate(APPLY_FROM);

  // ── 1. 勤務ごとの入力を読む（空の行は使わない行） ──
  const read = [];
  list.forEach((r, i) => {
    if (isBlank(r)) return;
    const no = `${i + 1}行目`;
    const dt = parseDate(r.date), s = parseClock(r.start), e = parseClock(r.end);
    if (dt == null || s == null || e == null) { errors.push(`${no}: 日付・始業・終業をすべて入れてください（使わない行は空のままに）。`); return; }
    if (Number.isNaN(dt)) { errors.push(`${no}: 日付が読めません。`); return; }
    if (Number.isNaN(s) || Number.isNaN(e)) { errors.push(`${no}: 時刻は 7:00 や 3:30 の形で入れてください。`); return; }
    if (s === DAY) { errors.push(`${no}: 始業に 24:00 は使えません（翌日の 0:00 として入れてください）。`); return; }
    if (dt.n < from.n) { errors.push(`${no}: 2024年3月31日以前の勤務には改正前の基準（2暦日21時間・休息20時間）が当たるので、このツールでは判定しません。`); return; }
    const S = dt.n * DAY + s;
    const span = e > s ? e - s : e + DAY - s; // 終業が始業以前なら翌日。同じ時刻なら24時間
    read.push({ line: i, date: dt, startMin: s, S, E: S + span, span });
  });
  if (errors.length) return { ok: false, errors };
  if (!read.length) return { ok: false, errors: ["勤務の日付・始業・終業を入れてください。"] };

  // 始業の早い順に並べる（入力の順に依らない）
  const rows = read.slice().sort((a, b) => a.S - b.S || a.line - b.line);
  for (let k = 0; k + 1 < rows.length; k++) {
    const a = rows[k], b = rows[k + 1];
    if (b.S < a.E) {
      errors.push(`${b.date.m}/${b.date.d} の勤務（${b.line + 1}行目）が、前の勤務（${a.date.m}/${a.date.d}・${a.line + 1}行目）の終業 ${fmtClock(a.E - a.date.n * DAY)} より前に始まっています。`);
    }
  }
  if (errors.length) return { ok: false, errors };

  // ── 2. 勤務ごとの判定 ──
  rows.forEach((r, k) => {
    r.k = k;
    r.spanStatus = r.span > SPAN_MAX ? "over" : "ok";

    // 2回の隔日勤務の平均（通達 第2の2(2)イ）: 前との合計・次との合計が「いずれも」42時間を超えたら違反
    const prev = rows[k - 1], next = rows[k + 1];
    const sumPrev = prev ? r.span + prev.span : null;
    const sumNext = next ? r.span + next.span : null;
    let status;
    if ((sumPrev != null && sumPrev <= PAIR_SUM_MAX) || (sumNext != null && sumNext <= PAIR_SUM_MAX)) status = "ok";
    else if (sumPrev != null && sumNext != null) status = "ng";
    else status = "unknown";
    r.pair = { status, sumPrev, sumNext };

    // 休息期間: 終業から次の勤務の始業まで
    r.rest = next ? next.S - r.E : null;
    r.restStatus = r.rest == null ? "unknown" : r.rest < REST_MIN ? "ng" : r.rest < REST_BASE ? "short" : "ok";
  });

  // ── 3. 1か月の拘束時間（入力した勤務の始業〜終業をそのまま合計） ──
  const total = rows.reduce((a, r) => a + r.span, 0);
  const rangeDays = rows[rows.length - 1].date.n - rows[0].date.n;
  const cap = ext270 ? MONTH_CAP_EXT : MONTH_CAP;
  const month = {
    total, cap, rangeDays,
    // 1か月を超える範囲が入っていれば比べない。合計が上限以下でも、抜けた勤務があれば増えるので「基準内」とは言わない
    status: rangeDays > MONTH_RANGE_DAYS ? "range" : total > cap ? "ng" : "under",
    rest: cap - total,
  };

  return {
    ok: true,
    rows, month,
    counts: {
      spanOver: rows.filter((r) => r.spanStatus === "over").length,
      pairNg: rows.filter((r) => r.pair.status === "ng").length,
      restNg: rows.filter((r) => r.restStatus === "ng").length,
      monthNg: month.status === "ng" ? 1 : 0,
    },
  };
}
