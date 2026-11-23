// 小規模保育・家庭的保育・事業所内保育の配置基準のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 省令由来の定数（3・6・15・25、経過措置の 20・30、家庭的保育者 3人・補助者と5人、保育所型の最低2人）
//   (2) 国の算式の順序: 年齢区分ごとに小数点第1位まで「切り捨て」→ 合計 → 小数点以下「四捨五入」→ そのあとで「＋1」
//   (3) 1歳と2歳、4歳と5歳は合わせてから割る
//   (4) B型・小規模型事業所内の保育士は、必要保育従事者数の半分を四捨五入（＝切り上げ。5人なら3人）
//   (5) 保育所型事業所内は＋1なし・最低2人。A型は最低人数なし
//   (6) 附則第6条（合計数1）・附則第9条（3分の2はちょうどで足りる。看護師等のみなしも除く）
//   (7) C型・家庭的保育: 家庭的保育者だけなら3人ごと、補助者と組めば5人まで。補助者は家庭的保育者の数までしか効かない
//   (8) 利用定員の範囲の注意と、入力の検証

import {
  RATIO,
  KATEI_SOLO,
  KATEI_WITH_ASSIST,
  NURSERY_MIN,
  AGE3_TRANSITION_UNTIL,
  TYPES,
  tenthsFloor,
  roundHalfUpTenths,
  halfRoundUp,
  kateiCapacity,
  kateiNeed,
  kateiOptions,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

// 京都市の例（0歳3人・1・2歳10人）: 1.0＋1.6＝2.6 → 3 → ＋1＝4人
const KYOTO = { age0: 3, age1: 5, age2: 5 };

export default function cases() {
  const t = [];

  // ── (1) 定数 ─────────────────────────
  t.push(eq("乳児 3人につき1人（第29条第2項第1号）", RATIO.infant, 3));
  t.push(eq("1・2歳児 6人につき1人（同第2号）", RATIO.toddler, 6));
  t.push(eq("3歳児 15人につき1人（同第3号）", RATIO.age3New, 15));
  t.push(eq("4歳以上児 25人につき1人（同第4号）", RATIO.age4New, 25));
  t.push(eq("3歳児の経過措置 20人（令和6年内閣府令第18号 附則第2項）", RATIO.age3Old, 20));
  t.push(eq("4歳以上児の経過措置 30人（同 附則第3項）", RATIO.age4Old, 30));
  t.push(eq("3歳の経過措置は令和10年3月31日まで", AGE3_TRANSITION_UNTIL, "2028-03-31"));
  t.push(eq("家庭的保育者1人で3人以下（第23条第3項・第34条第2項）", KATEI_SOLO, 3));
  t.push(eq("補助者とともに5人以下（同ただし書）", KATEI_WITH_ASSIST, 5));
  t.push(eq("保育所型事業所内は最低2人（第44条第2項ただし書）", NURSERY_MIN, 2));
  t.push(eq("A型は＋1・最低人数なし", [TYPES.A.plusOne, TYPES.A.minStaff], [true, 0]));
  t.push(eq("保育所型事業所内は＋1なし・最低2人", [TYPES.jigyoNursery.plusOne, TYPES.jigyoNursery.minStaff], [false, 2]));
  t.push(eq("小規模型事業所内は B型と同じ（＋1・半数）", [TYPES.jigyoSmall.plusOne, TYPES.jigyoSmall.half], [true, true]));
  t.push(eq("C型の利用定員 6〜10人（第35条）", TYPES.C.capacity, [6, 10]));

  // ── (2) 国の算式と＋1 ─────────────────────────
  t.push(eq("乳児2人÷3＝0.666… は 0.6", tenthsFloor(2, 3), 6));
  t.push(eq("1・2歳児10人÷6＝1.666… は 1.6", tenthsFloor(10, 6), 16));
  t.push(eq("合計 2.5 は四捨五入で 3", roundHalfUpTenths(25), 3));
  t.push(eq("合計 2.4 は四捨五入で 2", roundHalfUpTenths(24), 2));
  const ky = calculate({ type: "A", ...KYOTO });
  t.push(eq("京都市の例・A型: 区分ごと 1.0/1.6", ky.selected.rows.map((r) => r.tenths).slice(0, 2), [10, 16]));
  t.push(eq("京都市の例・A型: 2.6 → 3 → ＋1＝4人", [ky.selected.totalTenths, ky.selected.rounded, ky.selected.required], [26, 3, 4]));
  t.push(eq("京都市の例・A型: 保育士は全員（4人）", ky.selected.hoikushiRequired, 4));
  t.push(eq("2.5（乳児6・1・2歳3）→ 3 → A型4人",
    calculate({ type: "A", age0: 6, age1: 3 }).selected.required, 4));
  t.push(eq("2.4（乳児4・1・2歳7）→ 2 → A型3人（切り上げて4にしない）",
    calculate({ type: "A", age0: 4, age2: 7 }).selected.required, 3));
  const one = calculate({ type: "A", age0: 1 });
  t.push(eq("乳児1人: 0.3 → 0 → A型は＋1で1人（最低2人の定めは無い）", [one.selected.rounded, one.selected.required, one.selected.raisedToMin], [0, 1, false]));

  // ── (3) 1・2歳、4・5歳は合わせてから割る ─────────────────────────
  // 乳児6（2.0）・1歳1・2歳1（合わせて 0.3。別々なら 0.2）・3歳3（0.2）→ 2.5 → 3 → 4人（別々なら 2.4 → 2 → 3人）
  const g12 = calculate({ type: "A", age0: 6, age1: 1, age2: 1, age3: 3 });
  t.push(eq("1歳と2歳を合わせる: 1・2歳児の区分は2人", g12.groups.toddler, 2));
  t.push(eq("1歳と2歳を合わせる: 2.5 → A型4人（別々なら3人）", [g12.selected.totalTenths, g12.selected.required], [25, 4]));
  const g45 = calculate({ type: "jigyoNursery", age0: 7, age1: 1, age4: 14, age5: 14 });
  t.push(eq("4歳と5歳を合わせる: 2.3＋0.1＋1.1＝3.5 → 保育所型4人（別々なら3人）", [g45.groups.age4plus, g45.selected.totalTenths, g45.selected.required], [28, 35, 4]));

  // 経過措置: 乳児3（1.0）・1・2歳6（1.0）・3歳9（新 0.6／旧 0.4）→ 新 2.6 → 4人、旧 2.4 → 3人
  const tr3 = calculate({ type: "A", age0: 3, age1: 6, age3: 9 });
  t.push(eq("3歳9人・新基準 2.6 → A型4人", [tr3.newRule.totalTenths, tr3.newRule.required], [26, 4]));
  t.push(eq("3歳9人・経過措置 2.4 → A型3人", [tr3.oldRule.totalTenths, tr3.oldRule.required], [24, 3]));
  t.push(eq("既定は新基準", [tr3.rule, tr3.selected.required], [{ age3: "new", age4: "new" }, 4]));
  t.push(eq("3歳を経過措置にすると3人", calculate({ type: "A", age0: 3, age1: 6, age3: 9, age3Rule: "old" }).selected.required, 3));
  // 4歳以上だけ経過措置: 乳児3・1・2歳6・4歳以上13（新 0.5／旧 0.4）→ 新 2.5 → 4人、旧 2.4 → 3人
  t.push(eq("4歳以上13人・4歳以上だけ経過措置 → 3人",
    calculate({ type: "A", age0: 3, age1: 6, age4: 6, age5: 7, age4Rule: "old" }).selected.required, 3));
  t.push(eq("4歳以上13人・新基準 → 4人",
    calculate({ type: "A", age0: 3, age1: 6, age4: 6, age5: 7 }).selected.required, 4));

  // ── (4) B型・小規模型事業所内の保育士の半数 ─────────────────────────
  t.push(eq("半分の四捨五入: 4→2・5→3・3→2・2→1・1→1", [4, 5, 3, 2, 1].map(halfRoundUp), [2, 3, 2, 1, 1]));
  const kyB = calculate({ type: "B", ...KYOTO });
  t.push(eq("京都市の例・B型: 保育従事者4人・うち保育士2人", [kyB.selected.required, kyB.selected.hoikushiRequired], [4, 2]));
  const b5 = calculate({ type: "B", age0: 6, age1: 6, age2: 6 });
  t.push(eq("B型 4.0 → ＋1＝5人・保育士は 2.5 を四捨五入して3人", [b5.selected.required, b5.selected.hoikushiRequired], [5, 3]));
  const b3 = calculate({ type: "B", age0: 3, age2: 6 });
  t.push(eq("B型 2.0 → 3人・保育士2人", [b3.selected.required, b3.selected.hoikushiRequired], [3, 2]));
  const js = calculate({ type: "jigyoSmall", ...KYOTO });
  t.push(eq("小規模型事業所内（第47条）は B型と同じ: 4人・保育士2人", [js.selected.required, js.selected.hoikushiRequired], [4, 2]));

  // ── (5) 保育所型事業所内 ─────────────────────────
  const n1 = calculate({ type: "jigyoNursery", age0: 1 });
  t.push(eq("保育所型・乳児1人: 0 → 最低2人", [n1.selected.rounded, n1.selected.required, n1.selected.raisedToMin], [0, 2, true]));
  t.push(eq("保育所型・乳児6人: ちょうど2人は引き上げではない", calculate({ type: "jigyoNursery", age0: 6 }).selected.raisedToMin, false));
  const P60 = { age0: 6, age1: 10, age2: 12, age3: 12, age4: 10, age5: 10 };
  t.push(eq("保育所型・定員60人の例: 7.2 → 7人（＋1しない）", calculate({ type: "jigyoNursery", ...P60 }).selected.required, 7));
  t.push(eq("同じ60人を A型で数えると 8人（＋1）", calculate({ type: "A", ...P60 }).selected.required, 8));
  // 本文の比較の例: 0歳3・1〜2歳16（19人）→ 1.0＋2.6＝3.6 → 4。保育所型4人・A型5人・B型5人（保育士3人）
  const P19 = { age0: 3, age1: 8, age2: 8 };
  t.push(eq("19人の例: 保育所型4人・A型5人・B型5人（保育士3人）",
    [calculate({ type: "jigyoNursery", ...P19 }).selected.required, calculate({ type: "A", ...P19 }).selected.required,
     calculate({ type: "B", ...P19 }).selected.required, calculate({ type: "B", ...P19 }).selected.hoikushiRequired], [4, 5, 5, 3]));

  // ── (6) 附則第6条・附則第9条・みなし ─────────────────────────
  t.push(eq("附則第6条: A型で合計数1（乳児3）なら特例の注記", calculate({ type: "A", age0: 3 }).suppl6, true));
  t.push(eq("附則第6条: B型には無い", calculate({ type: "B", age0: 3 }).suppl6, false));
  t.push(eq("附則第6条: 合計数2なら注記しない", calculate({ type: "A", age0: 6 }).suppl6, false));
  t.push(eq("附則第6条: 保育所型で合計数1でも注記", calculate({ type: "jigyoNursery", age0: 3 }).suppl6, true));

  t.push(eq("A型・必要4人に保育士4人は足りる", calculate({ type: "A", ...KYOTO, hoikushi: 4 }).staff.enough, true));
  t.push(eq("A型・保育士3人は1人不足", [calculate({ type: "A", ...KYOTO, hoikushi: 3 }).staff.enough, calculate({ type: "A", ...KYOTO, hoikushi: 3 }).staff.short], [false, 1]));
  t.push(eq("A型・保育士3人＋看護師等1人で足りる（第29条第3項）", calculate({ type: "A", ...KYOTO, hoikushi: 3, nurse: 1 }).staff.enough, true));
  const nurse2 = calculate({ type: "A", ...KYOTO, hoikushi: 2, nurse: 2 });
  t.push(eq("看護師等は1人に限る: 保育士2＋看護師等2は3人と数えて不足", [nurse2.staff.counted, nurse2.staff.enough, nurse2.staff.extraNurse], [3, false, true]));
  const both = calculate({ type: "A", ...KYOTO, hoikushi: 2, nurse: 1, pt: 1 });
  t.push(eq("保育士2＋看護師等1＋特定理学療法士等1＝4人で足りる・支援体制の注記", [both.staff.counted, both.staff.enough, both.staff.bothDeemed], [4, true, true]));
  const tc1 = calculate({ type: "A", ...KYOTO, hoikushi: 3, teacher: 1 });
  t.push(eq("附則第7条: 保育士3＋教諭1＝4人、3×3＝9 ≥ 2×4＝8 で足りる", [tc1.staff.counted, tc1.staff.twoThirdsOk, tc1.staff.enough], [4, true, true]));
  const tc2 = calculate({ type: "A", ...KYOTO, hoikushi: 2, teacher: 2 });
  t.push(eq("附則第9条: 保育士2＋教諭2は人数は足りるが 3分の2（3人）に届かない", [tc2.staff.enoughCount, tc2.staff.twoThirdsOk, tc2.staff.twoThirdsNeed, tc2.staff.enough], [true, false, 3, false]));
  const tc3 = calculate({ type: "A", ...KYOTO, hoikushi: 2, nurse: 1, teacher: 1 });
  t.push(eq("附則第9条: 看護師等のみなしも除くので 保育士2＋看護師等1＋教諭1 は不足", [tc3.staff.counted, tc3.staff.twoThirdsOk, tc3.staff.enough], [4, false, false]));
  // 必要3人（乳児3・1・2歳3 → 1.5 → 2 → 3）: 保育士2＋教諭1 は 3×2＝6 ≥ 2×3＝6 でちょうど足りる
  const tc4 = calculate({ type: "A", age0: 3, age1: 3, hoikushi: 2, teacher: 1 });
  t.push(eq("附則第9条: 3分の2はちょうどで足りる（必要3人・保育士2人）", [tc4.selected.required, tc4.staff.twoThirdsOk, tc4.staff.enough], [3, true, true]));
  t.push(eq("教諭を使わなければ3分の2は問わない", calculate({ type: "A", ...KYOTO, hoikushi: 3, nurse: 1 }).staff.usesTeacher, false));

  t.push(eq("B型・保育士2＋その他2で足りる", calculate({ type: "B", ...KYOTO, hoikushi: 2, other: 2 }).staff.enough, true));
  const bh = calculate({ type: "B", ...KYOTO, hoikushi: 1, other: 3 });
  t.push(eq("B型・保育士1＋その他3は総数は足りるが保育士が1人不足", [bh.staff.enoughTotal, bh.staff.enoughHoikushi, bh.staff.shortHoikushi, bh.staff.enough], [true, false, 1, false]));
  t.push(eq("B型・保育士1＋看護師等1＋その他2で足りる（第31条第3項）", calculate({ type: "B", ...KYOTO, hoikushi: 1, nurse: 1, other: 2 }).staff.enough, true));
  const bt = calculate({ type: "B", ...KYOTO, hoikushi: 2, other: 1 });
  t.push(eq("B型・保育士2＋その他1は総数が1人不足", [bt.staff.enoughTotal, bt.staff.shortTotal, bt.staff.enough], [false, 1, false]));
  t.push(eq("B型には教諭のみなし（附則第7条）が無い: 教諭だけ入れても判定しない", calculate({ type: "B", ...KYOTO, teacher: 5 }).staff, null));
  t.push(eq("B型・保育士3人＋その他2人（必要5人・保育士3人）はちょうど足りる",
    calculate({ type: "B", age0: 6, age1: 6, age2: 6, hoikushi: 3, other: 2 }).staff.enough, true));
  t.push(eq("配置が空欄なら判定しない", calculate({ type: "A", ...KYOTO }).staff, null));

  // ── (7) C型・家庭的保育 ─────────────────────────
  t.push(eq("10人: 家庭的保育者だけなら4人、補助者と組むなら 家庭的保育者2＋補助者2（京都市の例）", kateiNeed(10), { solo: 4, keepers: 2, assistants: 2 }));
  t.push(eq("8人: 家庭的保育者2＋補助者1（5＋3）", kateiNeed(8), { solo: 3, keepers: 2, assistants: 1 }));
  t.push(eq("6人: 家庭的保育者2人で足り、補助者は要らない", kateiNeed(6), { solo: 2, keepers: 2, assistants: 0 }));
  t.push(eq("5人: 家庭的保育者1＋補助者1", kateiNeed(5), { solo: 2, keepers: 1, assistants: 1 }));
  t.push(eq("4人: 家庭的保育者1＋補助者1", kateiNeed(4), { solo: 2, keepers: 1, assistants: 1 }));
  t.push(eq("3人: 家庭的保育者1人", kateiNeed(3), { solo: 1, keepers: 1, assistants: 0 }));
  t.push(eq("11人: 家庭的保育者3＋補助者1（5＋3＋3）", kateiNeed(11), { solo: 4, keepers: 3, assistants: 1 }));
  t.push(eq("保育できる数: 2人＋補助者2＝10・2人＋補助者1＝8", [kateiCapacity(2, 2), kateiCapacity(2, 1)], [10, 8]));
  t.push(eq("補助者は家庭的保育者の数までしか効かない: 1人＋補助者3＝5", kateiCapacity(1, 3), 5));
  t.push(eq("家庭的保育者0人なら0", kateiCapacity(0, 2), 0));
  t.push(eq("10人の組み合わせ: 2＋補助者2・3＋補助者1・4＋補助者0", kateiOptions(10),
    [{ keepers: 2, assistants: 2 }, { keepers: 3, assistants: 1 }, { keepers: 4, assistants: 0 }]));
  t.push(eq("組み合わせはどれも10人を保育できる", kateiOptions(10).every((o) => kateiCapacity(o.keepers, o.assistants) >= 10), true));
  t.push(eq("3人の組み合わせは1通り（家庭的保育者1人）", kateiOptions(3), [{ keepers: 1, assistants: 0 }]));
  const c10 = calculate({ type: "C", age0: 3, age1: 4, age2: 3, keepers: 2, assistants: 2 });
  t.push(eq("C型10人・家庭的保育者2＋補助者2は足りる", [c10.katei, c10.staff.capacity, c10.staff.enough], [{ solo: 4, keepers: 2, assistants: 2 }, 10, true]));
  t.push(eq("C型10人・家庭的保育者2＋補助者1は不足（8人まで）", calculate({ type: "C", age0: 3, age1: 4, age2: 3, keepers: 2, assistants: 1 }).staff.enough, false));
  t.push(eq("C型・補助者が余る数を示す", calculate({ type: "C", age1: 6, keepers: 1, assistants: 3 }).staff.idleAssistants, 2));
  t.push(eq("C型は年齢を問わず合計で数える（3歳以上を含む）", [calculate({ type: "C", age2: 4, age3: 2 }).totalChildren, calculate({ type: "C", age2: 4, age3: 2 }).hasAge3plus], [6, true]));
  t.push(eq("C型は国の算式を使わない（selected が無い）", calculate({ type: "C", age1: 6 }).selected, undefined));
  t.push(eq("家庭的保育5人・家庭的保育者1＋補助者1は足りる", calculate({ type: "katei", age1: 5, keepers: 1, assistants: 1 }).staff.enough, true));
  t.push(eq("家庭的保育4人・家庭的保育者1人だけは不足", calculate({ type: "katei", age1: 4, keepers: 1 }).staff.enough, false));

  // ── (8) 利用定員の注意と入力の検証 ─────────────────────────
  t.push(eq("A型19人は定員の範囲内・20人は超える", [calculate({ type: "A", age1: 19 }).overCapacity, calculate({ type: "A", age1: 20 }).overCapacity], [false, true]));
  t.push(eq("C型10人は範囲内・11人は超える", [calculate({ type: "C", age1: 10 }).overCapacity, calculate({ type: "C", age1: 11 }).overCapacity], [false, true]));
  t.push(eq("家庭的保育5人は範囲内・6人は超える", [calculate({ type: "katei", age1: 5 }).overCapacity, calculate({ type: "katei", age1: 6 }).overCapacity], [false, true]));
  t.push(eq("保育所型19人は定員20人未満の注記・20人は注記なし", [calculate({ type: "jigyoNursery", age1: 19 }).underCapacity, calculate({ type: "jigyoNursery", age1: 20 }).underCapacity], [true, false]));
  t.push(eq("既定の種類は A型", calculate(KYOTO).type, "A"));
  t.push(eq("知らない種類はエラー", calculate({ type: "D", ...KYOTO }).ok, false));
  t.push(eq("全部空ならエラー", calculate({ type: "A" }).ok, false));
  t.push(eq("全部 0 ならエラー", calculate({ type: "B", age0: 0, age1: 0 }).ok, false));
  t.push(eq("小数の人数はエラー", calculate({ type: "A", age0: 1.5 }).ok, false));
  t.push(eq("負の人数はエラー", calculate({ type: "A", age0: -1 }).ok, false));
  t.push(eq("1,001人はエラー", calculate({ type: "jigyoNursery", age5: 1001 }).ok, false));
  t.push(eq("1,000人は受け付ける（保育所型・4歳以上1000÷25＝40人）", calculate({ type: "jigyoNursery", age5: 1000 }).selected.required, 40));
  t.push(eq("配置の人数が数でないとエラー", calculate({ type: "A", ...KYOTO, hoikushi: "abc" }).ok, false));
  t.push(eq("配置の人数が小数だとエラー（人で数える）", calculate({ type: "A", ...KYOTO, hoikushi: 3.5 }).ok, false));
  t.push(eq("家庭的保育者の数が負だとエラー", calculate({ type: "C", age1: 6, keepers: -1 }).ok, false));
  t.push(eq("空欄の年齢は0人", calculate({ type: "A", age0: 3, age1: "" }).groups.toddler, 0));

  return t;
}
