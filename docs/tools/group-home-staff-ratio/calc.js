// 障害者グループホーム（共同生活援助）の人員配置基準の計算
//
// 条文（e-Gov 法令API v2 の現行版で逐語確認・2026-11-18。未施行の版は無い）:
//   障害者の日常生活及び社会生活を総合的に支援するための法律に基づく指定障害福祉サービスの事業等の
//   人員、設備及び運営に関する基準（平成18年厚生労働省令第171号）
//   （418M60000100171_20251001_506M60000102003）
//   第208条第1項（介護サービス包括型）
//     「一 世話人 指定共同生活援助事業所ごとに、常勤換算方法で、利用者の数を六で除した数以上
//      二 生活支援員 …常勤換算方法で、次のイからニまでに掲げる数の合計数以上
//        イ …区分三に該当する利用者の数を九で除した数 ロ …区分四に該当する利用者の数を六で除した数
//        ハ …区分五に該当する利用者の数を四で除した数 ニ …区分六に該当する利用者の数を二・五で除した数
//      三 サービス管理責任者 …イ 利用者の数が三十以下 一以上 ロ 利用者の数が三十一以上 一に、
//        利用者の数が三十を超えて三十又はその端数を増すごとに一を加えて得た数以上」
//     第2項「前項の利用者の数は、前年度の平均値とする。ただし、新規に指定を受ける場合は、推定数による。」
//   第213条の4（日中サービス支援型）
//     第1項第1号「…世話人の総数は、…常勤換算方法で、利用者の数を五で除した数以上」（生活支援員・サビ管は同じ式）
//     第2項「…共同生活住居ごとに、夜間及び深夜の時間帯を通じて一以上の夜間支援従事者…を置くものとする。」
//     第5項「…従業者のうち、一人以上は、常勤でなければならない。」
//   第213条の14（外部サービス利用型）第1項「一 世話人 …利用者の数を六で除した数以上 二 サービス管理責任者」
//     平成25年厚生労働省令第124号 附則第4条「施行日において現に存する旧指定共同生活援助事業所について、
//     …第二百十三条の十四の規定を適用する場合においては、当分の間、同条第一項第一号中「六」とあるのは「十」とする。」
//     （施行日＝平成26年4月1日）
//
// 解釈通知（障発第1206001号。令和7年3月31日一部改正の新旧対照表の改正後欄で確認）:
//   第二の2(5)①「前年度の平均値」は、前年度の利用者延べ数を開所日数で除して得た数とする。
//     「この算定に当たっては、小数点第２位以下を切り上げるものとする。」
//   第二の2(1)「常勤換算方法」は、勤務延べ時間数を常勤の従業者が勤務すべき時間数
//     （１週間に勤務すべき時間数が32時間を下回る場合は32時間を基本とする。）で除す。
//   第十五の1(1)(2) の例「40時間×（12÷６）人＝延べ80時間以上」
//     「区分６：40時間×（２÷2.5）人＝32時間 区分５：40時間×（４÷４）人＝40時間
//      区分４：40時間×（６÷６）人＝40時間 延べ合計112時間以上」
//
// 誤差の向き:
//   利用者の数は 0.1人単位の整数で持つ。2桁以上の小数が入ったら第2位以下を切り上げる（必要数が少なく出ない側）。
//   必要数は 1/1800 人単位の整数で厳密に足す（9・6・4・2.5・5・10 で割った値がすべて整数になる単位）。
//   通知は必要数の端数の扱いを定めていないので丸めない。表示は小数第3位以下を切り上げ、週の時間は分に切り上げる。
//   足りるかの判定は整数で厳密に比べる。
//   サビ管: 前年度の平均値が30.1〜30.9人のときは条文の「三十以下」「三十一以上」のどちらの文言にも当たらない。
//     ロの式（三十を超えて三十又はその端数を増すごとに一）を当てた多いほう（2人）を出し、そのことを表示する。

export const TYPES = {
  hokatsu: "介護サービス包括型",
  nicchu: "日中サービス支援型",
  gaibu: "外部サービス利用型",
};
export const UNIT = 1800; // 1/1800 人
export const MAX_PEOPLE_TENTHS = 10000; // 1,000人
export const MAX_HOUSES = 100;
export const MAX_HOURS_HUNDREDTHS = 10000000; // 100,000時間
export const FULLTIME_FLOOR = 3200; // 32時間（0.01時間単位）

// 区分ごとの「利用者の数を○で除した数」を 1/1800 人単位にする係数（人数は 0.1人単位）
// 区分3: ÷9 → a/90 人 = 20a/1800、区分4: ÷6 → 30a、区分5: ÷4 → 45a、区分6: ÷2.5 → 72a
export const SHIEN_FACTOR = { k3: 20, k4: 30, k5: 45, k6: 72 };
export const SHIEN_DIVISOR = { k3: "9", k4: "6", k5: "4", k6: "2.5" };
// 世話人: ÷6 → 30a、÷5 → 36a、÷10（外部型の経過措置）→ 18a
export const SEWA_FACTOR = { 6: 30, 5: 36, 10: 18 };

const blank = (v) => v === "" || v === null || v === undefined;

// 0以上の整数 a を正の整数 b で割って切り上げ
export function ceilDiv(a, b) {
  return Math.floor((a + b - 1) / b);
}

// "12.34" → 124（0.1人単位）。小数点第2位以下は切り上げる。数でなければ null
export function parsePeopleTenths(v) {
  const s = String(v).trim();
  const m = /^(\d{1,6})(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) return null;
  const frac = m[2] || "";
  const first = frac ? Number(frac[0]) : 0;
  const rest = /[1-9]/.test(frac.slice(1)) ? 1 : 0;
  return { tenths: Number(m[1]) * 10 + first + rest, roundedUp: rest === 1 };
}

// 時間 "86.5" → 8650（0.01時間単位）。小数第3位以下・数でないものは null
export function parseHoursHundredths(v) {
  const s = String(v).trim();
  const m = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const frac = (m[2] || "").padEnd(2, "0");
  return Number(m[1]) * 100 + Number(frac);
}

// 世話人の必要数（1/1800 人単位）
export function sewaUnits(total10, divisor) {
  return total10 * SEWA_FACTOR[divisor];
}

// 生活支援員の必要数（1/1800 人単位）。区分2以下・非該当は数えない
export function shienUnits({ k3 = 0, k4 = 0, k5 = 0, k6 = 0 }) {
  return SHIEN_FACTOR.k3 * k3 + SHIEN_FACTOR.k4 * k4 + SHIEN_FACTOR.k5 * k5 + SHIEN_FACTOR.k6 * k6;
}

// サービス管理責任者（第208条第1項第3号ほか）。利用者の数は 0.1人単位
export function sabikan(total10) {
  if (total10 <= 300) return { required: 1, gap: false };
  return { required: 1 + ceilDiv(total10 - 300, 300), gap: total10 < 310 };
}

// 1/1800 人単位の値を、小数第3位以下を切り上げた小数2桁の文字列に
export function fmtPeople(units) {
  const h = ceilDiv(units, 18); // 0.01人単位
  return `${Math.floor(h / 100)}.${String(h % 100).padStart(2, "0")}`;
}

// 1/1800 人単位の値が小数2桁でちょうど表せるか（表せなければ表示は切り上げ）
export function isExactAt2(units) {
  return units % 18 === 0;
}

// 必要な週の勤務延べ時間（分・切り上げ）。fulltime は 0.01時間単位
export function requiredMinutes(units, fulltime) {
  return ceilDiv(fulltime * units, 3000);
}

export function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

// 配置している勤務延べ時間（0.01時間単位）が足りるか。1800×P ≥ W×units を整数で比べる
export function enoughHours(provided, units, fulltime) {
  return 1800 * provided >= fulltime * units;
}

// 配置している勤務延べ時間を常勤換算（0.01人単位・切り捨て）にする
export function fteHundredths(provided, fulltime) {
  return Math.floor((provided * 100) / fulltime);
}

const KUBUN_KEYS = ["k6", "k5", "k4", "k3", "kLow"];
const KUBUN_LABEL = { k6: "区分6", k5: "区分5", k4: "区分4", k3: "区分3", kLow: "区分2以下・非該当" };

export function calculate({ type, k6, k5, k4, k3, kLow, legacyGaibu, houses, fulltime, sewaHours, shienHours }) {
  const t = TYPES[type] ? type : "hokatsu";
  const input = { k6, k5, k4, k3, kLow };

  // 利用者の数（区分ごと・前年度の平均値）
  const people = { total10: 0, roundedUp: false };
  for (const k of KUBUN_KEYS) {
    if (blank(input[k])) {
      people[k] = 0;
      continue;
    }
    const r = parsePeopleTenths(input[k]);
    if (!r) return { ok: false, errors: [`${KUBUN_LABEL[k]}の利用者の数は 0 以上の数で入力してください。`] };
    people[k] = r.tenths;
    people.total10 += r.tenths;
    if (r.roundedUp) people.roundedUp = true;
  }
  if (people.total10 === 0) return { ok: false, errors: ["利用者の数を入力してください。"] };
  if (people.total10 > MAX_PEOPLE_TENTHS) return { ok: false, errors: ["利用者の数は合計 1,000 人以下で入力してください。"] };

  // 常勤の従業者が1週間に勤務すべき時間（0.01時間単位）
  let ft = 4000;
  let ftFloored = false;
  if (!blank(fulltime)) {
    const f = parseHoursHundredths(fulltime);
    if (f === null || f === 0 || f > 6000) {
      return { ok: false, errors: ["常勤の週の勤務時間は 0 より大きく 60 時間以下（小数第2位まで）で入力してください。"] };
    }
    ft = f;
  }
  if (ft < FULLTIME_FLOOR) {
    ft = FULLTIME_FLOOR;
    ftFloored = true;
  }

  // 世話人
  const legacy = t === "gaibu" && legacyGaibu === true;
  const sewaDivisor = t === "nicchu" ? 5 : legacy ? 10 : 6;
  const sewa = { divisor: sewaDivisor, units: sewaUnits(people.total10, sewaDivisor), legacy };
  sewa.minutes = requiredMinutes(sewa.units, ft);

  // 生活支援員（外部サービス利用型には無い）
  let shien = null;
  if (t !== "gaibu") {
    const parts = ["k6", "k5", "k4", "k3"].map((k) => ({
      key: k,
      label: KUBUN_LABEL[k],
      tenths: people[k],
      divisor: SHIEN_DIVISOR[k],
      units: SHIEN_FACTOR[k] * people[k],
    }));
    shien = { parts, units: shienUnits(people) };
    shien.minutes = requiredMinutes(shien.units, ft);
  }

  // サービス管理責任者
  const sabi = sabikan(people.total10);

  // 日中サービス支援型の夜間支援従事者（第213条の4第2項）
  let night = null;
  if (t === "nicchu" && !blank(houses)) {
    const s = String(houses).trim();
    if (!/^\d{1,3}$/.test(s) || Number(s) < 1 || Number(s) > MAX_HOUSES) {
      return { ok: false, errors: [`共同生活住居の数は 1〜${MAX_HOUSES} の整数で入力してください。`] };
    }
    night = { houses: Number(s), required: Number(s) };
  }

  // 配置している勤務延べ時間（週）
  const staff = { sewa: null, shien: null };
  const check = (raw, need) => {
    const p = parseHoursHundredths(raw);
    if (p === null || p > MAX_HOURS_HUNDREDTHS) return null;
    const ok = enoughHours(p, need.units, ft);
    return {
      hundredths: p,
      enough: ok,
      fte: fteHundredths(p, ft),
      shortMinutes: ok ? 0 : need.minutes - Math.floor((p * 60) / 100),
    };
  };
  if (!blank(sewaHours)) {
    staff.sewa = check(sewaHours, sewa);
    if (!staff.sewa) return { ok: false, errors: ["配置している世話人の勤務延べ時間は 0 以上の時間（小数第2位まで）で入力してください。"] };
  }
  if (!blank(shienHours) && shien) {
    staff.shien = check(shienHours, shien);
    if (!staff.shien) return { ok: false, errors: ["配置している生活支援員の勤務延べ時間は 0 以上の時間（小数第2位まで）で入力してください。"] };
  }

  return {
    ok: true,
    type: t,
    typeLabel: TYPES[t],
    people,
    fulltime: { hundredths: ft, floored: ftFloored },
    sewa,
    shien,
    sabikan: sabi,
    night,
    staff,
  };
}
