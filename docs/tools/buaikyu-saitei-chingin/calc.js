// 歩合給の最低賃金チェック
//
// 根拠（2026-11-24 に e-Gov 法令API v2 で逐語確認。どちらも law_revisions に未施行の版なし）:
//   最低賃金法 第4条（現行 334AC0000000137_20250601_504AC0000000068）
//     第1項「使用者は、最低賃金の適用を受ける労働者に対し、その最低賃金額以上の賃金を支払わなければならない。」
//     第3項 算入しない賃金（一 1月をこえない期間ごとに支払われる賃金以外 / 二 通常の労働時間又は労働日の賃金以外 /
//            三 当該最低賃金において算入しないことを定める賃金）
//   最低賃金法施行規則 第1条・第2条（現行 334M50002000016_20240331_505M60000100164）
//     第2条第1項 一 日給 ÷ 1日の所定労働時間数（日によって異なれば1週間の1日平均）
//                三 月給 ÷ 月の所定労働時間数（月によって異なれば1年間の1月平均）
//                五 出来高払制の賃金の総額 ÷ 出来高払制によって労働した総労働時間数（賃金締切期間ごと）
//     第2条第2項 休日手当その他の賃金（時間によって定められた賃金を除く）は月によって定められた賃金とみなす
//   組み合わせは「それぞれ…時間額に換算し、それを合計したものと最低賃金額（時間額）と比較します」
//   （厚労省 最低賃金特設サイト「最低賃金のチェック方法は？」）
//
// 最低賃金額と発効日: 厚労省「平成14年度から令和８年度までの地域別最低賃金改定状況」
//   https://www.mhlw.go.jp/content/11200000/001756130.xlsx の令和6〜8年度の列から機械的に生成した。
//   「令和８年度地域別最低賃金全国一覧」https://www.mhlw.go.jp/content/11200000/001753404.pdf の47行
//   （額・前年度の額・引上げ額・発効日）とテストで突き合わせる（calc.test.mjs の PDF_ROWS）。
//
// 判定は分数のまま整数（BigInt）で比べる。表示用の小数は判定に使わない。
// 「以上」なので、時間額が最低賃金とちょうど同じなら満たす。

// 令和6年度の最後の発効日（徳島県）。これより前は令和5年度の額が要るので扱わない。
export const SUPPORTED_FROM = "2024-11-01";
// 令和9年度（2027年度）の改定が発効しうる最初の日。額が未決定なので、この日以降を含む期間は判定しない。
export const UNKNOWN_FROM = "2027-10-01";

export const PREFS = [
  { code: 1, name: "北海道", rates: [{ fy: 2024, yen: 1010, from: "2024-10-01" }, { fy: 2025, yen: 1075, from: "2025-10-04" }, { fy: 2026, yen: 1131, from: "2026-10-01" }] },
  { code: 2, name: "青森県", rates: [{ fy: 2024, yen: 953, from: "2024-10-05" }, { fy: 2025, yen: 1029, from: "2025-11-21" }, { fy: 2026, yen: 1090, from: "2026-10-29" }] },
  { code: 3, name: "岩手県", rates: [{ fy: 2024, yen: 952, from: "2024-10-27" }, { fy: 2025, yen: 1031, from: "2025-12-01" }, { fy: 2026, yen: 1090, from: "2026-12-01" }] },
  { code: 4, name: "宮城県", rates: [{ fy: 2024, yen: 973, from: "2024-10-01" }, { fy: 2025, yen: 1038, from: "2025-10-04" }, { fy: 2026, yen: 1098, from: "2026-10-01" }] },
  { code: 5, name: "秋田県", rates: [{ fy: 2024, yen: 951, from: "2024-10-01" }, { fy: 2025, yen: 1031, from: "2026-03-31" }, { fy: 2026, yen: 1090, from: "2026-10-14" }] },
  { code: 6, name: "山形県", rates: [{ fy: 2024, yen: 955, from: "2024-10-19" }, { fy: 2025, yen: 1032, from: "2025-12-23" }, { fy: 2026, yen: 1092, from: "2026-10-30" }] },
  { code: 7, name: "福島県", rates: [{ fy: 2024, yen: 955, from: "2024-10-05" }, { fy: 2025, yen: 1033, from: "2026-01-01" }, { fy: 2026, yen: 1094, from: "2026-10-16" }] },
  { code: 8, name: "茨城県", rates: [{ fy: 2024, yen: 1005, from: "2024-10-01" }, { fy: 2025, yen: 1074, from: "2025-10-12" }, { fy: 2026, yen: 1136, from: "2026-10-18" }] },
  { code: 9, name: "栃木県", rates: [{ fy: 2024, yen: 1004, from: "2024-10-01" }, { fy: 2025, yen: 1068, from: "2025-10-01" }, { fy: 2026, yen: 1125, from: "2026-10-01" }] },
  { code: 10, name: "群馬県", rates: [{ fy: 2024, yen: 985, from: "2024-10-04" }, { fy: 2025, yen: 1063, from: "2026-03-01" }, { fy: 2026, yen: 1120, from: "2026-10-03" }] },
  { code: 11, name: "埼玉県", rates: [{ fy: 2024, yen: 1078, from: "2024-10-01" }, { fy: 2025, yen: 1141, from: "2025-11-01" }, { fy: 2026, yen: 1196, from: "2026-10-01" }] },
  { code: 12, name: "千葉県", rates: [{ fy: 2024, yen: 1076, from: "2024-10-01" }, { fy: 2025, yen: 1140, from: "2025-10-03" }, { fy: 2026, yen: 1195, from: "2026-10-01" }] },
  { code: 13, name: "東京都", rates: [{ fy: 2024, yen: 1163, from: "2024-10-01" }, { fy: 2025, yen: 1226, from: "2025-10-03" }, { fy: 2026, yen: 1280, from: "2026-10-01" }] },
  { code: 14, name: "神奈川県", rates: [{ fy: 2024, yen: 1162, from: "2024-10-01" }, { fy: 2025, yen: 1225, from: "2025-10-04" }, { fy: 2026, yen: 1279, from: "2026-10-01" }] },
  { code: 15, name: "新潟県", rates: [{ fy: 2024, yen: 985, from: "2024-10-01" }, { fy: 2025, yen: 1050, from: "2025-10-02" }, { fy: 2026, yen: 1108, from: "2026-10-01" }] },
  { code: 16, name: "富山県", rates: [{ fy: 2024, yen: 998, from: "2024-10-01" }, { fy: 2025, yen: 1062, from: "2025-10-12" }, { fy: 2026, yen: 1119, from: "2026-10-01" }] },
  { code: 17, name: "石川県", rates: [{ fy: 2024, yen: 984, from: "2024-10-05" }, { fy: 2025, yen: 1054, from: "2025-10-08" }, { fy: 2026, yen: 1113, from: "2026-10-03" }] },
  { code: 18, name: "福井県", rates: [{ fy: 2024, yen: 984, from: "2024-10-05" }, { fy: 2025, yen: 1053, from: "2025-10-08" }, { fy: 2026, yen: 1112, from: "2026-10-04" }] },
  { code: 19, name: "山梨県", rates: [{ fy: 2024, yen: 988, from: "2024-10-01" }, { fy: 2025, yen: 1052, from: "2025-12-01" }, { fy: 2026, yen: 1113, from: "2026-11-01" }] },
  { code: 20, name: "長野県", rates: [{ fy: 2024, yen: 998, from: "2024-10-01" }, { fy: 2025, yen: 1061, from: "2025-10-03" }, { fy: 2026, yen: 1117, from: "2026-10-02" }] },
  { code: 21, name: "岐阜県", rates: [{ fy: 2024, yen: 1001, from: "2024-10-01" }, { fy: 2025, yen: 1065, from: "2025-10-18" }, { fy: 2026, yen: 1121, from: "2026-10-01" }] },
  { code: 22, name: "静岡県", rates: [{ fy: 2024, yen: 1034, from: "2024-10-01" }, { fy: 2025, yen: 1097, from: "2025-11-01" }, { fy: 2026, yen: 1154, from: "2026-10-15" }] },
  { code: 23, name: "愛知県", rates: [{ fy: 2024, yen: 1077, from: "2024-10-01" }, { fy: 2025, yen: 1140, from: "2025-10-18" }, { fy: 2026, yen: 1195, from: "2026-10-01" }] },
  { code: 24, name: "三重県", rates: [{ fy: 2024, yen: 1023, from: "2024-10-01" }, { fy: 2025, yen: 1087, from: "2025-11-21" }, { fy: 2026, yen: 1143, from: "2026-10-01" }] },
  { code: 25, name: "滋賀県", rates: [{ fy: 2024, yen: 1017, from: "2024-10-01" }, { fy: 2025, yen: 1080, from: "2025-10-05" }, { fy: 2026, yen: 1136, from: "2026-10-03" }] },
  { code: 26, name: "京都府", rates: [{ fy: 2024, yen: 1058, from: "2024-10-01" }, { fy: 2025, yen: 1122, from: "2025-11-21" }, { fy: 2026, yen: 1180, from: "2026-11-16" }] },
  { code: 27, name: "大阪府", rates: [{ fy: 2024, yen: 1114, from: "2024-10-01" }, { fy: 2025, yen: 1177, from: "2025-10-16" }, { fy: 2026, yen: 1231, from: "2026-10-01" }] },
  { code: 28, name: "兵庫県", rates: [{ fy: 2024, yen: 1052, from: "2024-10-01" }, { fy: 2025, yen: 1116, from: "2025-10-04" }, { fy: 2026, yen: 1172, from: "2026-10-01" }] },
  { code: 29, name: "奈良県", rates: [{ fy: 2024, yen: 986, from: "2024-10-01" }, { fy: 2025, yen: 1051, from: "2025-11-16" }, { fy: 2026, yen: 1107, from: "2026-10-04" }] },
  { code: 30, name: "和歌山県", rates: [{ fy: 2024, yen: 980, from: "2024-10-01" }, { fy: 2025, yen: 1045, from: "2025-11-01" }, { fy: 2026, yen: 1101, from: "2026-10-03" }] },
  { code: 31, name: "鳥取県", rates: [{ fy: 2024, yen: 957, from: "2024-10-05" }, { fy: 2025, yen: 1030, from: "2025-10-04" }, { fy: 2026, yen: 1090, from: "2026-10-03" }] },
  { code: 32, name: "島根県", rates: [{ fy: 2024, yen: 962, from: "2024-10-12" }, { fy: 2025, yen: 1033, from: "2025-11-17" }, { fy: 2026, yen: 1092, from: "2026-10-10" }] },
  { code: 33, name: "岡山県", rates: [{ fy: 2024, yen: 982, from: "2024-10-02" }, { fy: 2025, yen: 1047, from: "2025-12-01" }, { fy: 2026, yen: 1104, from: "2026-10-02" }] },
  { code: 34, name: "広島県", rates: [{ fy: 2024, yen: 1020, from: "2024-10-01" }, { fy: 2025, yen: 1085, from: "2025-11-01" }, { fy: 2026, yen: 1141, from: "2026-10-11" }] },
  { code: 35, name: "山口県", rates: [{ fy: 2024, yen: 979, from: "2024-10-01" }, { fy: 2025, yen: 1043, from: "2025-10-16" }, { fy: 2026, yen: 1101, from: "2026-10-08" }] },
  { code: 36, name: "徳島県", rates: [{ fy: 2024, yen: 980, from: "2024-11-01" }, { fy: 2025, yen: 1046, from: "2026-01-01" }, { fy: 2026, yen: 1103, from: "2026-11-01" }] },
  { code: 37, name: "香川県", rates: [{ fy: 2024, yen: 970, from: "2024-10-02" }, { fy: 2025, yen: 1036, from: "2025-10-18" }, { fy: 2026, yen: 1092, from: "2026-10-01" }] },
  { code: 38, name: "愛媛県", rates: [{ fy: 2024, yen: 956, from: "2024-10-13" }, { fy: 2025, yen: 1033, from: "2025-12-01" }, { fy: 2026, yen: 1093, from: "2026-11-01" }] },
  { code: 39, name: "高知県", rates: [{ fy: 2024, yen: 952, from: "2024-10-09" }, { fy: 2025, yen: 1023, from: "2025-12-01" }, { fy: 2026, yen: 1086, from: "2026-10-29" }] },
  { code: 40, name: "福岡県", rates: [{ fy: 2024, yen: 992, from: "2024-10-05" }, { fy: 2025, yen: 1057, from: "2025-11-16" }, { fy: 2026, yen: 1114, from: "2026-10-04" }] },
  { code: 41, name: "佐賀県", rates: [{ fy: 2024, yen: 956, from: "2024-10-17" }, { fy: 2025, yen: 1030, from: "2025-11-21" }, { fy: 2026, yen: 1095, from: "2026-11-15" }] },
  { code: 42, name: "長崎県", rates: [{ fy: 2024, yen: 953, from: "2024-10-12" }, { fy: 2025, yen: 1031, from: "2025-12-01" }, { fy: 2026, yen: 1087, from: "2026-11-02" }] },
  { code: 43, name: "熊本県", rates: [{ fy: 2024, yen: 952, from: "2024-10-05" }, { fy: 2025, yen: 1034, from: "2026-01-01" }, { fy: 2026, yen: 1092, from: "2026-12-01" }] },
  { code: 44, name: "大分県", rates: [{ fy: 2024, yen: 954, from: "2024-10-05" }, { fy: 2025, yen: 1035, from: "2026-01-01" }, { fy: 2026, yen: 1096, from: "2026-11-01" }] },
  { code: 45, name: "宮崎県", rates: [{ fy: 2024, yen: 952, from: "2024-10-05" }, { fy: 2025, yen: 1023, from: "2025-11-16" }, { fy: 2026, yen: 1085, from: "2026-10-24" }] },
  { code: 46, name: "鹿児島県", rates: [{ fy: 2024, yen: 953, from: "2024-10-05" }, { fy: 2025, yen: 1026, from: "2025-11-01" }, { fy: 2026, yen: 1090, from: "2026-10-25" }] },
  { code: 47, name: "沖縄県", rates: [{ fy: 2024, yen: 952, from: "2024-10-09" }, { fy: 2025, yen: 1023, from: "2025-12-01" }, { fy: 2026, yen: 1086, from: "2026-12-02" }] },
];

export const FY_LABEL = { 2024: "令和6年度", 2025: "令和7年度", 2026: "令和8年度" };

// 入力の上限（入力ミスを止めるためのもの。法令の数値ではない）
export const MAX_YEN = 100000000;
export const MAX_PERIOD_HOURS = 744;   // 31日×24時間
export const MAX_DAY_HOURS = 24;

// ── 分数（BigInt） ─────────────────────────
const abs = (x) => (x < 0n ? -x : x);
function gcd(a, b) { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a || 1n; }
export function rat(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new Error("分母が0");
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
export const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => rat(a.n * b.n, a.d * b.d);
export const div = (a, b) => rat(a.n * b.d, a.d * b.n);
export const cmp = (a, b) => { const x = a.n * b.d - b.n * a.d; return x > 0n ? 1 : x < 0n ? -1 : 0; };
const floorDiv = (n, d) => (n >= 0n ? n / d : -((-n + d - 1n) / d));
const ceilDiv = (n, d) => -floorDiv(-n, d);
export const ceilInt = (a) => ceilDiv(a.n, a.d);

// 小数第2位までの文字列（down=true で切り捨て、false で切り上げ）。3桁区切りつき
export function fmt2(a, down = true) {
  const c = down ? floorDiv(a.n * 100n, a.d) : ceilDiv(a.n * 100n, a.d);
  const neg = c < 0n;
  const v = neg ? -c : c;
  const int = (v / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${int}.${(v % 100n).toString().padStart(2, "0")}`;
}
// 時間の表示（小数第2位まで・末尾の0は落とす。割り切れないときは切り捨てて「…」）
export function fmtHours(a) {
  const exact = (a.n * 100n) % a.d === 0n;
  const s = fmt2(a, true).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return exact ? s : `${s}…`;
}

// ── 入力の読み取り ─────────────────────────
const blank = (v) => v === undefined || v === null || String(v).trim() === "";

// 円: 0以上の整数
export function parseYen(v) {
  if (blank(v)) return { blank: true };
  const s = String(v).trim().replace(/,/g, "");
  if (!/^\d+$/.test(s)) return { error: true };
  const n = Number(s);
  if (n > MAX_YEN) return { error: true };
  return { value: n };
}
// 時間・日数: 小数第2位までの正の数を分数で持つ（173.33 → 17333/100）
export function parseDecimal(v) {
  if (blank(v)) return { blank: true };
  const s = String(v).trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return { error: true };
  const frac = (m[2] ?? "").padEnd(2, "0");
  const r = rat(BigInt(m[1]) * 100n + BigInt(frac), 100n);
  return { value: r };
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
export function validDate(s) {
  const m = ISO.exec(String(s ?? ""));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
export function daysBetween(a, b) {
  const t = (s) => { const m = ISO.exec(s); return Date.UTC(+m[1], +m[2] - 1, +m[3]); };
  return Math.round((t(b) - t(a)) / 86400000);
}

// ── 最低賃金の引き当て ─────────────────────────
export const prefByCode = (code) => PREFS.find((p) => p.code === Number(code)) ?? null;

// その日に効いている地域別最低賃金（収録範囲外は null）
export function rateOn(code, iso) {
  const p = prefByCode(code);
  if (!p || !validDate(iso) || iso >= UNKNOWN_FROM) return null;
  let hit = null;
  for (const r of p.rates) if (r.from <= iso) hit = r;
  return hit;
}

// 賃金計算期間（初日〜末日）に効く最低賃金を、期間の初日の額と期間中に発効する額の順に返す
export function ratesForPeriod(code, start, end) {
  const p = prefByCode(code);
  if (!p) return { ok: false, error: "都道府県を選んでください。" };
  if (!validDate(start) || !validDate(end)) return { ok: false, error: "賃金計算期間の初日と末日を日付で入れてください。" };
  if (start > end) return { ok: false, error: "賃金計算期間の初日が末日より後になっています。" };
  if (end >= UNKNOWN_FROM)
    return { ok: false, error: "2027年10月1日以降を含む期間は判定しません。令和9年度の最低賃金がまだ決まっていないためです（例年10月から順次発効）。" };
  const first = rateOn(code, start);
  if (!first) return { ok: false, error: `${p.name}の最低賃金は${p.rates[0].from}以降の分だけ収録しています。それより前を含む期間は判定しません。` };
  const rates = [first, ...p.rates.filter((r) => r.from > start && r.from <= end)];
  return { ok: true, pref: p, rates };
}

// ── 本体 ─────────────────────────
// input: { pref, start, end, monthly, monthlyHours, annualDays, dayHours, daily, hourly, piece, pieceHours }
export function calculate(input) {
  const errors = [];
  const notes = [];
  const period = ratesForPeriod(input.pref, input.start, input.end);
  if (!period.ok) errors.push(period.error);

  const yen = {};
  for (const k of ["monthly", "daily", "hourly", "piece"]) {
    yen[k] = parseYen(input[k]);
    if (yen[k].error) errors.push(`${LABEL[k]}は0以上の整数（円）で入れてください。`);
  }
  const num = {};
  for (const k of ["monthlyHours", "annualDays", "dayHours", "pieceHours"]) {
    num[k] = parseDecimal(input[k]);
    if (num[k].error) errors.push(`${LABEL[k]}は小数第2位までの数で入れてください。`);
  }
  const positive = (k, max) => {
    const v = num[k].value;
    if (!v) return null;
    if (v.n === 0n) { errors.push(`${LABEL[k]}は0より大きい数にしてください。`); return null; }
    if (cmp(v, rat(max)) > 0) { errors.push(`${LABEL[k]}は${max}以下にしてください。`); return null; }
    return v;
  };
  const dayHours = positive("dayHours", MAX_DAY_HOURS);
  const pieceHours = positive("pieceHours", MAX_PERIOD_HOURS);
  const annualDays = positive("annualDays", 366);
  let monthlyHours = positive("monthlyHours", MAX_PERIOD_HOURS);
  let monthlyHoursFrom = monthlyHours ? "input" : null;
  if (annualDays && !Number.isInteger(Number(input.annualDays))) errors.push("年間所定労働日数は整数で入れてください。");

  const present = (k) => yen[k].value !== undefined;
  if (present("monthly")) {
    if (!monthlyHours && annualDays && dayHours) {
      // 1年間における1月平均所定労働時間数 ＝ 年間所定労働日数 × 1日の所定労働時間 ÷ 12
      monthlyHours = div(mul(annualDays, dayHours), rat(12));
      monthlyHoursFrom = "annual";
      if (cmp(monthlyHours, rat(MAX_PERIOD_HOURS)) > 0) { errors.push("1か月平均所定労働時間が744時間を超えます。入力を確かめてください。"); monthlyHours = null; }
    } else if (monthlyHours && annualDays && dayHours) {
      const calc = div(mul(annualDays, dayHours), rat(12));
      if (cmp(calc, monthlyHours) !== 0) notes.push({ key: "monthlyHoursBoth", calc });
    }
    if (!monthlyHours && !errors.some((e) => e.includes("1か月平均")))
      errors.push("月給を時間額にするには、1か月平均所定労働時間（または年間所定労働日数と1日の所定労働時間）が要ります。");
  }
  if (present("daily") && !dayHours && !num.dayHours.error && !errors.some((e) => e.startsWith(LABEL.dayHours)))
    errors.push("日給を時間額にするには、1日の所定労働時間が要ります。");
  if (present("piece") && !pieceHours && !num.pieceHours.error && !errors.some((e) => e.startsWith(LABEL.pieceHours)))
    errors.push("歩合給を時間額にするには、歩合給の期間の総労働時間（時間外・休日を含む）が要ります。");
  if (!["monthly", "daily", "hourly", "piece"].some(present) && !errors.length)
    errors.push("月給・日給・時給・歩合給のどれか1つ以上を入れてください（0円も入れられます）。");

  if (errors.length) return { ok: false, errors };

  // 時間額への換算（施行規則 第2条第1項 第1号・第3号・第5号、時給はそのまま）
  const parts = [];
  if (present("monthly")) parts.push({ kind: "monthly", yen: yen.monthly.value, hours: monthlyHours, hoursFrom: monthlyHoursFrom });
  if (present("daily")) parts.push({ kind: "daily", yen: yen.daily.value, hours: dayHours });
  if (present("hourly")) parts.push({ kind: "hourly", yen: yen.hourly.value, hours: rat(1) });
  if (present("piece")) parts.push({ kind: "piece", yen: yen.piece.value, hours: pieceHours });
  for (const p of parts) p.perHour = div(rat(p.yen), p.hours);
  const total = parts.reduce((s, p) => add(s, p.perHour), rat(0));

  // 最低賃金に届くための額は、歩合給 → 月給 → 日給 → 時給 の順に1つだけ出す（施行規則 第2条の式を逆に解いたもの）
  const target = ["piece", "monthly", "daily", "hourly"].map((k) => parts.find((p) => p.kind === k)).find(Boolean);
  const comparisons = period.rates.map((r) => {
    const mw = rat(r.yen);
    const ok = cmp(total, mw) >= 0;
    const others = sub(total, target.perHour);
    const needPerHour = sub(mw, others);
    const need = needPerHour.n <= 0n ? 0 : Number(ceilInt(mul(needPerHour, target.hours)));
    return {
      fy: r.fy, yen: r.yen, from: r.from, ok,
      short: ok ? rat(0) : sub(mw, total),
      need: { kind: target.kind, yen: need, more: Math.max(0, need - target.yen) },
    };
  });

  if (daysBetween(input.start, input.end) > 30) notes.push({ key: "longPeriod" });
  const straddle = comparisons.length > 1;
  return {
    ok: true,
    pref: period.pref,
    parts,
    total,
    comparisons,
    straddle,
    allOk: comparisons.every((c) => c.ok),
    anyOk: comparisons.some((c) => c.ok),
    notes,
  };
}

export const LABEL = {
  monthly: "月給",
  daily: "日給",
  hourly: "時給",
  piece: "歩合給",
  monthlyHours: "1か月平均所定労働時間",
  annualDays: "年間所定労働日数",
  dayHours: "1日の所定労働時間",
  pieceHours: "歩合給の期間の総労働時間",
};
