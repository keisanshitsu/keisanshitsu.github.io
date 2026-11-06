// 保育士の配置基準のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 省令由来の定数（3・6・15・25、経過措置の 20・30、最低2人）
//   (2) 国の算式の順序: 年齢区分ごとに小数点第1位まで「切り捨て」→ 合計 → 小数点以下「四捨五入」
//       （各区分を四捨五入しない・合計を切り上げない）
//   (3) 1歳と2歳、4歳と5歳は合わせてから割る（別々に切り捨てると少なく出る）
//   (4) 算式が2人未満なら省令ただし書の2人
//   (5) 新基準・経過措置の切り替えと、配置人数の判定（ちょうどは足りる・0.1人少ないと不足）
//   (6) 入力の検証

import {
  RATIO,
  MIN_STAFF,
  AGE3_TRANSITION_UNTIL,
  tenthsFloor,
  roundHalfUpTenths,
  compute,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

const P60 = { age0: 6, age1: 10, age2: 12, age3: 12, age4: 10, age5: 10 };
const P90 = { age0: 9, age1: 15, age2: 18, age3: 16, age4: 16, age5: 16 };

export default function cases() {
  const t = [];

  // ── (1) 定数 ─────────────────────────
  t.push(eq("乳児 3人につき1人（第33条第2項）", RATIO.infant, 3));
  t.push(eq("1・2歳児 6人につき1人（同）", RATIO.toddler, 6));
  t.push(eq("3歳児 15人につき1人（同・令和6年4月から）", RATIO.age3New, 15));
  t.push(eq("4歳以上児 25人につき1人（同・令和6年4月から）", RATIO.age4New, 25));
  t.push(eq("3歳児の経過措置 20人につき1人（令和6年内閣府令第18号 附則第2項）", RATIO.age3Old, 20));
  t.push(eq("4歳以上児の経過措置 30人につき1人（同 附則第3項）", RATIO.age4Old, 30));
  t.push(eq("保育所一につき2人を下らない（第33条第2項ただし書）", MIN_STAFF, 2));
  t.push(eq("3歳の経過措置は令和10年3月31日まで", AGE3_TRANSITION_UNTIL, "2028-03-31"));

  // ── (2) 小数点第1位までの切り捨てと四捨五入 ─────────────────────────
  t.push(eq("乳児2人÷3＝0.666… は 0.6（0.7 にしない）", tenthsFloor(2, 3), 6));
  t.push(eq("乳児9人÷3＝3.0（割り切れるときはそのまま）", tenthsFloor(9, 3), 30));
  t.push(eq("1・2歳児22人÷6＝3.666… は 3.6", tenthsFloor(22, 6), 36));
  t.push(eq("3歳児15人÷15＝1.0", tenthsFloor(15, 15), 10));
  t.push(eq("4歳以上児32人÷30＝1.066… は 1.0", tenthsFloor(32, 30), 10));
  t.push(eq("0人は 0", tenthsFloor(0, 6), 0));
  t.push(eq("合計 2.5 は四捨五入で 3", roundHalfUpTenths(25), 3));
  t.push(eq("合計 2.4 は四捨五入で 2", roundHalfUpTenths(24), 2));
  t.push(eq("合計 7.2 は 7（切り上げて 8 にしない）", roundHalfUpTenths(72), 7));
  t.push(eq("合計 7.5 は 8", roundHalfUpTenths(75), 8));

  // 定員60人の例（手計算）: 乳児6÷3＝2.0、1・2歳22÷6＝3.6、3歳12÷15＝0.8、4歳以上20÷25＝0.8 → 7.2 → 7人
  const r60 = calculate(P60);
  t.push(eq("定員60人の例・新基準: 区分ごとの値 2.0/3.6/0.8/0.8", r60.newRule.rows.map((r) => r.tenths), [20, 36, 8, 8]));
  t.push(eq("定員60人の例・新基準: 合計 7.2 → 7人", [r60.newRule.totalTenths, r60.newRule.required], [72, 7]));
  // 経過措置: 3歳12÷20＝0.6、4歳以上20÷30＝0.666… → 0.6 → 合計 6.8 → 7人
  t.push(eq("定員60人の例・経過措置: 合計 6.8 → 7人", [r60.oldRule.totalTenths, r60.oldRule.required], [68, 7]));

  // 定員90人の例: 乳児9→3.0、1・2歳33→5.5、3歳16→新1.0／旧0.8、4歳以上32→新1.2／旧1.0
  const r90 = calculate(P90);
  t.push(eq("定員90人の例・新基準: 10.7 → 11人", [r90.newRule.totalTenths, r90.newRule.required], [107, 11]));
  t.push(eq("定員90人の例・経過措置: 10.3 → 10人", [r90.oldRule.totalTenths, r90.oldRule.required], [103, 10]));

  // 各区分を四捨五入すると多く出る例: 乳児2（0.6・四捨五入なら0.7）＋1歳17（28.33…→2.8）
  // 国の算式 0.6＋2.8＝3.4 → 3人。区分ごとに四捨五入すると 0.7＋2.8＝3.5 → 4人
  t.push(eq("区分ごとに四捨五入しない（乳児2・1歳17 → 3.4 → 3人）",
    calculate({ age0: 2, age1: 17 }).selected.required, 3));

  // ── (3) 1・2歳、4・5歳は合わせてから割る ─────────────────────────
  // 乳児6（2.0）・1歳1・2歳1（合わせて2÷6＝0.3。別々だと0.1＋0.1＝0.2）・3歳3（3÷15＝0.2）
  // 国の算式 2.0＋0.3＋0.2＝2.5 → 3人。別々に切り捨てると 2.4 → 2人
  const g12 = calculate({ age0: 6, age1: 1, age2: 1, age3: 3 });
  t.push(eq("1歳と2歳を合わせる: 1・2歳児の区分は 2人", g12.groups.toddler, 2));
  t.push(eq("1歳と2歳を合わせる: 2.5 → 3人（別々なら 2.4 → 2人）", [g12.selected.totalTenths, g12.selected.required], [25, 3]));
  // 乳児7（23）・1歳1（1）・4歳14・5歳14（合わせて28÷25＝1.1。別々だと0.5＋0.5＝1.0）
  // 国の算式 2.3＋0.1＋1.1＝3.5 → 4人。別々に切り捨てると 3.4 → 3人
  const g45 = calculate({ age0: 7, age1: 1, age4: 14, age5: 14 });
  t.push(eq("4歳と5歳を合わせる: 4歳以上児の区分は 28人", g45.groups.age4plus, 28));
  t.push(eq("4歳と5歳を合わせる: 3.5 → 4人（別々なら 3.4 → 3人）", [g45.selected.totalTenths, g45.selected.required], [35, 4]));

  // ── (4) 最低2人 ─────────────────────────
  const tiny = calculate({ age0: 1 });
  t.push(eq("乳児1人: 算式は 0.3 → 0人", tiny.selected.rounded, 0));
  t.push(eq("乳児1人: 省令ただし書で 2人", tiny.selected.required, 2));
  t.push(eq("乳児1人: 2人に引き上げたことを示す", tiny.selected.raisedToMin, true));
  t.push(eq("乳児6人: 算式がちょうど2人なら引き上げではない", calculate({ age0: 6 }).selected.raisedToMin, false));
  t.push(eq("4歳以上30人・経過措置: 1.0 → 1人 → 2人",
    calculate({ age5: 30, age4Rule: "old" }).selected.required, 2));

  // ── (5) 新基準・経過措置の切り替えと判定 ─────────────────────────
  t.push(eq("既定は新基準（3歳15・4歳以上25）", [r90.rule, r90.selected.required], [{ age3: "new", age4: "new" }, 11]));
  t.push(eq("3歳だけ経過措置: 3.0＋5.5＋0.8＋1.2＝10.5 → 11人",
    calculate({ ...P90, age3Rule: "old" }).selected.totalTenths, 105));
  t.push(eq("4歳以上だけ経過措置: 3.0＋5.5＋1.0＋1.0＝10.5 → 11人",
    calculate({ ...P90, age4Rule: "old" }).selected.required, 11));
  t.push(eq("両方経過措置: 10人", calculate({ ...P90, age3Rule: "old", age4Rule: "old" }).selected.required, 10));
  t.push(eq("3歳の比率は選択どおり（old → 20）", calculate({ ...P90, age3Rule: "old" }).selected.rows[2].ratio, 20));
  t.push(eq("compute で 4歳以上 new → 25", compute({ infant: 0, toddler: 0, age3: 0, age4plus: 50 }).rows[3].ratio, 25));

  t.push(eq("配置11人・必要11人は足りる", calculate({ ...P90, staff: 11 }).staff.enough, true));
  t.push(eq("配置10.9人は足りない", calculate({ ...P90, staff: 10.9 }).staff.enough, false));
  t.push(eq("配置10.9人の不足は 0.1人", calculate({ ...P90, staff: 10.9 }).staff.shortfall, 0.1));
  t.push(eq("配置10人の不足は 1人", calculate({ ...P90, staff: 10 }).staff.shortfall, 1));
  t.push(eq("両方経過措置なら 10人で足りる", calculate({ ...P90, age3Rule: "old", age4Rule: "old", staff: 10 }).staff.enough, true));
  t.push(eq("最低2人の園で配置1人は不足", calculate({ age0: 1, staff: 1 }).staff.enough, false));
  t.push(eq("配置人数が空欄なら判定しない", calculate(P90).staff, null));

  // ── (6) 入力の検証 ─────────────────────────
  t.push(eq("空欄の年齢は 0 人", calculate({ age0: 6, age1: "" }).groups.toddler, 0));
  t.push(eq("全部空ならエラー", calculate({}).ok, false));
  t.push(eq("全部 0 ならエラー", calculate({ age0: 0, age1: 0 }).ok, false));
  t.push(eq("小数の人数はエラー", calculate({ age0: 1.5 }).ok, false));
  t.push(eq("負の人数はエラー", calculate({ age0: -1 }).ok, false));
  t.push(eq("1,001人はエラー", calculate({ age5: 1001 }).ok, false));
  t.push(eq("1,000人は受け付ける（4歳以上1000÷25＝40.0 → 40人）", calculate({ age5: 1000 }).selected.required, 40));
  t.push(eq("配置人数が負はエラー", calculate({ age0: 6, staff: -1 }).ok, false));
  t.push(eq("配置人数が数でないとエラー", calculate({ age0: 6, staff: "abc" }).ok, false));
  t.push(eq("合計人数", calculate(P60).totalChildren, 60));

  return t;
}
