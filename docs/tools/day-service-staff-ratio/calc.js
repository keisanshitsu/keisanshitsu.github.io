// 通所介護（デイサービス）の人員配置基準の計算
// （指定居宅サービス等の事業の人員、設備及び運営に関する基準 第93条・
//   指定地域密着型サービスの事業の人員、設備及び運営に関する基準 第20条）
//
// 条文（e-Gov 法令API v2 で逐語確認・2026-11-26。どちらも law_revisions の先頭が現行で、未施行の版は無い）:
//   第93条（現行 411M50000100037_20250401_506M60000100164）第1項
//     「一 生活相談員 指定通所介護の提供日ごとに、当該指定通所介護を提供している時間帯に生活相談員（専ら当該指定通所介護の
//       提供に当たる者に限る。）が勤務している時間数の合計数を当該指定通所介護を提供している時間帯の時間数で除して得た数が
//       一以上確保されるために必要と認められる数
//      二 看護師又は准看護師…指定通所介護の単位ごとに、専ら当該指定通所介護の提供に当たる看護職員が一以上確保されるために
//       必要と認められる数
//      三 介護職員 指定通所介護の単位ごとに、当該指定通所介護を提供している時間帯に介護職員（専ら…）が勤務している時間数の
//       合計数を当該指定通所介護を提供している時間数で除して得た数が利用者（…第一号通所事業…と…一体的に運営されている場合に
//       あっては、当該事業所における指定通所介護又は当該第一号通所事業の利用者。…）の数が十五人までの場合にあっては一以上、
//       十五人を超える場合にあっては十五人を超える部分の数を五で除して得た数に一を加えた数以上確保されるために必要と認められる数
//      四 機能訓練指導員 一以上」
//     第2項「…指定通所介護の単位ごとに、前項第三号の介護職員を、常時一人以上当該指定通所介護に従事させなければならない。」
//     第6項「第一項の生活相談員又は介護職員のうち一人以上は、常勤でなければならない。」
//   第20条（現行 418M60000100034_20250401_506M60000100164）第1項は第93条と同じ形。
//     第2項「当該指定地域密着型通所介護事業所の利用定員（…同時に指定地域密着型通所介護の提供を受けることができる利用者の数の
//       上限をいう。…）が十人以下である場合にあっては、前項の規定にかかわらず、看護職員及び介護職員の員数を、…単位ごとに、…
//       看護職員又は介護職員（いずれも専ら…）が勤務している時間数の合計数を提供単位時間数で除して得た数が一以上確保されるために
//       必要と認められる数とすることができる。」
//     第3項 常時一人以上（第2項の適用を受ける場合は看護職員又は介護職員。第7項（常勤）でも同じ）
//   通所介護と地域密着型の境: 介護保険法 第8条第7項・第17項、施行規則 第10条の2「…厚生労働省令で定める数は、十九人とする。」
//     （2026-11-27: 介護保険法の未施行の版 409AC0000000123_20270401_508AC0000000051 以降では「地域密着型通所介護」の定義が
//      第16項に繰り上がる。文言は現行の第17項と同一。第7項は未施行の7版すべてで同一）
//     ＝利用定員19人以上が通所介護（第93条）、18人以下が地域密着型通所介護（第20条）
//
// 「提供している時間数」の読み方（省令は書いていない）:
//   老企第25号 第三の六の1(1)⑤（厚労省 平成27年改正の新旧対照表 0000080875.pdf の改正後の欄で逐語確認。
//   現行も同じ式であることを久留米市 令和7年度の集団指導資料と堺市の写しの別表2で確認）
//   「ここでいう提供時間数とは、当該単位における平均提供時間数（利用者ごとの提供時間数の合計を利用者数で除して得た数）とする。」
//   「・利用者数15人まで 単位ごとに確保すべき勤務延時間数＝平均提供時間数
//    ・利用者数16人以上 単位ごとに確保すべき勤務延時間数＝（（利用者数－15）÷５＋１）×平均提供時間数」
//   「例えば、利用者数18人、提供時間数を５時間とした場合、（18－15）÷５＋１＝1.6となり、…５×1.6＝８時間の勤務延時間数分の
//     人員配置が必要となる。」⑤の冒頭は「（第２項の適用を受ける場合の看護職員又は介護職員を含む。…）」（当時の第93条第2項＝定員10人以下）
//   同 ④ 生活相談員「ここでいう提供時間数とは、当該事業所におけるサービス提供開始時刻から終了時刻まで
//     （サービスが提供されていない時間帯を除く。）とする。」（9:00〜12:00 と 13:00〜18:00 の2単位なら8時間）
//   同 ⑤「計算式により算出した確保すべき勤務延時間数が、当該事業所におけるサービス提供開始時刻から終了時刻までの時間数に
//     満たない場合であっても、常時１名以上が確保されるよう配置を行う必要がある」
//
// 誤差の向き:
//   - 時刻・提供時間・勤務延時間は分の整数で持つ（浮動小数を使わない）
//   - 確保すべき勤務延時間は分数のまま持つ。15人まで Σ提供時間÷n、16人以上 (n−10)×Σ提供時間÷(5n)
//     （((n−15)÷5＋1)×Σ÷n を通分した形）。配置との比較は 実績×分母 ≥ 分子 の整数比較で、丸めない
//   - 表示は分単位で切り上げ（必要な時間が少なく見えない側）
//   - 常時1人には、少なくとも単位の提供時間帯（開始〜終了）の長さの勤務延時間が要る。式の値と大きいほうを並べる
//   - 利用者の提供時間が単位の時間帯より長い・利用者数が利用定員を超える入力はエラー（合格に倒さない）

export const UP_TO = 15; // 「十五人までの場合にあっては一以上」
export const STEP = 5; // 「十五人を超える部分の数を五で除して得た数に一を加えた数」
export const CHIIKI_LIMIT = 19; // 施行規則 第10条の2: 利用定員19人未満が地域密着型
export const SMALL_CAPACITY = 10; // 第20条第2項: 利用定員10人以下
const MAX_CAPACITY = 300;
const MAX_UNITS = 3;
const MAX_STAFF_MINUTES = 200 * 60; // 勤務延時間の入力の上限（200時間）

// "9:00" / "09:00" → 540。不正なら null
export function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

// 時間（小数可・1分単位）→ 分。空欄は undefined、不正は null
export function parseHours(v) {
  if (v === undefined || v === null || String(v).trim() === "") return undefined;
  const s = String(v).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const x = Number(s) * 60;
  const r = Math.round(x);
  if (Math.abs(x - r) > 1e-9) return null; // 1分単位にならない
  return r;
}

function parseCount(v) {
  if (v === undefined || v === null || String(v).trim() === "") return undefined;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

// 区間 [start, end) の和の長さ（重なりは1回だけ・すき間は数えない）
export function unionMinutes(intervals) {
  const xs = intervals.map(([a, b]) => [a, b]).sort((p, q) => p[0] - q[0]);
  let total = 0, cs = null, ce = null;
  for (const [a, b] of xs) {
    if (ce === null || a > ce) {
      if (ce !== null) total += ce - cs;
      cs = a; ce = b;
    } else if (b > ce) ce = b;
  }
  if (ce !== null) total += ce - cs;
  return total;
}

// 確保すべき勤務延時間（分）を分数 { num, den } で
export function requiredMinutes(users, sumMinutes) {
  if (users <= UP_TO) return { num: sumMinutes, den: users };
  return { num: (users - UP_TO + STEP) * sumMinutes, den: STEP * users };
}

// 「平均提供時間数に掛ける数」（15人まで1、16人以上 (n−15)÷5＋1）を 0.1 単位の整数で
export function coefTenths(users) {
  return users <= UP_TO ? 10 : 10 + (2 * (users - UP_TO));
}

export const ceilFrac = ({ num, den }) => Math.floor((num + den - 1) / den);

export function calculate(input = {}) {
  const errors = [];
  const capacity = parseCount(input.capacity);
  if (capacity === undefined) errors.push("事業所の利用定員を入力してください。");
  else if (capacity === null || capacity < 1 || capacity > MAX_CAPACITY)
    errors.push(`利用定員は1〜${MAX_CAPACITY}の整数で入力してください。`);

  const units = [];
  const rawUnits = (input.units ?? []).slice(0, MAX_UNITS);
  rawUnits.forEach((u, i) => {
    const label = `単位${i + 1}`;
    const groups = (u?.groups ?? []).filter((g) =>
      String(g?.hours ?? "").trim() !== "" || String(g?.count ?? "").trim() !== "");
    const touched = String(u?.start ?? "").trim() || String(u?.end ?? "").trim() || groups.length ||
      String(u?.care ?? "").trim();
    if (!touched) return;
    const start = parseTime(u.start), end = parseTime(u.end);
    if (start === null || end === null) { errors.push(`${label}の開始・終了の時刻を「9:00」の形で入力してください。`); return; }
    if (end <= start) { errors.push(`${label}の終了は開始より後にしてください（日をまたぐ単位は扱いません）。`); return; }
    const span = end - start;
    let users = 0, sum = 0, bad = false;
    for (const g of groups) {
      const count = parseCount(g.count), h = parseHours(g.hours);
      if (count === null || count === undefined) { errors.push(`${label}の利用者の人数は0以上の整数で入力してください。`); bad = true; break; }
      if (count === 0) continue;
      if (h === undefined || h === null || h <= 0) { errors.push(`${label}の提供時間は「7」「5.5」のように時間で入力してください（1分単位まで）。`); bad = true; break; }
      if (h > span) { errors.push(`${label}の利用者の提供時間（${fmtMin(h)}）が、単位の提供時間帯（${fmtMin(span)}）より長くなっています。`); bad = true; break; }
      users += count;
      sum += count * h;
    }
    if (bad) return;
    if (users === 0) { errors.push(`${label}の利用者を1人以上入力してください。`); return; }
    if (capacity && users > capacity) { errors.push(`${label}の利用者${users}人が利用定員${capacity}人を超えています。`); return; }
    const care = parseHours(u.care);
    if (care === null || (care !== undefined && care > MAX_STAFF_MINUTES)) { errors.push(`${label}の勤務延時間は0〜200時間の範囲で、時間で入力してください（1分単位まで）。`); return; }
    const req = requiredMinutes(users, sum);
    const reqCeil = ceilFrac(req);
    const unit = {
      index: i + 1, start, end, span, users, sumMinutes: sum,
      avg: { num: sum, den: users }, avgCeil: ceilFrac({ num: sum, den: users }),
      coefTenths: coefTenths(users), required: req, requiredCeil: reqCeil,
      exact: req.num % req.den === 0,
      atLeast: Math.max(reqCeil, span), spanGoverns: span > reqCeil,
      staff: null,
    };
    if (care !== undefined) {
      const enoughFormula = care * req.den >= req.num;
      unit.staff = {
        minutes: care,
        enoughFormula,
        shortFormula: enoughFormula ? 0 : reqCeil - care,
        coversSpan: care >= span,
      };
    }
    units.push(unit);
  });

  if (!errors.length && !units.length) errors.push("単位1の開始・終了の時刻と、利用者の提供時間・人数を入力してください。");
  const counselorIn = parseHours(input.counselor);
  if (counselorIn === null || (counselorIn !== undefined && counselorIn > MAX_STAFF_MINUTES))
    errors.push("生活相談員の勤務延時間は0〜200時間の範囲で、時間で入力してください（1分単位まで）。");
  if (errors.length) return { ok: false, errors };

  const chiiki = capacity < CHIIKI_LIMIT;
  const small = chiiki && capacity <= SMALL_CAPACITY;
  const span = unionMinutes(units.map((u) => [u.start, u.end]));
  const counselor = { required: span, minutes: counselorIn ?? null, enough: counselorIn === undefined ? null : counselorIn >= span };
  const overlapping = units.length > 1 && span < units.reduce((a, u) => a + u.span, 0);
  return {
    ok: true,
    errors: [],
    capacity,
    service: chiiki ? "chiiki" : "tsusho",
    article: chiiki ? "指定地域密着型サービス基準 第20条" : "指定居宅サービス等基準 第93条",
    small,
    units,
    counselor,
    overlapping,
  };
}

export function fmtMin(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return `${h}時間${String(r).padStart(2, "0")}分`;
}
