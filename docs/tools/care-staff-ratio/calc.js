// 介護施設の人員配置基準の計算（特養・老健・介護付き有料老人ホーム等）
//
// 条文（e-Gov 法令API v2 の現行版で逐語確認・2026-11-07。3省令とも未施行の版は無い）:
//   指定介護老人福祉施設の人員、設備及び運営に関する基準（平成11年厚生省令第39号）第2条
//     （411M50000100039_20250401_506M60000100164）
//     第1項第3号イ「介護職員及び看護職員の総数は、常勤換算方法で、入所者の数が三又はその端数を増すごとに一以上」
//     同ロ「（１）入所者の数が三十を超えない…一以上（２）三十を超えて五十を超えない…二以上
//       （３）五十を超えて百三十を超えない…三以上（４）百三十を超える…三に、入所者の数が百三十を超えて
//       五十又はその端数を増すごとに一を加えて得た数以上」
//     第1項第2号 生活相談員「入所者の数が百又はその端数を増すごとに一以上」
//     第1項第6号 介護支援専門員「一以上（入所者の数が百又はその端数を増すごとに一を標準とする。）」
//     第2項「前項の入所者の数は、前年度の平均値とする。ただし、新規に指定を受ける場合は、推定数による。」
//     第47条第2項（ユニット型）「一 昼間については、ユニットごとに常時一人以上の介護職員又は看護職員を配置すること。
//       二 夜間及び深夜については、二ユニットごとに一人以上の介護職員又は看護職員を…配置すること。」
//   介護老人保健施設の人員、施設及び設備並びに運営に関する基準（平成11年厚生省令第40号）第2条
//     （411M50000100040_20240401_506M60000100016）
//     第1項第3号「常勤換算方法で、入所者の数が三又はその端数を増すごとに一以上（看護職員の員数は看護・介護職員の
//       総数の七分の二程度を、介護職員の員数は看護・介護職員の総数の七分の五程度をそれぞれ標準とする。）」
//     第1号 医師・第5号 理学療法士等「常勤換算方法で、入所者の数を百で除して得た数以上」
//     第4号 支援相談員「一以上（入所者の数が百を超える場合にあっては、常勤の支援相談員一名に加え、
//       常勤換算方法で、百を超える部分を百で除して得た数以上。）」
//     第48条第2項（ユニット型）は特養 第47条第2項と同文
//   指定居宅サービス等の事業の人員、設備及び運営に関する基準（平成11年厚生省令第37号）第175条
//     （411M50000100037_20250401_506M60000100164）
//     第1項第2号イ「看護職員及び介護職員の合計数は、常勤換算方法で、要介護者である利用者の数が三又はその端数を
//       増すごとに一以上」 ロ「（１）利用者の数が三十を超えない…一以上（２）三十を超える…一に利用者の数が三十を
//       超えて五十又はその端数を増すごとに一を加えて得た数以上」
//     第2項（介護予防と一体的に運営）第2号イ「利用者の数及び介護予防サービスの利用者の数に十分の三を乗じて得た数の
//       合計数が三又はその端数を増すごとに一以上」 ロ は総利用者数で同じ段階
//     第9項「次に掲げる要件のいずれにも適合する場合における第一項第二号イ及び第二項第二号イの規定の適用については、
//       これらの規定中「一」とあるのは、「〇・九」とする。」
//
// 入所者の数の端数（厚労省の解釈通知。厚労省 法令等データベースの原文で確認）:
//   老企第43号（特養）・老企第44号（老健）・老企第25号 第二の2(5)①（特定施設）
//   「当該前年度の入所者延数を当該前年度の日数で除して得た数とする。この算定に当たっては、
//    小数点第二位以下を切り上げるものとする。」
//
// 誤差の向き: 人数は 0.1人単位の整数で持つ。2桁以上の小数が入ったら第二位以下を切り上げる（必要数が少なく出ない側）。
//   「三又はその端数を増すごとに一」は整数の切り上げ割り算。介護予防の 3/10 は 0.01人単位の整数で掛けてから割る。
//   老健の看護職員は省令が「程度を標準とする」としか書かないので、判定せず目安だけ出す。

export const FACILITIES = {
  tokuyou: "特別養護老人ホーム（指定介護老人福祉施設）",
  rouken: "介護老人保健施設（老健）",
  tokutei: "介護付き有料老人ホーム等（指定特定施設入居者生活介護）",
};
export const MAX_PEOPLE_TENTHS = 10000; // 1,000人
export const MAX_STAFF_TENTHS = 10000; // 1,000人
export const MAX_UNITS = 100;

const blank = (v) => v === "" || v === null || v === undefined;

// 0以上の整数 a を正の整数 b で割って切り上げ
export function ceilDiv(a, b) {
  return Math.floor((a + b - 1) / b);
}

// "78.31" → 784（0.1人単位）。小数点第二位以下は切り上げる。数でなければ null
export function parsePeopleTenths(v) {
  const s = String(v).trim();
  const m = /^(\d{1,6})(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) return null;
  const frac = m[2] || "";
  const first = frac ? Number(frac[0]) : 0;
  const rest = /[1-9]/.test(frac.slice(1)) ? 1 : 0;
  return { tenths: Number(m[1]) * 10 + first + rest, roundedUp: rest === 1 };
}

// 常勤換算の人数（0.1人単位まで）。2桁以上の小数・数でないものは null
export function parseStaffTenths(v) {
  const s = String(v).trim();
  const m = /^(\d{1,6})(?:\.(\d))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 10 + (m[2] ? Number(m[2]) : 0);
}

// 「三又はその端数を増すごとに一」— n は 0.1人単位
export function perThree(n10) {
  return ceilDiv(n10, 30);
}

// 「百又はその端数を増すごとに一」— n は 0.1人単位
export function perHundred(n10) {
  return ceilDiv(n10, 1000);
}

// 特養の看護職員（第2条第1項第3号ロ）— n は 0.1人単位
export function tokuyouNurse(n10) {
  if (n10 <= 300) return 1;
  if (n10 <= 500) return 2;
  if (n10 <= 1300) return 3;
  return 3 + ceilDiv(n10 - 1300, 500);
}

// 特定施設の看護職員（第175条第1項第2号ロ・第2項第2号ロ）— 利用者の数（総利用者数）は 0.1人単位
export function tokuteiNurse(n10) {
  if (n10 <= 300) return 1;
  return 1 + ceilDiv(n10 - 300, 500);
}

// 特定施設の看護・介護職員の「三又はその端数」の数（第175条第2項第2号イ）
// 要介護 care10 と 介護予防 support10（どちらも 0.1人単位）。3/10 を掛けるため 0.01人単位で計算する
export function tokuteiPerThree(care10, support10) {
  return ceilDiv(care10 * 10 + support10 * 3, 300);
}

// 0.001人単位の値を文字列に（末尾の0は落とす）
export function fmtThousandths(x) {
  const i = Math.floor(x / 1000);
  const f = String(x % 1000).padStart(3, "0").replace(/0+$/, "");
  return f ? `${i}.${f}` : String(i);
}

const t1 = (tenths) => (tenths / 10).toFixed(1);

function otherStaff(facility, n10, clause) {
  if (facility === "tokuyou") {
    return [
      { label: "生活相談員", value: `${perHundred(n10)}人以上（常勤）`, basis: "第2条第1項第2号・第5項" },
      { label: "介護支援専門員", value: `1人以上（標準 ${perHundred(n10)}人）`, basis: "第2条第1項第6号" },
      { label: "医師", value: "健康管理と療養上の指導に必要な数", basis: "第2条第1項第1号" },
      { label: "栄養士又は管理栄養士", value: "1人以上（入所定員40人以下で置かない例外あり）", basis: "第2条第1項第4号" },
      { label: "機能訓練指導員", value: "1人以上（他の職務と兼務可）", basis: "第2条第1項第5号・第8項" },
    ];
  }
  if (facility === "rouken") {
    const per100 = n10; // 入所者の数÷100 を 0.001人単位で表すと n10 そのもの
    return [
      { label: "医師", value: `常勤換算 ${fmtThousandths(per100)}人以上`, basis: "第2条第1項第1号" },
      {
        label: "支援相談員",
        value: n10 <= 1000 ? "1人以上" : `常勤1人＋常勤換算 ${fmtThousandths(n10 - 1000)}人以上`,
        basis: "第2条第1項第4号",
      },
      { label: "理学療法士・作業療法士・言語聴覚士", value: `常勤換算 ${fmtThousandths(per100)}人以上`, basis: "第2条第1項第5号" },
      { label: "介護支援専門員", value: `1人以上（標準 ${perHundred(n10)}人）`, basis: "第2条第1項第7号" },
      { label: "栄養士又は管理栄養士", value: "入所定員100人以上なら1人以上", basis: "第2条第1項第6号" },
    ];
  }
  // 要支援と一体的に運営する場合は第2項（生活相談員・計画作成担当者は総利用者数で数える）
  return [
    { label: "生活相談員", value: `常勤換算 ${perHundred(n10)}人以上（1人以上は常勤）`, basis: `${clause}第1号・第4項` },
    { label: "計画作成担当者（介護支援専門員）", value: `1人以上（標準 ${perHundred(n10)}人）`, basis: `${clause}第4号` },
    { label: "機能訓練指導員", value: "1人以上（他の職務と兼務可）", basis: `${clause}第3号・第6項` },
  ];
}

export function calculate({ facility, residents, careUsers, supportUsers, relaxed, units, staffTotal, staffNurse }) {
  const f = FACILITIES[facility] ? facility : "tokuyou";
  const errors = [];
  let people;

  if (f === "tokutei") {
    const care = blank(careUsers) ? { tenths: 0, roundedUp: false } : parsePeopleTenths(careUsers);
    const sup = blank(supportUsers) ? { tenths: 0, roundedUp: false } : parsePeopleTenths(supportUsers);
    if (!care) errors.push("要介護の利用者の数は 0 以上の数で入力してください。");
    if (!sup) errors.push("要支援（介護予防）の利用者の数は 0 以上の数で入力してください。");
    if (errors.length) return { ok: false, errors };
    const total10 = care.tenths + sup.tenths;
    if (total10 === 0) return { ok: false, errors: ["利用者の数を入力してください。"] };
    if (total10 > MAX_PEOPLE_TENTHS) return { ok: false, errors: ["利用者の数は合計 1,000 人以下で入力してください。"] };
    people = {
      care10: care.tenths,
      support10: sup.tenths,
      total10,
      roundedUp: care.roundedUp || sup.roundedUp,
      clause: sup.tenths > 0 ? "第175条第2項" : "第175条第1項",
    };
  } else {
    if (blank(residents)) return { ok: false, errors: ["入所者の数を入力してください。"] };
    const r = parsePeopleTenths(residents);
    if (!r) return { ok: false, errors: ["入所者の数は 0 以上の数で入力してください。"] };
    if (r.tenths === 0) return { ok: false, errors: ["入所者の数を入力してください。"] };
    if (r.tenths > MAX_PEOPLE_TENTHS) return { ok: false, errors: ["入所者の数は 1,000 人以下で入力してください。"] };
    people = { total10: r.tenths, roundedUp: r.roundedUp, clause: "第2条" };
  }

  // 看護・介護職員の総数（常勤換算）
  const isRelaxed = f === "tokutei" && relaxed === true;
  const perThreeCount = f === "tokutei" ? tokuteiPerThree(people.care10, people.support10) : perThree(people.total10);
  const careNurse = {
    perThree: perThreeCount,
    requiredTenths: perThreeCount * (isRelaxed ? 9 : 10),
    relaxed: isRelaxed,
  };

  // 看護職員
  let nurse;
  if (f === "tokuyou") nurse = { required: tokuyouNurse(people.total10) };
  else if (f === "tokutei") nurse = { required: tokuteiNurse(people.total10) };
  else {
    // 老健: 総数の 2/7 程度を標準（0.1人単位で四捨五入した目安。介護職員は残り）
    const guideTenths = Math.floor((perThreeCount * 40 + 7) / 14);
    nurse = { required: null, guideTenths, careGuideTenths: perThreeCount * 10 - guideTenths };
  }

  // ユニット型（特養 第47条第2項・老健 第48条第2項）
  let unit = null;
  if (f !== "tokutei" && !blank(units)) {
    const s = String(units).trim();
    if (!/^\d{1,3}$/.test(s) || Number(s) < 1 || Number(s) > MAX_UNITS) {
      return { ok: false, errors: [`ユニット数は 1〜${MAX_UNITS} の整数で入力してください。`] };
    }
    const u = Number(s);
    unit = { units: u, day: u, night: ceilDiv(u, 2) };
  }

  // 配置している人数（常勤換算）
  let staff = null;
  if (!blank(staffTotal) || !blank(staffNurse)) {
    const tot = blank(staffTotal) ? null : parseStaffTenths(staffTotal);
    const nur = blank(staffNurse) ? null : parseStaffTenths(staffNurse);
    if ((!blank(staffTotal) && tot === null) || (!blank(staffNurse) && nur === null)) {
      return { ok: false, errors: ["配置している人数（常勤換算）は 0 以上・0.1人単位で入力してください。"] };
    }
    if ((tot !== null && tot > MAX_STAFF_TENTHS) || (nur !== null && nur > MAX_STAFF_TENTHS)) {
      return { ok: false, errors: ["配置している人数は 1,000 人以下で入力してください。"] };
    }
    if (tot !== null && nur !== null && nur > tot) {
      return { ok: false, errors: ["看護職員の数は、看護・介護職員の総数以下で入力してください（総数は看護職員を含みます）。"] };
    }
    staff = { total: null, nurse: null };
    if (tot !== null) {
      const need = careNurse.requiredTenths;
      staff.total = { tenths: tot, enough: tot >= need, shortfallTenths: tot >= need ? 0 : need - tot };
    }
    if (nur !== null) {
      if (nurse.required === null) {
        staff.nurse = { tenths: nur, enough: null, shortfallTenths: null };
      } else {
        const need = nurse.required * 10;
        staff.nurse = { tenths: nur, enough: nur >= need, shortfallTenths: nur >= need ? 0 : need - nur };
      }
    }
  }

  return {
    ok: true,
    facility: f,
    facilityLabel: FACILITIES[f],
    people,
    careNurse,
    nurse,
    others: otherStaff(f, people.total10, people.clause),
    unit,
    staff,
    text: { requiredTotal: t1(careNurse.requiredTenths) },
  };
}
