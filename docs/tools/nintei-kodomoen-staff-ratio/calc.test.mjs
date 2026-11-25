// 認定こども園（幼保連携型）の職員配置基準のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 省令由来の定数（3・6・15・25、経過措置の 20・30、常時2人、学級30人・既存の園は35人、期限）
//   (2) 国の算式の順序: 年齢区分ごとに小数点第1位まで「切り捨て」→ 合計 → 小数点以下「四捨五入」
//   (3) 1歳と2歳、4歳と5歳は合わせてから割る
//   (4) 堺市の計算例2つ（新基準 13人・旧基準 12人、保育教諭は12人中8人以上）
//   (5) 備考三: 3歳以上の値が学級数を下るときは学級数。丸める前の値で比べる
//   (6) 備考四: 園長が専任でないときは表の員数に＋1 してから常時2人と比べる
//   (7) 常時2人・附則第9条の3分の1・第5条第2項の学級数の3分の1
//   (8) 学級数の空欄（学年ごとの最少学級数で計算）と、学級数の入力の検証
//   (9) 新基準・経過措置の切り替えと配置人数の判定
//   (10) 本文の条文引用が calc.js の定数と食い違わないこと

import { readFileSync } from "node:fs";
import {
  RATIO,
  MIN_STAFF,
  AGE3_TRANSITION_UNTIL,
  CLASS_SIZE,
  CLASS_TRANSITION_UNTIL,
  tenthsFloor,
  roundHalfUpTenths,
  minClasses,
  compute,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected: JSON.stringify(expected),
  actual: JSON.stringify(actual),
});

// 堺市「設備運営基準及び公定価格の職員配置について」の例（新基準 25:1・15:1）
const SAKAI1 = { age0: 8, age1: 18, age2: 20, age3: 24, age4: 25, age5: 25 };
// 堺市「幼保連携型認定こども園の職員配置に係る特例」（令和7年度・旧基準 30:1・20:1）の例
const SAKAI2 = { age0: 8, age1: 20, age2: 22, age3: 22, age4: 24, age5: 24 };

export default function cases() {
  const t = [];

  // ── (1) 定数 ─────────────────────────
  t.push(eq("満1歳未満 3人につき1人（第5条第3項の表 第四号）", RATIO.infant, 3));
  t.push(eq("満1歳以上満3歳未満 6人につき1人（同 第三号）", RATIO.toddler, 6));
  t.push(eq("満3歳 15人につき1人（同 第二号・令和6年4月から）", RATIO.age3New, 15));
  t.push(eq("満4歳以上 25人につき1人（同 第一号・令和6年4月から）", RATIO.age4New, 25));
  t.push(eq("満3歳の経過措置 20人につき1人（令和6年同令第1号 附則第3項・改正前の表）", RATIO.age3Old, 20));
  t.push(eq("満4歳以上の経過措置 30人につき1人（同 附則第2項・改正前の表）", RATIO.age4Old, 30));
  t.push(eq("常時2人を下らない（第5条第3項ただし書）", MIN_STAFF, 2));
  t.push(eq("満3歳の経過措置は令和10年3月31日まで", AGE3_TRANSITION_UNTIL, "2028-03-31"));
  t.push(eq("1学級30人以下（第4条第2項）・既存の園は35人（令和8年同令第2号 附則第2項）", CLASS_SIZE, { new: 30, old: 35 }));
  t.push(eq("1学級35人の経過措置は令和14年3月31日まで", CLASS_TRANSITION_UNTIL, "2032-03-31"));

  // ── (2) 小数点第1位までの切り捨てと四捨五入 ─────────────────────────
  t.push(eq("0歳8人÷3＝2.666… は 2.6（2.7 にしない）", tenthsFloor(8, 3), 26));
  t.push(eq("1・2歳38人÷6＝6.333… は 6.3", tenthsFloor(38, 6), 63));
  t.push(eq("3歳24人÷15＝1.6", tenthsFloor(24, 15), 16));
  t.push(eq("4歳以上48人÷25＝1.92 は 1.9", tenthsFloor(48, 25), 19));
  t.push(eq("0人は 0", tenthsFloor(0, 25), 0));
  t.push(eq("合計 12.5 は四捨五入で 13", roundHalfUpTenths(125), 13));
  t.push(eq("合計 12.4 は 12（切り上げない）", roundHalfUpTenths(124), 12));
  t.push(eq("合計 12.3 は 12", roundHalfUpTenths(123), 12));

  // ── (4) 堺市の計算例 ─────────────────────────
  // 例1: 0歳8→2.6、1・2歳38→6.3、3歳24→1.6、4・5歳50→2.0 → 12.5 → 13人（堺市「= 13」）
  const s1 = calculate(SAKAI1);
  t.push(eq("堺市の例1・新基準: 区分ごとの値 2.6/6.3/1.6/2.0", s1.newRule.rows.map((r) => r.tenths), [26, 63, 16, 20]));
  t.push(eq("堺市の例1・新基準: 合計 12.5 → 13人", [s1.newRule.totalTenths, s1.newRule.required], [125, 13]));
  t.push(eq("堺市の例1: 学級数の空欄は学年ごとに 1＋1＋1＝3学級と仮定", [s1.classes.count, s1.classes.assumed], [3, true]));
  t.push(eq("堺市の例1: 3歳以上の値 3.6 は学級数 3 を下らない（置き換えない）", [s1.newRule.upperTenths, s1.newRule.raisedToClasses], [36, false]));
  // 例2（旧基準）: 0歳8→2.6、1・2歳42→7.0、3歳22÷20→1.1、4・5歳48÷30→1.6 → 12.3 → 12人（堺市「１２人」）
  // 堺市の例は学級数に触れていない。12人になるのは満3歳以上が2学級以下のとき（当時の1学級35人なら70人で2学級も可）。
  // 学年ごとに3学級なら備考三で 2.7 → 3.0 に置き換わり 12.6 → 13人（下のテストで固定）
  const s2 = calculate({ ...SAKAI2, classes: 2 });
  t.push(eq("堺市の例2・経過措置: 区分ごとの値 2.6/7.0/1.1/1.6", s2.oldRule.rows.map((r) => r.tenths), [26, 70, 11, 16]));
  t.push(eq("堺市の例2・経過措置・2学級: 合計 12.3 → 12人", [s2.oldRule.totalTenths, s2.oldRule.required], [123, 12]));
  const s2by = calculate({ ...SAKAI2, classLimit: "old" });
  t.push(eq("堺市の例2・経過措置・学年ごとに3学級（空欄）: 2.7 → 3.0 に置き換わり 12.6 → 13人",
    [s2by.classes.count, s2by.oldRule.upperTenths, s2by.oldRule.upperUsedTenths, s2by.oldRule.required], [3, 27, 30, 13]));
  t.push(eq("堺市の例2・新基準・3学級: 3.3 は 3 を下らず 12.9 → 13人", [s2by.newRule.raisedToClasses, s2by.newRule.required], [false, 13]));
  // 新基準なら 3歳22÷15→1.4、4・5歳48÷25→1.9 → 12.9 → 13人
  t.push(eq("堺市の例2・新基準: 12.9 → 13人", [s2.newRule.totalTenths, s2.newRule.required], [129, 13]));
  // 堺市「保育教諭の比率１２人中８人（６７％）【保育教諭３分の２以上】」「１２人中６人…基準違反」
  t.push(eq("堺市の例2・経過措置: 代えられるのは 4人まで・保育教諭等は 8人以上", [s2.oldRule.substituteMax, s2.oldRule.qualifiedMin], [4, 8]));

  // ── (2') 各区分を四捨五入しない ─────────────────────────
  // 0歳2（0.6・四捨五入なら0.7）＋1歳17（2.8）→ 3.4 → 3人。区分ごとに四捨五入すると 3.5 → 4人
  t.push(eq("区分ごとに四捨五入しない（0歳2・1歳17 → 3.4 → 3人）", calculate({ age0: 2, age1: 17 }).selected.required, 3));

  // ── (3) 1・2歳、4・5歳は合わせてから割る ─────────────────────────
  // 0歳6（2.0）・1歳1・2歳2（合わせて3÷6＝0.5。別々だと0.1＋0.3＝0.4）→ 2.5 → 3人（別々なら 2.4 → 2人）
  const g12 = calculate({ age0: 6, age1: 1, age2: 2 });
  t.push(eq("1歳と2歳を合わせる: 1・2歳児の区分は 3人", g12.groups.toddler, 3));
  t.push(eq("1歳と2歳を合わせる: 2.5 → 3人（別々なら 2.4 → 2人）", [g12.selected.totalTenths, g12.selected.required], [25, 3]));
  // 0歳7（2.3）・1歳1（0.1）・4歳14・5歳14（合わせて28÷25＝1.1。別々だと0.5＋0.5＝1.0）・1学級
  // → 3.5 → 4人（別々なら 3.4 → 3人）
  const g45 = calculate({ age0: 7, age1: 1, age4: 14, age5: 14, classes: 1 });
  t.push(eq("4歳と5歳を合わせる: 4歳以上の区分は 28人", g45.groups.age4plus, 28));
  t.push(eq("4歳と5歳を合わせる: 3.5 → 4人（別々なら 3.4 → 3人）", [g45.selected.totalTenths, g45.selected.required], [35, 4]));

  // ── (5) 備考三（学級数を下るとき） ─────────────────────────
  // 3歳10（0.6）・4歳10・5歳10（20÷25＝0.8）→ 1.4。3学級なら 3.0 に置き換え
  // ＋0歳3（1.0）・1歳6・2歳6（2.0）→ 6.0 → 6人（置き換えなければ 4.4 → 4人）
  const small = { age0: 3, age1: 6, age2: 6, age3: 10, age4: 10, age5: 10 };
  const k3 = calculate({ ...small, classes: 3 });
  t.push(eq("備考三: 3歳以上の値 1.4 ＜ 3学級 → 3.0 に置き換え", [k3.selected.upperTenths, k3.selected.upperUsedTenths, k3.selected.raisedToClasses], [14, 30, true]));
  t.push(eq("備考三: 合計 6.0 → 6人", [k3.selected.totalTenths, k3.selected.required], [60, 6]));
  t.push(eq("備考三: 学級数が空欄でも学年ごとの 3学級で同じ 6人", calculate(small).selected.required, 6));
  t.push(eq("備考三: 1学級なら置き換えず 4.4 → 4人", calculate({ ...small, classes: 1 }).selected.required, 4));
  t.push(eq("備考三: ちょうど学級数と同じ値は置き換えない（3歳15・4歳以上25 → 1.0＋1.0＝2.0、2学級）",
    calculate({ age3: 15, age4: 25, classes: 2 }).selected.raisedToClasses, false));
  // 丸める前の値で比べる: 3歳15（1.0）・4歳20・5歳20（40÷25＝1.6）→ 2.6 ＜ 3学級 → 3.0
  //   ＋1歳5（5÷6＝0.8）→ 3.8 → 4人。丸めてから比べる（round(2.6)＝3 は 3 を下らない）と 2.6＋0.8＝3.4 → 3人
  const pre = calculate({ age1: 5, age3: 15, age4: 20, age5: 20, classes: 3 });
  t.push(eq("備考三は丸める前の値で比べる: 2.6 ＜ 3 → 3.0、合計 3.8 → 4人", [pre.selected.upperUsedTenths, pre.selected.required], [30, 4]));
  t.push(eq("備考三は経過措置にも効く（small・3学級・旧基準 → 3.0＋3.0＝6人）", calculate({ ...small, classes: 3 }).oldRule.required, 6));
  t.push(eq("備考三は満3歳未満の値を置き換えない（0・1・2歳の値はそのまま）", k3.selected.rows.slice(0, 2).map((r) => r.tenths), [10, 20]));

  // ── (6) 備考四（園長が専任でない） ─────────────────────────
  t.push(eq("備考四: 堺市の例1で園長が専任でない → 13＋1＝14人", calculate({ ...SAKAI1, principal: "not" }).selected.required, 14));
  t.push(eq("備考四: 専任なら加えない", calculate({ ...SAKAI1, principal: "full" }).selected.principalAdd, 0));
  // 0歳3人だけ: 表の員数 1.0 → 1人。専任でなければ 1＋1＝2人（2人に足して3人にしない）
  const p1 = calculate({ age0: 3, principal: "not" });
  t.push(eq("備考四: 表の員数1人＋1＝2人（常時2人に足して3人にしない）", [p1.selected.tableCount, p1.selected.required, p1.selected.raisedToMin], [1, 2, false]));
  const p1f = calculate({ age0: 3 });
  t.push(eq("同じ園で園長が専任なら表の員数1人を常時2人に引き上げ", [p1f.selected.required, p1f.selected.raisedToMin], [2, true]));
  t.push(eq("備考四は新基準・経過措置の両方に効く", (() => { const r = calculate({ ...SAKAI2, classes: 2, principal: "not" }); return [r.newRule.required, r.oldRule.required]; })(), [14, 13]));

  // ── (7) 常時2人・3分の1 ─────────────────────────
  const tiny = calculate({ age0: 1 });
  t.push(eq("0歳1人: 算式は 0.3 → 0人 → 常時2人", [tiny.selected.tableCount, tiny.selected.required, tiny.selected.raisedToMin], [0, 2, true]));
  t.push(eq("0歳6人: 算式がちょうど2人なら引き上げではない", calculate({ age0: 6 }).selected.raisedToMin, false));
  t.push(eq("附則第9条: 必要13人 → 代えられるのは4人・保育教諭等は9人以上", [s1.newRule.substituteMax, s1.newRule.qualifiedMin], [4, 9]));
  t.push(eq("附則第9条: 必要2人 → 代えられるのは0人", [tiny.selected.substituteMax, tiny.selected.qualifiedMin], [0, 2]));
  t.push(eq("附則第9条: 必要3人 → 1人（3×1＝3 は 3 を超えない）", compute({ infant: 9, toddler: 0, age3: 0, age4plus: 0 }).substituteMax, 1));
  t.push(eq("附則第9条: 必要5人 → 1人（3×2＝6 は 5 を超える）", compute({ infant: 15, toddler: 0, age3: 0, age4plus: 0 }).substituteMax, 1));
  t.push(eq("第5条第2項: 3学級なら助保育教諭・講師で代えられる学級担任は1学級まで", s1.classes.assistantMax, 1));
  t.push(eq("第5条第2項: 2学級なら0学級", calculate({ ...small, classes: 2 }).classes.assistantMax, 0));
  t.push(eq("第5条第2項: 6学級なら2学級", calculate({ age3: 60, age4: 60, age5: 60, classes: 6 }).classes.assistantMax, 2));

  // ── (8) 学級数 ─────────────────────────
  t.push(eq("学年ごとの最少学級数: 3歳31・4歳30・5歳0（30人）→ 2＋1＋0＝3", minClasses(31, 30, 0, 30), 3));
  t.push(eq("学年ごとの最少学級数: 同じ人数で35人なら 1＋1＝2", minClasses(31, 30, 0, 35), 2));
  t.push(eq("学年ごとの最少学級数: 35人ちょうどは1学級・36人は2学級", [minClasses(35, 0, 0, 35), minClasses(36, 0, 0, 35)], [1, 2]));
  t.push(eq("学級の上限 old を選ぶと仮定の学級数も35人で数える",
    calculate({ age3: 31, age4: 30, classLimit: "old" }).classes.count, 2));
  t.push(eq("満3歳以上の園児がいなければ学級数は 0（空欄のとき）", calculate({ age0: 6, age1: 6 }).classes.count, 0));
  t.push(eq("満3歳以上0人・学級数0 は受け付ける", calculate({ age0: 6, classes: 0 }).ok, true));
  t.push(eq("満3歳以上0人で学級数1 はエラー", calculate({ age0: 6, classes: 1 }).ok, false));
  t.push(eq("満3歳以上がいるのに学級数0 はエラー（第4条第1項）", calculate({ age3: 10, classes: 0 }).ok, false));
  t.push(eq("学級数が満3歳以上の園児数より多いとエラー", calculate({ age3: 2, classes: 3 }).ok, false));
  t.push(eq("学級数＝満3歳以上の園児数は受け付ける", calculate({ age3: 2, classes: 2 }).ok, true));
  t.push(eq("学級数の小数はエラー", calculate({ age3: 20, classes: 1.5 }).ok, false));
  t.push(eq("学級数 101 はエラー", calculate({ age3: 1000, classes: 101 }).ok, false));
  t.push(eq("平均でも1学級30人を超える（61人・2学級）", calculate({ age3: 31, age4: 30, classes: 2 }).classes.overLimit, true));
  t.push(eq("ちょうど30人×2学級＝60人は超えない", calculate({ age3: 30, age4: 30, classes: 2 }).classes.overLimit, false));
  t.push(eq("35人の経過措置なら61人・2学級は超えない", calculate({ age3: 31, age4: 30, classes: 2, classLimit: "old" }).classes.overLimit, false));
  t.push(eq("入力した学級数が学年ごとの最少より少ないことを示す（3学年に2学級）", calculate({ ...small, classes: 2 }).classes.belowByAge, true));
  t.push(eq("学級数が空欄なら belowByAge は false", calculate(small).classes.belowByAge, false));

  // ── (9) 新基準・経過措置の切り替えと判定 ─────────────────────────
  t.push(eq("既定は新基準", [s2.rule, s2.selected.required], [{ age3: "new", age4: "new" }, 13]));
  // 3歳だけ経過措置: 2.6＋7.0＋1.1＋1.9＝12.6 → 13人。4歳以上だけ経過措置: 2.6＋7.0＋1.4＋1.6＝12.6 → 13人
  t.push(eq("3歳だけ経過措置: 12.6", calculate({ ...SAKAI2, classes: 2, age3Rule: "old" }).selected.totalTenths, 126));
  t.push(eq("4歳以上だけ経過措置: 12.6", calculate({ ...SAKAI2, classes: 2, age4Rule: "old" }).selected.totalTenths, 126));
  t.push(eq("両方経過措置・2学級: 12人", calculate({ ...SAKAI2, classes: 2, age3Rule: "old", age4Rule: "old" }).selected.required, 12));
  t.push(eq("3歳の比率は選択どおり（old → 20）", calculate({ ...SAKAI2, age3Rule: "old" }).selected.rows[2].ratio, 20));
  t.push(eq("配置13人・必要13人は足りる", calculate({ ...SAKAI1, staff: "13" }).staff.enough, true));
  t.push(eq("配置12.9人は足りない・不足0.1人", (() => { const s = calculate({ ...SAKAI1, staff: "12.9" }).staff; return [s.enough, s.shortfall]; })(), [false, 0.1]));
  t.push(eq("配置12人の不足は1人", calculate({ ...SAKAI1, staff: 12 }).staff.shortfall, 1));
  t.push(eq("両方経過措置・2学級なら堺市の例2は12人で足りる", calculate({ ...SAKAI2, classes: 2, age3Rule: "old", age4Rule: "old", staff: 12 }).staff.enough, true));
  t.push(eq("両方経過措置でも学年ごとの3学級なら12人では1人足りない", calculate({ ...SAKAI2, age3Rule: "old", age4Rule: "old", staff: 12 }).staff.shortfall, 1));
  t.push(eq("配置人数が空欄なら判定しない", calculate(SAKAI1).staff, null));
  t.push(eq("配置人数が負はエラー", calculate({ ...SAKAI1, staff: -1 }).ok, false));
  t.push(eq("配置人数が数でないとエラー", calculate({ ...SAKAI1, staff: "abc" }).ok, false));
  t.push(eq("配置人数 0.01人単位はエラー", calculate({ ...SAKAI1, staff: "12.95" }).ok, false));
  t.push(eq("配置人数 1,000.1人はエラー", calculate({ ...SAKAI1, staff: "1000.1" }).ok, false));

  // ── 入力の検証 ─────────────────────────
  t.push(eq("空欄の年齢は 0 人", calculate({ age0: 6, age1: "" }).groups.toddler, 0));
  t.push(eq("全部空ならエラー", calculate({}).ok, false));
  t.push(eq("全部 0 ならエラー", calculate({ age0: 0, age3: 0 }).ok, false));
  t.push(eq("小数の人数はエラー", calculate({ age0: 1.5 }).ok, false));
  t.push(eq("負の人数はエラー", calculate({ age0: -1 }).ok, false));
  t.push(eq("1,001人はエラー", calculate({ age5: 1001 }).ok, false));
  t.push(eq("1,000人は受け付ける（4歳以上1000÷25＝40.0・34学級 → 40人）", calculate({ age5: 1000 }).selected.required, 40));
  t.push(eq("合計人数", s1.totalChildren, 120));
  t.push(eq("満3歳以上の人数", s1.upperChildren, 74));

  // ── (10) 本文の条文引用と定数 ─────────────────────────
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const s of [
    "おおむね二十五人につき一人", "おおむね十五人につき一人", "おおむね六人につき一人", "おおむね三人につき一人",
    "常時二人を下ってはならない", "当該学級数に相当する数を当該員数とする", "原則としてこの表に定める員数を一人増加する",
    "一学級の園児数は、三十人以下を原則とする", "令和十四年三月三十一日", "令和十年三月三十一日",
    "三分の一を超えてはならない", "認定こども園の場合は施設全体（１号～３号）の子どもの数を基に計算",
  ]) t.push(eq(`本文に条文・FAQの逐語「${s}」がある`, html.includes(s), true));
  t.push(eq("本文の経過措置の期限（2028年3月31日・2032年3月31日）が定数と一致",
    [html.includes("2028年3月31日"), html.includes("2032年3月31日")], [true, true]));

  return t;
}
