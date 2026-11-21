// 介護施設の夜勤職員の配置基準（夜勤職員基準）の計算 — 特養・老健
//
// 告示（厚労省 法令等データベース dataId=82aa0263 の原文で逐語確認・2026-11-21。附則の末尾は令和6年3月15日厚生労働省告示第86号＝2024-04-01 施行）:
//   厚生労働大臣が定める夜勤を行う職員の勤務条件に関する基準（平成12年厚生省告示第29号）
//   第一号ロ(1)(一)「a …利用者の数及び当該特別養護老人ホームの入所者の数の合計数が二十五以下の特別養護老人ホームにあっては、一以上
//     b …二十六以上六十以下…二以上 c …六十一以上八十以下…三以上 d …八十一以上百以下…四以上
//     e …百一以上…四に、…合計数が百を超えて二十五又はその端数を増すごとに一を加えて得た数以上
//     f bからeまでの規定にかかわらず、次に掲げる要件のいずれにも適合する場合は、…bからeまでの規定に基づき算出される数に
//       十分の八を乗じて得た数以上」 同 iv「…合計数が、六十以下の場合は一以上、六十一以上の場合は二以上の介護職員又は看護職員が、
//       夜勤時間帯を通じて常時配置されていること。」
//   第一号ロ(1)(二)b「…ユニット型特別養護老人ホームの入居者の数の合計数が二十又はその端数を増すごとに一以上」
//   第一号ロ(2)(一)「…ユニット型指定短期入所生活介護の利用者の数及び当該特別養護老人ホームの入所者の数の合計数が
//     二十又はその端数を増すごとに一以上」
//   第一号ロ(2)(二)「二のユニットごとに夜勤を行う看護職員又は介護職員の数が一以上であること。ただし、併設本体施設がユニット型
//     特別養護老人ホームである場合は、当該ユニットの数は併設ユニット型事業所のユニットの数及び当該ユニット型特別養護老人ホームの
//     ユニットの数の合計数を基礎として算出することとする。」
//   第五号イ（特養）: (1)(一) 従来型の短期入所を併設・(1)(三) 併設なし →「第一号ロ(1)(一)の規定を準用する。」
//     (1)(二) ユニット型の短期入所を併設 →「第一号ロ(2)(一)の規定を準用する。」
//     (2)(一) ユニット型特養が「指定短期入所生活介護事業所を併設する場合」→「第一号ロ(1)(二)bの規定を準用する。」
//     (2)(二)「(一)に規定する場合以外の場合」→「第一号ロ(2)(二)の規定を準用する。」
//     ⚠ (1)(一) は「指定短期入所生活介護事業所（ユニット型指定短期入所生活介護事業所を除く。）」と書くので、(2)(一) の
//     「指定短期入所生活介護事業所」はユニット型を含むと読める。一方で第一号ロ(2)(二)ただし書はユニット型どうしの併設を
//     ユニット数の合計で数える。どちらで読むかは文言から一意に決まらないので、両方を出し、多いほうを見出しにする。
//   第六号（老健）→ 第二号イ(1)(一)「夜勤を行う看護職員又は介護職員の数が二以上（次に掲げる要件のいずれにも適合する場合は、
//     一・六以上）であること。ただし、指定短期入所療養介護の利用者の数及び当該介護老人保健施設の入所者の数の合計数
//     （以下この号において「利用者等の数」という。）が四十以下の介護老人保健施設であって、常時、緊急時の連絡体制を整備している
//     ものにあっては、一以上であること。」 ユニット型 → 第二号イ(2)(一)「二のユニット…ごとに…一以上」
//   加算: 第五号ロ(1)(三)「…第一号ロ(1)に規定する夜勤を行う介護職員又は看護職員の数に一を加えた数以上」（ユニット型は第一号ロ(2)）
//     第二号イ(3)「(一) 利用者等の数が四十一以上の介護老人保健施設にあっては、利用者等の数が二十又はその端数を増すごとに一以上であり、
//     かつ、二を超えていること。(二) 利用者等の数が四十以下の介護老人保健施設にあっては、…かつ、一を超えていること。」
//
// 通知（老企第40号・dataId=00ta4383 の原文で逐語確認・2026-11-21）:
//   第二の1(6)②「ある月（暦月）において以下のいずれかの事態が発生した場合に、その翌月において利用者等の全員について、
//     所定単位数が減算される…イ …夜勤を行う職員数が夜勤職員基準に定める員数に満たない事態が二日以上連続して発生した場合
//     ロ …四日以上発生した場合」
//   第二の1(6)③「…利用者等の数については、(5)②を準用すること。この場合において「小数点第二位以下」とあるのは「小数点以下」と
//     読み替える」＝前年度の平均の小数点以下を切り上げる
//   第二の2(3)②「…夜勤を行う職員数による所定単位数の減算については、本体施設と一体的に行う」
//     イ「前年度の平均入所者数七〇人の指定介護老人福祉施設に前年度の平均利用者数二〇人の短期入所生活介護事業所が併設されている
//     場合は、…必要な夜勤を行う職員の数は四人」
//   第二の5(8)①「一日平均夜勤職員数は、暦月ごとに夜勤時間帯（午後十時から翌日の午前五時までの時間を含めた連続する一六時間を
//     いう。）における延夜勤時間数を、当該月の日数に一六を乗じて得た数で除することによって算定し、小数点第三位以下は切り捨てる」
//
// 誤差の向き: 人数は 0.01人単位の整数で受け、併設は合計してから小数点以下を切り上げる（本体と一体的に＝延数の合計÷日数）。
//   必要数は 0.1人単位の整数（0.8・1.6 のため）。1日平均は分単位の整数から 0.01人単位で切り捨てる（通知どおり）。

export const FACILITIES = {
  tokuyou: "特別養護老人ホーム（従来型）",
  tokuyouUnit: "ユニット型特別養護老人ホーム",
  rouken: "介護老人保健施設（従来型）",
  roukenUnit: "ユニット型介護老人保健施設",
};
export const SHORT_STAY = { none: "併設なし", normal: "従来型の短期入所生活介護を併設", unit: "ユニット型の短期入所生活介護を併設" };
export const MAX_PEOPLE = 1000;
export const MAX_UNITS = 100;

const blank = (v) => v === "" || v === null || v === undefined;

// 0以上の整数 a を正の整数 b で割って切り上げ
export function ceilDiv(a, b) {
  return Math.floor((a + b - 1) / b);
}

// "70.25" → 7025（0.01人単位）。小数第3位以下・数でないものは null
export function parseHundredths(v) {
  const m = /^(\d{1,5})(?:\.(\d{1,2}))?$/.exec(String(v).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || "").padEnd(2, "0"));
}

// 従来型の段階（第一号ロ(1)(一) a〜e）— p は整数の人数
export function tokuyouTable(p) {
  if (p <= 25) return 1;
  if (p <= 60) return 2;
  if (p <= 80) return 3;
  if (p <= 100) return 4;
  return 4 + ceilDiv(p - 100, 25);
}

// 段階の号（a〜e）
export function tableLetter(p) {
  if (p <= 25) return "a";
  if (p <= 60) return "b";
  if (p <= 80) return "c";
  if (p <= 100) return "d";
  return "e";
}

// 1日平均夜勤職員数（0.01人単位・小数点第3位以下切り捨て）
export function dailyAverageHundredths(totalMinutes, days) {
  return Math.floor((totalMinutes * 100) / (days * 16 * 60));
}

// 満たない日の並びから減算の判定（第二の1(6)②）
export function judgeShortfallDays(list) {
  const days = [...new Set(list)].sort((a, b) => a - b);
  let consecutive = null;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) { consecutive = [days[i - 1], days[i]]; break; }
  }
  return { days, consecutive, fourOrMore: days.length >= 4, reduced: consecutive !== null || days.length >= 4 };
}

function parseUnits(v, label) {
  const s = String(v).trim();
  if (!/^\d{1,3}$/.test(s) || Number(s) < 1 || Number(s) > MAX_UNITS) return { error: `${label}は 1〜${MAX_UNITS} の整数で入力してください。` };
  return { value: Number(s) };
}

export function calculate(input) {
  const f = FACILITIES[input.facility] ? input.facility : "tokuyou";
  const isTokuyou = f === "tokuyou" || f === "tokuyouUnit";
  const short = isTokuyou && SHORT_STAY[input.shortStay] ? input.shortStay : "none";

  // 入所者・短期入所の利用者（前年度の平均）
  if (blank(input.residents)) return { ok: false, errors: ["入所者の数を入力してください。"] };
  const res = parseHundredths(input.residents);
  if (res === null) return { ok: false, errors: ["入所者の数は 0 以上・小数第2位までの数で入力してください。"] };
  if (res === 0) return { ok: false, errors: ["入所者の数を入力してください。"] };
  const shortUsed = f === "rouken" || f === "roukenUnit" || short !== "none";
  let sh = 0;
  if (shortUsed && !blank(input.shortUsers)) {
    sh = parseHundredths(input.shortUsers);
    if (sh === null) return { ok: false, errors: ["短期入所の利用者の数は 0 以上・小数第2位までの数で入力してください。"] };
  }
  if (isTokuyou && short !== "none" && sh === 0) {
    return { ok: false, errors: ["併設する短期入所の利用者の数（前年度の平均）を入力してください。"] };
  }
  if (res + sh > MAX_PEOPLE * 100) return { ok: false, errors: [`人数は合計 ${MAX_PEOPLE} 人以下で入力してください。`] };
  const total100 = res + sh;
  const people = ceilDiv(total100, 100); // 小数点以下を切り上げ
  const roundedUp = total100 % 100 !== 0;

  // ユニット数
  let units = null;
  let shortUnits = null;
  if (f === "tokuyouUnit" || f === "roukenUnit") {
    if (blank(input.units)) return { ok: false, errors: ["ユニット数を入力してください。"] };
    const u = parseUnits(input.units, "ユニット数");
    if (u.error) return { ok: false, errors: [u.error] };
    units = u.value;
  }
  if (f === "tokuyouUnit" && short === "unit") {
    if (blank(input.shortUnits)) return { ok: false, errors: ["併設するユニット型の短期入所のユニット数を入力してください。"] };
    const u = parseUnits(input.shortUnits, "短期入所のユニット数");
    if (u.error) return { ok: false, errors: [u.error] };
    shortUnits = u.value;
  }

  const notes = [];
  let requiredTenths;
  let rule;
  let constant = null; // 見守り機器の緩和のときの常時配置（iv）
  let readings = null; // 一意に決まらないときの2つの読み方
  let bonusBase = null; // 加算（＋1）の基準。比べないときは null
  const mimamori = input.mimamori === true;

  if (f === "tokuyou" && short !== "unit") {
    const base = tokuyouTable(people);
    if (mimamori && people >= 26) {
      requiredTenths = base * 8;
      rule = { text: `合計 ${people}人の段階 ${base}人 × 0.8`, basis: "告示 第一号ロ(1)(一)f（第五号イで準用）" };
      constant = { count: people <= 60 ? 1 : 2, basis: "告示 第一号ロ(1)(一)f iv" };
    } else {
      requiredTenths = base * 10;
      rule = { text: `合計 ${people}人 → ${base}人`, basis: `告示 第一号ロ(1)(一)${tableLetter(people)}（第五号イで準用）` };
      if (mimamori) notes.push({ status: "info", title: "25人以下は見守り機器の緩和（0.8）の対象外です", detail: "f は「bからeまでの規定にかかわらず」と書くので、a（25人以下＝1人以上）には掛かりません。" });
      bonusBase = base;
    }
  } else if (f === "tokuyou" && short === "unit") {
    const n = ceilDiv(people, 20);
    requiredTenths = n * 10;
    rule = { text: `合計 ${people}人 ÷ 20 を切り上げ → ${n}人`, basis: "告示 第一号ロ(2)(一)（第五号イ(1)(二)で準用）" };
    if (mimamori) notes.push({ status: "info", title: "この組み合わせに見守り機器の緩和（0.8）はありません", detail: "0.8 は第一号ロ(1)(一)f（従来型の段階）にだけある規定です。" });
  } else if (f === "tokuyouUnit" && short === "none") {
    const n = ceilDiv(units, 2);
    requiredTenths = n * 10;
    rule = { text: `${units}ユニット ÷ 2 を切り上げ → ${n}人`, basis: "告示 第一号ロ(2)(二)（第五号イ(2)(二)で準用）" };
    bonusBase = n;
  } else if (f === "tokuyouUnit" && short === "normal") {
    const n = ceilDiv(people, 20);
    requiredTenths = n * 10;
    rule = { text: `合計 ${people}人 ÷ 20 を切り上げ → ${n}人`, basis: "告示 第一号ロ(1)(二)b（第五号イ(2)(一)で準用）" };
  } else if (f === "tokuyouUnit" && short === "unit") {
    const a = ceilDiv(people, 20);
    const b = ceilDiv(units + shortUnits, 2);
    readings = [
      { count: a, text: `合計 ${people}人 ÷ 20 を切り上げ → ${a}人`, basis: "告示 第五号イ(2)(一)→第一号ロ(1)(二)b" },
      { count: b, text: `${units}＋${shortUnits}＝${units + shortUnits}ユニット ÷ 2 を切り上げ → ${b}人`, basis: "告示 第一号ロ(2)(二)ただし書" },
    ];
    const n = Math.max(a, b);
    requiredTenths = n * 10;
    rule = { text: a === b ? `どちらの読み方でも ${n}人` : `2つの読み方のうち多いほう → ${n}人`, basis: "告示 第五号イ(2)・第一号ロ(2)(二)" };
  } else if (f === "rouken") {
    if (input.rouken40 === true && people <= 40) {
      requiredTenths = 10;
      rule = { text: `利用者等の数 ${people}人（40人以下）・常時の緊急時の連絡体制あり → 1人`, basis: "告示 第二号イ(1)(一)ただし書（第六号イで準用）" };
    } else if (mimamori) {
      requiredTenths = 16;
      rule = { text: "見守り機器等の要件をすべて満たす → 1.6人", basis: "告示 第二号イ(1)(一)（第六号イで準用）" };
    } else {
      requiredTenths = 20;
      rule = { text: "2人", basis: "告示 第二号イ(1)(一)（第六号イで準用）" };
    }
    if (input.rouken40 === true && people > 40) notes.push({ status: "info", title: "利用者等の数が40人を超えるので、1人の例外は使えません", detail: "第二号イ(1)(一)ただし書は「四十以下の介護老人保健施設」に限ります。" });
  } else {
    const n = ceilDiv(units, 2);
    requiredTenths = n * 10;
    rule = { text: `${units}ユニット ÷ 2 を切り上げ → ${n}人`, basis: "告示 第二号イ(2)(一)（第六号ロで準用）" };
    if (mimamori) notes.push({ status: "info", title: "ユニット型に見守り機器の緩和はありません", detail: "1.6 は第二号イ(1)(一)（従来型）にだけある規定です。" });
  }

  // 1日平均夜勤職員数
  let average = null;
  if (!blank(input.nightHours) || !blank(input.nightMinutes)) {
    const d = Number(input.days);
    if (![28, 29, 30, 31].includes(d)) return { ok: false, errors: ["月の日数は 28〜31 から選んでください。"] };
    const hs = blank(input.nightHours) ? "0" : String(input.nightHours).trim();
    const ms = blank(input.nightMinutes) ? "0" : String(input.nightMinutes).trim();
    if (!/^\d{1,5}$/.test(hs) || !/^\d{1,2}$/.test(ms) || Number(ms) > 59) {
      return { ok: false, errors: ["延夜勤時間数は「時間」を 0 以上の整数、「分」を 0〜59 の整数で入力してください。"] };
    }
    const totalMinutes = Number(hs) * 60 + Number(ms);
    if (totalMinutes > d * 16 * 60 * 100) return { ok: false, errors: ["延夜勤時間数が大きすぎます（1日平均100人を超えます）。"] };
    const avg = dailyAverageHundredths(totalMinutes, d);
    average = { hundredths: avg, totalMinutes, days: d, denominatorHours: d * 16, bonus: null };
    // 加算（見守り機器なしの「＋1」）と比べる
    if (f === "rouken" || f === "roukenUnit") {
      const per20 = ceilDiv(people, 20);
      const over = people >= 41 ? 2 : 1;
      average.bonus = {
        meets: avg >= per20 * 100 && avg > over * 100,
        text: `利用者等の数 ${people}人 ÷ 20 の切り上げ＝${per20}人以上、かつ ${over}人を超える`,
        basis: `告示 第二号イ(3)(${people >= 41 ? "一" : "二"})（第六号ハで準用）`,
      };
    } else if (bonusBase !== null) {
      average.bonus = {
        meets: avg >= (bonusBase + 1) * 100,
        text: `基準 ${bonusBase}人 ＋ 1 ＝ ${bonusBase + 1}人以上`,
        basis: `告示 第五号ロ（${f === "tokuyou" ? "第一号ロ(1)" : "第一号ロ(2)"}に一を加えた数）`,
      };
    }
  }

  // 減算（満たない日）
  let shortfall = null;
  if (!blank(input.shortfallDays)) {
    const maxDay = [28, 29, 30, 31].includes(Number(input.days)) ? Number(input.days) : 31;
    const parts = String(input.shortfallDays).split(/[\s,、，・]+/).filter((x) => x !== "");
    const list = [];
    for (const p of parts) {
      const q = p.replace(/日$/, "");
      if (!/^\d{1,2}$/.test(q) || Number(q) < 1 || Number(q) > maxDay) {
        return { ok: false, errors: [`基準に満たなかった日は 1〜${maxDay} の日付を「3, 4, 18」のように入力してください。`] };
      }
      list.push(Number(q));
    }
    shortfall = judgeShortfallDays(list);
  }

  return {
    ok: true,
    facility: f,
    facilityLabel: FACILITIES[f],
    shortStay: short,
    people: { residents100: res, short100: sh, total100, count: people, roundedUp },
    units,
    shortUnits,
    requiredTenths,
    rule,
    constant,
    readings,
    average,
    shortfall,
    notes,
  };
}
