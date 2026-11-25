// 認定こども園（幼保連携型）の職員配置基準の計算
// （幼保連携型認定こども園の学級の編制、職員、設備及び運営に関する基準 第4条・第5条・附則第5条〜第10条）
//
// 条文（e-Gov 法令API v2・現行 426M60000182001_20260401_508M60000082004＝2026-04-01 施行版で逐語確認。
//   未施行の 2026-12-25 版（令和7年内閣府・文部科学省令第5号）でも第4条・第5条・附則第1条〜第10条は同一）:
//   第5条第1項「幼保連携型認定こども園には、各学級ごとに担当する専任の主幹保育教諭、指導保育教諭、主務保育教諭又は
//     保育教諭（次項において「保育教諭等」という。）を一人以上置かなければならない。」
//   第5条第2項「特別の事情があるときは、保育教諭等は、専任の副園長若しくは教頭が兼ね、又は当該幼保連携型認定こども園の
//     学級数の三分の一の範囲内で、専任の助保育教諭若しくは講師をもって代えることができる。」
//   第5条第3項「…園児の教育及び保育…に直接従事する職員の数は、次の表の上欄に掲げる園児の区分に応じ、それぞれ同表の
//     下欄に定める員数以上とする。ただし、当該職員の数は、常時二人を下ってはならない。」
//     表「一 満四歳以上の園児 おおむね二十五人につき一人 二 満三歳以上満四歳未満の園児 おおむね十五人につき一人
//         三 満一歳以上満三歳未満の園児 おおむね六人につき一人 四 満一歳未満の園児 おおむね三人につき一人」
//     備考二「この表に定める員数は、同表の上欄の園児の区分ごとに下欄の園児数に応じ定める数を合算した数とする。」
//     備考三「この表の第一号及び第二号に係る員数が学級数を下るときは、当該学級数に相当する数を当該員数とする。」
//     備考四「園長が専任でない場合は、原則としてこの表に定める員数を一人増加するものとする。」
//   第4条第2項「一学級の園児数は、三十人以下を原則とする。」（令和8年内閣府・文部科学省令第2号で 2026-04-01 から。
//     同令 附則第2項: 施行の際現に存する園は「令和十四年三月三十一日までは、なお従前の例によることができる。」＝三十五人）
//   附則第9条: 特定理学療法士等（備考五）・小学校教諭等免許状所持者（附則第6条）・知事が認める者（附則第7条）・
//     看護師等（附則第8条）で代える場合、その総数は「同項の規定により置かなければならない職員の数の三分の一を超えてはならない。」
//   経過措置（令和6年内閣府・文部科学省令第1号 附則）: 第2項 満四歳以上は「当分の間」、第3項 満三歳は
//     「令和十年三月三十一日までの間」、教育及び保育の提供に支障を及ぼすおそれがあるときは改正前の規定
//     （2023-04-01 版の表で「おおむね三十人につき一人」「おおむね二十人につき一人」）が「なおその効力を有する」
//
// 端数処理（省令は「おおむね」とだけ書き、端数処理を定めていない）:
//   こども家庭庁「公定価格に関するFAQ」第29版（令和8年3月31日時点）No.8
//   「年齢別に、子どもの数を配置基準で除して小数点第1位まで求め（小数点第２位以下切捨て）、各々を合計した後に
//     小数点以下を四捨五入した数になります。」「※認定こども園の場合は施設全体（１号～３号）の子どもの数を基に計算」
//   ＜算式＞｛４歳以上児数×1/30｝＋｛３歳児数(＊1)×1/20｝＋｛１､２歳児数(＊2)×1/6｝＋｛乳児数×1/3｝（各小数点第1位まで）
//     (＊1)1号認定こどもの場合満3歳児を含む。(＊2)1号認定こどもの場合満3歳児は含まない。
//   本ツールはこの算式を、省令の比率（15・25）と経過措置の比率（20・30）の両方に当てはめる（T020 と同じ）。
//   堺市の計算例（0歳8・1歳18・2歳20・3歳24・4歳25・5歳25 → 13人、旧基準で 0歳8・1歳20・2歳22・3歳22・4歳24・5歳24 → 12人）と一致。
//
// 誤差の向き:
//   - 年齢区分ごとの値は 0.1人単位の整数 floor(10×人数÷比率) で持ち、四捨五入も整数で行う（浮動小数を使わない）
//   - 備考三は丸める前の値（3歳児と4歳以上児の値の合計）を学級数と比べ、下回れば学級数に置き換えてから合計する
//     （丸めてから比べると、丸めで学級数に届いた分だけ少なく出ることがある）
//   - 備考四の＋1は「この表に定める員数」に足してから、常時2人と比べる（文言どおり）
//   - 3分の1の上限は 3×代える人数 ≤ 必要数 を整数で。代えられる人数は floor(必要数÷3)

export const RATIO = {
  infant: 3, // 満1歳未満
  toddler: 6, // 満1歳以上満3歳未満
  age3New: 15, // 満3歳以上満4歳未満（令和6年4月から）
  age3Old: 20, // 同・経過措置（令和10年3月31日まで）
  age4New: 25, // 満4歳以上（令和6年4月から）
  age4Old: 30, // 同・経過措置（当分の間）
};
export const MIN_STAFF = 2; // 第5条第3項ただし書
export const AGE3_TRANSITION_UNTIL = "2028-03-31"; // 令和6年内閣府・文部科学省令第1号 附則第3項
export const CLASS_SIZE = { new: 30, old: 35 }; // 第4条第2項（old は令和8年同令第2号 附則第2項の従前の例）
export const CLASS_TRANSITION_UNTIL = "2032-03-31";
const MAX_CHILDREN = 1000;
const MAX_CLASSES = 100;
const MAX_STAFF_TENTHS = 10000; // 1,000人

// 人数 ÷ 比率 を小数点第1位まで（第2位以下切り捨て）。0.1人単位の整数で返す
export function tenthsFloor(children, ratio) {
  const x = 10 * children;
  return (x - (x % ratio)) / ratio;
}

// 0.1人単位の合計を小数点以下四捨五入した人数
export function roundHalfUpTenths(t) {
  return Math.floor((t + 5) / 10);
}

const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

// 学年ごとに1学級 limit 人以下で編制したときの最少の学級数（第4条第2項・第3項の原則）
export function minClasses(age3, age4, age5, limit) {
  return [age3, age4, age5].reduce((s, n) => s + ceilDiv(n, limit), 0);
}

const blank = (v) => v === "" || v === null || v === undefined;

function parseInt0(v, max, msg, errors) {
  if (blank(v)) return null;
  const s = String(v).trim();
  if (!/^\d+$/.test(s) || Number(s) > max) {
    errors.push(msg);
    return null;
  }
  return Number(s);
}

// groups: { infant, toddler, age3, age4plus }（人数）
// opt: { age3Rule: "new"|"old", age4Rule: "new"|"old", classes: 整数, principalFullTime: 真偽 }
export function compute(groups, { age3Rule = "new", age4Rule = "new", classes = 0, principalFullTime = true } = {}) {
  const r3 = age3Rule === "old" ? RATIO.age3Old : RATIO.age3New;
  const r4 = age4Rule === "old" ? RATIO.age4Old : RATIO.age4New;
  const rows = [
    { key: "infant", label: "満1歳未満（0歳児）", children: groups.infant, ratio: RATIO.infant },
    { key: "toddler", label: "満1歳以上満3歳未満（1・2歳児）", children: groups.toddler, ratio: RATIO.toddler },
    { key: "age3", label: "満3歳以上満4歳未満（3歳児）", children: groups.age3, ratio: r3 },
    { key: "age4", label: "満4歳以上（4・5歳児）", children: groups.age4plus, ratio: r4 },
  ].map((r) => ({ ...r, tenths: tenthsFloor(r.children, r.ratio) }));

  // 備考三: 表の第一号（満4歳以上）と第二号（満3歳）に係る員数
  const upperTenths = rows[2].tenths + rows[3].tenths;
  const classTenths = 10 * classes;
  const raisedToClasses = upperTenths < classTenths;
  const upperUsedTenths = raisedToClasses ? classTenths : upperTenths;

  const totalTenths = rows[0].tenths + rows[1].tenths + upperUsedTenths;
  const tableCount = roundHalfUpTenths(totalTenths); // この表に定める員数
  const principalAdd = principalFullTime ? 0 : 1; // 備考四
  const withPrincipal = tableCount + principalAdd;
  const required = Math.max(withPrincipal, MIN_STAFF); // 常時二人
  const substituteMax = Math.floor(required / 3); // 附則第9条
  return {
    rows,
    upperTenths,
    upperUsedTenths,
    raisedToClasses,
    totalTenths,
    tableCount,
    principalAdd,
    required,
    raisedToMin: withPrincipal < MIN_STAFF,
    substituteMax,
    qualifiedMin: required - substituteMax,
  };
}

export function calculate({ age0, age1, age2, age3, age4, age5, classes, classLimit, principal, age3Rule, age4Rule, staff }) {
  const errors = [];
  const ages = [age0, age1, age2, age3, age4, age5];
  const names = ["0歳児", "1歳児", "2歳児", "3歳児", "4歳児", "5歳児"];
  const c = ages.map((v, i) =>
    parseInt0(v, MAX_CHILDREN, `${names[i]}の人数は 0〜${MAX_CHILDREN.toLocaleString("ja-JP")} の整数で入力してください。`, errors) ?? 0);
  if (errors.length) return { ok: false, errors };
  const counts = { age0: c[0], age1: c[1], age2: c[2], age3: c[3], age4: c[4], age5: c[5] };
  const groups = { infant: c[0], toddler: c[1] + c[2], age3: c[3], age4plus: c[4] + c[5] };
  const totalChildren = c.reduce((s, n) => s + n, 0);
  if (totalChildren === 0) return { ok: false, errors: ["年齢ごとの園児の数を入力してください。"] };
  const upperChildren = groups.age3 + groups.age4plus;

  const limitKey = classLimit === "old" ? "old" : "new";
  const limit = CLASS_SIZE[limitKey];
  const byAge = minClasses(c[3], c[4], c[5], limit);
  const entered = parseInt0(classes, MAX_CLASSES, `学級数は 0〜${MAX_CLASSES} の整数で入力してください。`, errors);
  if (errors.length) return { ok: false, errors };
  if (entered !== null) {
    if (upperChildren === 0 && entered > 0)
      return { ok: false, errors: ["満3歳以上の園児がいないときは、学級数を空欄か 0 にしてください（学級は満3歳以上の園児で編制します）。"] };
    if (upperChildren > 0 && entered === 0)
      return { ok: false, errors: ["満3歳以上の園児がいるときは学級を編制します（第4条第1項）。学級数を 1 以上で入力してください。"] };
    if (entered > upperChildren)
      return { ok: false, errors: ["学級数が満3歳以上の園児の数より多くなっています。"] };
  }
  const classCount = entered === null ? byAge : entered;
  const opt = {
    classes: classCount,
    principalFullTime: principal !== "not",
  };
  const r3 = age3Rule === "old" ? "old" : "new";
  const r4 = age4Rule === "old" ? "old" : "new";

  const res = {
    ok: true,
    counts,
    groups,
    totalChildren,
    upperChildren,
    rule: { age3: r3, age4: r4 },
    classes: {
      count: classCount,
      assumed: entered === null,
      limit,
      limitKey,
      byAge,
      overLimit: upperChildren > classCount * limit, // 平均でも1学級が原則の人数を超える
      belowByAge: entered !== null && entered < byAge, // 学年ごとの編制（原則）なら最少 byAge 学級
      assistantMax: Math.floor(classCount / 3), // 第5条第2項
    },
    principalFullTime: opt.principalFullTime,
    selected: compute(groups, { ...opt, age3Rule: r3, age4Rule: r4 }),
    newRule: compute(groups, { ...opt, age3Rule: "new", age4Rule: "new" }),
    oldRule: compute(groups, { ...opt, age3Rule: "old", age4Rule: "old" }),
    staff: null,
  };

  if (!blank(staff)) {
    const s = String(staff).trim();
    const st = /^\d+(\.\d)?$/.test(s) ? Math.round(Number(s) * 10) : NaN;
    if (!Number.isFinite(st) || st > MAX_STAFF_TENTHS) {
      return { ok: false, errors: ["配置している職員の数は 0〜1,000 人（0.1人単位）で入力してください。"] };
    }
    const needT = res.selected.required * 10;
    res.staff = {
      count: st / 10,
      enough: st >= needT,
      shortfall: st >= needT ? 0 : (needT - st) / 10,
    };
  }
  return res;
}
