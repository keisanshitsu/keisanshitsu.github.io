// 通所介護（デイサービス）の人員配置基準のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 省令由来の定数（15人まで・5で除す・利用定員19人未満が地域密着型・10人以下の特例）
//   (2) 通知の式: 15人まで 平均提供時間数、16人以上 （（利用者数−15）÷5＋1）×平均提供時間数。丸めない
//   (3) 通知の計算例（18人・5時間 → 1.6 → 8時間）と別表2の56通り（5〜20人×3〜9時間）
//   (4) 平均提供時間数＝利用者ごとの提供時間数の合計÷利用者数（時間の違う利用者を混ぜる）
//   (5) 常時1人: 少なくとも単位の提供時間帯の長さ。式の値と大きいほう
//   (6) 生活相談員: 単位の時間帯の和（重なりは1回・すき間は除く）。通知の2つの例（8時間・9時間）
//   (7) 配置の判定（ちょうどは足りる・1分不足・常時1人に届かない）と、切り上げの向き
//   (8) 通所介護と地域密着型の境（18人・19人）と、定員10人以下の特例（10人・11人）
//   (9) 入力の検証（時刻・提供時間・人数・定員超過・提供時間が時間帯より長い・空欄の単位）
//   (10) 本文の条文引用が calc.js の定数と食い違わないこと

import { readFileSync } from "node:fs";
import {
  UP_TO,
  STEP,
  CHIIKI_LIMIT,
  SMALL_CAPACITY,
  parseTime,
  parseHours,
  unionMinutes,
  requiredMinutes,
  coefTenths,
  ceilFrac,
  calculate,
  fmtMin,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected: JSON.stringify(expected),
  actual: JSON.stringify(actual),
});

// 1単位・同じ提供時間の利用者 n 人
const one = (n, hours, extra = {}) => ({
  capacity: extra.capacity ?? 30,
  units: [{ start: extra.start ?? "08:00", end: extra.end ?? "18:00", groups: [{ hours: String(hours), count: String(n) }], care: extra.care ?? "" }],
  counselor: extra.counselor ?? "",
});
const req = (n, hours, extra) => calculate(one(n, hours, extra)).units[0];

export default function cases() {
  const t = [];

  // ── (1) 定数 ─────────────────────────
  t.push(eq("15人までは1以上（第93条第1項第3号）", UP_TO, 15));
  t.push(eq("15人を超える部分を5で除す（同）", STEP, 5));
  t.push(eq("利用定員19人未満が地域密着型（施行規則 第10条の2「十九人とする」）", CHIIKI_LIMIT, 19));
  t.push(eq("利用定員10人以下の特例（第20条第2項）", SMALL_CAPACITY, 10));

  // ── (2) 式と掛ける数 ─────────────────────────
  t.push(eq("15人の掛ける数は1.0", coefTenths(15), 10));
  t.push(eq("16人の掛ける数は1.2（(16−15)÷5＋1）", coefTenths(16), 12));
  t.push(eq("18人の掛ける数は1.6", coefTenths(18), 16));
  t.push(eq("20人の掛ける数は2.0", coefTenths(20), 20));
  t.push(eq("1人の掛ける数は1.0", coefTenths(1), 10));
  t.push(eq("40人の掛ける数は6.0（(40−15)÷5＋1）", coefTenths(40), 60));
  t.push(eq("15人までは Σ÷n（分数のまま）", requiredMinutes(15, 15 * 420), { num: 6300, den: 15 }));
  t.push(eq("16人以上は (n−10)×Σ÷(5n)", requiredMinutes(16, 16 * 420), { num: 6 * 16 * 420, den: 80 }));
  t.push(eq("分数の切り上げ: 7÷2 → 4", ceilFrac({ num: 7, den: 2 }), 4));
  t.push(eq("分数の切り上げ: 割り切れれば そのまま 8", ceilFrac({ num: 16, den: 2 }), 8));

  // ── (3) 通知の計算例と別表2 ─────────────────────────
  t.push(eq("通知の例: 18人・5時間 → 8時間（480分）", req(18, 5).requiredCeil, 480));
  t.push(eq("通知の例は割り切れる", req(18, 5).exact, true));
  t.push(eq("山口県の例: 20人・8時間 → 16時間", req(20, 8).requiredCeil, 960));
  t.push(eq("市川市の例: 18人・8時間 → 12.8時間（768分）", req(18, 8).requiredCeil, 768));
  const TABLE2 = {
    5: [3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
    10: [3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
    15: [3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
    16: [3.6, 4.8, 6.0, 7.2, 8.4, 9.6, 10.8],
    17: [4.2, 5.6, 7.0, 8.4, 9.8, 11.2, 12.6],
    18: [4.8, 6.4, 8.0, 9.6, 11.2, 12.8, 14.4],
    19: [5.4, 7.2, 9.0, 10.8, 12.6, 14.4, 16.2],
    20: [6.0, 8.0, 10.0, 12.0, 14.0, 16.0, 18.0],
  };
  let tableOk = 0, tableBad = [];
  for (const [n, row] of Object.entries(TABLE2)) {
    row.forEach((hoursExpected, i) => {
      const h = 3 + i;
      const u = req(Number(n), h);
      const expectedMin = Math.round(hoursExpected * 60);
      if (u.requiredCeil === expectedMin && u.exact) tableOk++;
      else tableBad.push(`${n}人${h}時間: ${u.requiredCeil}分≠${expectedMin}分`);
    });
  }
  t.push(eq("別表2の56通り（5・10・15〜20人 × 3〜9時間）がすべて一致", [tableOk, tableBad], [56, []]));
  t.push(eq("別表2: 15人→16人で 7時間 が 8.4時間 に跳ぶ（境界）", [req(15, 7).requiredCeil, req(16, 7).requiredCeil], [420, 504]));

  // ── (4) 平均提供時間数 ─────────────────────────
  const mixed = calculate({ capacity: 25, units: [{ start: "09:00", end: "16:00", groups: [{ hours: "7", count: "12" }, { hours: "5", count: "6" }] }] });
  const mu = mixed.units[0];
  t.push(eq("7時間12人＋5時間6人: 合計 6,840分・18人", [mu.sumMinutes, mu.users], [6840, 18]));
  t.push(eq("平均提供時間数 380分（6時間20分）", mu.avgCeil, 380));
  t.push(eq("平均提供時間数は分数のまま 6,840÷18", mu.avg, { num: 6840, den: 18 }));
  const zeroRow = calculate({ capacity: 25, units: [{ start: "09:00", end: "14:00", groups: [{ hours: "5", count: "18" }, { hours: "", count: "0" }] }] });
  t.push(eq("人数0の行は提供時間が空でも無視する（18人で計算）", zeroRow.ok && zeroRow.units[0].users, 18));
  t.push(eq("18人なので1.6倍の608分（10時間08分）", mu.requiredCeil, 608));
  t.push(eq("提供時間帯7時間は608分より短いので、少なくとも608分", [mu.span, mu.atLeast, mu.spanGoverns], [420, 608, false]));
  // 平均が割り切れない: 300分×3人＋301分×1人 → 平均 300.25分 → 表示は301分（切り上げ）
  const odd = calculate({ capacity: 30, units: [{ start: "09:00", end: "15:00", groups: [{ hours: String(301 / 60), count: "1" }, { hours: "5", count: "3" }] }] });
  t.push(eq("300分×3＋301分×1 → 平均 300.25分 → 表示 301分（300分にしない）", [odd.units[0].avgCeil, odd.units[0].requiredCeil], [301, 301]));
  t.push(eq("1分単位にならない提供時間はエラー（5.01時間＝300.6分）", calculate(one(4, "5.01")).ok, false));
  const odd2 = calculate({ capacity: 30, units: [{ start: "09:00", end: "15:00", groups: [{ hours: "5", count: "3" }, { hours: "5.25", count: "1" }] }] });
  t.push(eq("300分×3＋315分×1 → 平均 303.75分 → 表示 304分（切り上げ）", [odd2.units[0].avgCeil, odd2.units[0].requiredCeil, odd2.units[0].exact], [304, 304, false]));
  const odd3 = calculate({ capacity: 30, units: [{ start: "08:00", end: "18:00", groups: [{ hours: "7", count: "16" }, { hours: "7.25", count: "1" }] }] });
  // Σ=16×420＋435＝7,155分・17人 → 7×7155÷85＝589.235… → 590分
  t.push(eq("17人・Σ7,155分 → 589.23…分 → 表示590分（切り上げ）", [odd3.units[0].requiredCeil, odd3.units[0].exact], [590, false]));

  // ── (5) 常時1人 ─────────────────────────
  const span = req(10, 7, { start: "09:00", end: "16:15" });
  t.push(eq("10人・7時間・時間帯7時間15分: 式は420分、常時1人には435分", [span.requiredCeil, span.atLeast, span.spanGoverns], [420, 435, true]));
  const notSpan = req(18, 5, { start: "09:00", end: "14:00" });
  t.push(eq("18人・5時間・時間帯5時間: 式480分が時間帯300分より大きい", [notSpan.atLeast, notSpan.spanGoverns], [480, false]));
  const equal = req(10, 7, { start: "09:00", end: "16:00" });
  t.push(eq("式と時間帯がちょうど同じ（420分）は時間帯が決めるとはしない", [equal.atLeast, equal.spanGoverns], [420, false]));

  // ── (6) 生活相談員 ─────────────────────────
  t.push(eq("区間の和: 9:00〜12:00 と 13:00〜18:00 → 480分（通知の例・すき間を除く）", unionMinutes([[540, 720], [780, 1080]]), 480));
  t.push(eq("区間の和: 9:00〜14:00 と 13:00〜18:00 → 540分（現行の写しの例・重なりは1回）", unionMinutes([[540, 840], [780, 1080]]), 540));
  t.push(eq("区間の和: 接する区間 9:00〜12:00 と 12:00〜15:00 → 360分", unionMinutes([[540, 720], [720, 900]]), 360));
  t.push(eq("区間の和: 含まれる区間 9:00〜17:00 と 10:00〜12:00 → 480分", unionMinutes([[540, 1020], [600, 720]]), 480));
  t.push(eq("区間の和: 順不同でも同じ", unionMinutes([[780, 1080], [540, 720]]), 480));
  t.push(eq("区間の和: 空なら0", unionMinutes([]), 0));
  const two = calculate({
    capacity: 20,
    units: [
      { start: "09:00", end: "12:00", groups: [{ hours: "3", count: "20" }] },
      { start: "13:00", end: "18:00", groups: [{ hours: "5", count: "16" }] },
    ],
    counselor: "8",
  });
  t.push(eq("2単位: 単位1 20人×3時間 → 2.0倍 360分、単位2 16人×5時間 → 1.2倍 360分", two.units.map((u) => u.requiredCeil), [360, 360]));
  t.push(eq("2単位: 午前と午後の利用者は合算しない（単位ごとの利用者数）", two.units.map((u) => u.users), [20, 16]));
  t.push(eq("2単位: 生活相談員は480分、8時間で足りる", [two.counselor.required, two.counselor.enough], [480, true]));
  t.push(eq("2単位: すき間があるだけで重なりは無い", two.overlapping, false));
  const ov = calculate({
    capacity: 30,
    units: [
      { start: "09:00", end: "14:00", groups: [{ hours: "5", count: "10" }] },
      { start: "13:00", end: "18:00", groups: [{ hours: "5", count: "10" }] },
    ],
    counselor: "8.95",
  });
  t.push(eq("重なる2単位: 生活相談員は540分、537分（8.95時間）では足りない", [ov.counselor.required, ov.counselor.minutes, ov.counselor.enough], [540, 537, false]));
  t.push(eq("重なる2単位: overlapping", ov.overlapping, true));
  t.push(eq("生活相談員の欄が空なら判定しない", calculate(one(18, 5)).counselor.enough, null));
  t.push(eq("生活相談員: ちょうど（10時間＝時間帯）は足りる", calculate(one(18, 5, { counselor: "10" })).counselor.enough, true));

  // ── (7) 配置の判定 ─────────────────────────
  const ok8 = req(18, 5, { start: "09:00", end: "14:00", care: "8" });
  t.push(eq("通知の例: 8時間ちょうどは足りる・時間帯5時間も満たす", [ok8.staff.enoughFormula, ok8.staff.coversSpan], [true, true]));
  t.push(eq("1分単位にならない勤務延時間はエラー（7.33時間）", calculate(one(18, 5, { care: "7.33" })).ok, false));
  const short1 = calculate(one(18, 5, { start: "09:00", end: "14:00", care: "7.95" })).units[0];
  t.push(eq("7.95時間（477分）は3分不足", [short1.staff.enoughFormula, short1.staff.shortFormula], [false, 3]));
  const f589 = calculate({ capacity: 30, units: [{ start: "08:00", end: "18:00", groups: [{ hours: "7", count: "16" }, { hours: "7.25", count: "1" }], care: String(589 / 60) }] });
  t.push(eq("必要 589.23…分に 589分は足りない（丸めずに比べる）", f589.ok && f589.units[0].staff.enoughFormula, false));
  const f590 = calculate({ capacity: 30, units: [{ start: "08:00", end: "18:00", groups: [{ hours: "7", count: "16" }, { hours: "7.25", count: "1" }], care: String(590 / 60) }] });
  t.push(eq("必要 589.23…分に 590分は足りる", f590.ok && f590.units[0].staff.enoughFormula, true));
  const gap = req(10, 7, { start: "09:00", end: "16:15", care: "7.1" });
  t.push(eq("式420分は満たすが時間帯435分に届かない（426分）", [gap.staff.enoughFormula, gap.staff.coversSpan], [true, false]));
  const fit = req(10, 7, { start: "09:00", end: "16:15", care: "7.25" });
  t.push(eq("勤務延時間が時間帯ちょうど（435分）なら常時1人の下限を満たす", [fit.staff.enoughFormula, fit.staff.coversSpan], [true, true]));
  t.push(eq("勤務延時間0は受け付けて不足と判定", req(5, 3, { care: "0" }).staff.enoughFormula, false));
  t.push(eq("勤務延時間が空なら判定しない", req(18, 5).staff, null));
  t.push(eq("勤務延時間 200時間は受け付ける", calculate(one(18, 5, { care: "200" })).ok, true));
  t.push(eq("勤務延時間 200.25時間はエラー", calculate(one(18, 5, { care: "200.25" })).ok, false));
  t.push(eq("勤務延時間に文字はエラー", calculate(one(18, 5, { care: "abc" })).ok, false));

  // ── (8) 通所介護と地域密着型・定員10人以下 ─────────────────────────
  t.push(eq("利用定員19人は通所介護（第93条）", [calculate(one(10, 7, { capacity: 19 })).service, calculate(one(10, 7, { capacity: 19 })).article], ["tsusho", "指定居宅サービス等基準 第93条"]));
  t.push(eq("利用定員18人は地域密着型（第20条）", [calculate(one(10, 7, { capacity: 18 })).service, calculate(one(10, 7, { capacity: 18 })).article], ["chiiki", "指定地域密着型サービス基準 第20条"]));
  t.push(eq("利用定員10人は特例あり", calculate(one(10, 7, { capacity: 10 })).small, true));
  t.push(eq("利用定員11人は特例なし（その日の利用者が10人以下でも）", calculate(one(8, 7, { capacity: 11 })).small, false));
  t.push(eq("利用定員30人（通所介護）は特例なし", calculate(one(8, 7, { capacity: 30 })).small, false));
  t.push(eq("特例でも時間は平均提供時間数（10人・7.25時間 → 435分）", req(10, 7.25, { capacity: 10 }).requiredCeil, 435));
  t.push(eq("地域密着型18人・18人利用でも式は同じ（1.6倍）", req(18, 5, { capacity: 18 }).requiredCeil, 480));

  // ── (9) 入力の検証 ─────────────────────────
  t.push(eq("時刻: 9:00 → 540", parseTime("9:00"), 540));
  t.push(eq("時刻: 09:05 → 545", parseTime("09:05"), 545));
  t.push(eq("時刻: 24:00 → 1440", parseTime("24:00"), 1440));
  t.push(eq("時刻: 24:01 は不正", parseTime("24:01"), null));
  t.push(eq("時刻: 9:60 は不正", parseTime("9:60"), null));
  t.push(eq("時刻: 900 は不正", parseTime("900"), null));
  t.push(eq("時間: 7.25 → 435分", parseHours("7.25"), 435));
  t.push(eq("時間: 空欄は undefined", parseHours(""), undefined));
  t.push(eq("時間: 負は不正", parseHours("-1"), null));
  t.push(eq("時間: 7.33 は1分単位にならず不正（439.8分）", parseHours("7.33"), null));
  t.push(eq("時間: 5.1 は306分", parseHours("5.1"), 306));
  t.push(eq("利用定員が空ならエラー", calculate({ ...one(10, 7), capacity: "" }).ok, false));
  t.push(eq("利用定員0はエラー", calculate(one(10, 7, { capacity: 0 })).ok, false));
  t.push(eq("利用定員301はエラー", calculate(one(10, 7, { capacity: 301 })).ok, false));
  t.push(eq("利用定員に小数はエラー", calculate(one(10, 7, { capacity: "18.5" })).ok, false));
  t.push(eq("利用定員300は受け付ける", calculate(one(10, 7, { capacity: 300 })).ok, true));
  t.push(eq("利用者が利用定員を超えるとエラー（19人／定員18人）", calculate(one(19, 5, { capacity: 18 })).ok, false));
  t.push(eq("利用者が利用定員ちょうどは受け付ける（18人／定員18人）", calculate(one(18, 5, { capacity: 18 })).ok, true));
  t.push(eq("提供時間が単位の時間帯より長いとエラー（6時間／9:00〜14:00）", calculate(one(10, 6, { start: "09:00", end: "14:00" })).ok, false));
  t.push(eq("提供時間が時間帯ちょうどは受け付ける（5時間／9:00〜14:00）", calculate(one(10, 5, { start: "09:00", end: "14:00" })).ok, true));
  t.push(eq("終了が開始より前はエラー", calculate(one(10, 5, { start: "14:00", end: "09:00" })).ok, false));
  t.push(eq("終了と開始が同じは「終了は開始より後」のエラー", /終了は開始より後/.test(calculate(one(10, 5, { start: "09:00", end: "09:00" })).errors?.[0] ?? ""), true));
  t.push(eq("時刻が空でエラー", calculate(one(10, 5, { start: "", end: "14:00" })).ok, false));
  t.push(eq("提供時間0はエラー", calculate(one(10, 0)).ok, false));
  t.push(eq("提供時間が空（人数あり）はエラー", calculate(one(10, "")).ok, false));
  t.push(eq("人数に小数はエラー", calculate(one("10.5", 5)).ok, false));
  t.push(eq("人数が負はエラー", calculate(one("-1", 5)).ok, false));
  t.push(eq("人数0の行は無視し、利用者0ならエラー", calculate(one(0, 5)).ok, false));
  t.push(eq("単位が全部空ならエラー", calculate({ capacity: 20, units: [{}, {}] }).ok, false));
  t.push(eq("単位2が空なら単位1だけで計算", calculate({ capacity: 20, units: [one(18, 5).units[0], { start: "", end: "", groups: [{ hours: "", count: "" }] }] }).units.length, 1));
  t.push(eq("単位2の時刻だけ入れて利用者が空ならエラー", calculate({ capacity: 20, units: [one(18, 5).units[0], { start: "13:00", end: "16:00", groups: [] }] }).ok, false));
  t.push(eq("単位は3つまで（4つ目は無視）", calculate({ capacity: 50, units: [one(5, 3).units[0], one(5, 3).units[0], one(5, 3).units[0], one(5, 3).units[0]] }).units.length, 3));
  t.push(eq("生活相談員の欄に文字はエラー", calculate(one(18, 5, { counselor: "x" })).ok, false));
  t.push(eq("表示: 608分 → 10時間08分", fmtMin(608), "10時間08分"));
  t.push(eq("表示: 480分 → 8時間00分", fmtMin(480), "8時間00分"));

  // ── (10) 本文の条文引用と定数 ─────────────────────────
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const s of [
    "十五人までの場合にあっては一以上、十五人を超える場合にあっては十五人を超える部分の数を五で除して得た数に一を加えた数以上",
    "常時一人以上当該指定通所介護に従事させなければならない",
    "平均提供時間数（利用者ごとの提供時間数の合計を利用者数で除して得た数）とする",
    "５×1.6＝８時間の勤務延時間数分の人員配置が必要となる",
    "サービス提供開始時刻から終了時刻まで（サービスが提供されていない時間帯を除く。）",
    "生活相談員又は介護職員のうち一人以上は、常勤でなければならない",
    "十人以下である場合にあっては",
    "法第八条第七項の厚生労働省令で定める数は、十九人とする",
    "常時１名以上が確保されるよう配置を行う必要がある",
  ]) t.push(eq(`本文に条文・通知の逐語「${s.slice(0, 30)}…」がある`, html.includes(s), true));
  t.push(eq("本文の FAQ の数値（10時間08分・8時間24分・6時間20分）が計算と一致",
    [html.includes(fmtMin(mu.requiredCeil)), html.includes(fmtMin(req(16, 7).requiredCeil)), html.includes(fmtMin(mu.avgCeil))], [true, true, true]));

  return t;
}
