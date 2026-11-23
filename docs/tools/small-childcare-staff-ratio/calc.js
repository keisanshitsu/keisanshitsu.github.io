// 小規模保育・家庭的保育・事業所内保育の配置基準の計算（家庭的保育事業等の設備及び運営に関する基準）
//
// 条文（e-Gov 法令API v2・現行 426M60000100061_20260401_508M60000002010＝2026-04-01 施行版で逐語確認。
//   未施行の 2026-12-25 版（令和7年内閣府令第104号）でも以下の条と附則は文字列で同じ）:
//   第29条第2項（A型）「保育士の数は、次の各号に掲げる区分に応じ、当該各号に定める数の合計数に一を加えた数以上とする。
//     一 乳児おおむね三人につき一人 二 満一歳以上満三歳に満たない幼児おおむね六人につき一人
//     三 満三歳以上満四歳に満たない児童おおむね十五人につき一人（…受け入れる場合に限る。…） 四 満四歳以上の児童おおむね二十五人につき一人」
//   第31条第2項（B型）「保育従事者の数は、…合計数に一を加えた数以上とし、そのうち半数以上は保育士とする。」（各号は A型と同じ）
//   第47条第2項（事業所内保育・利用定員19人以下）B型と同じ文言
//   第44条第2項（事業所内保育・利用定員20人以上＝保育所型）「保育士の数は、…合計数以上とする。
//     ただし、保育所型事業所内保育事業所一につき二人を下回ることはできない。」
//   第29条・第31条・第44条・第47条の第3項・第4項: 看護師等・特定理学療法士等を「一人に限り、保育士とみなすことができる」
//   第23条第3項（家庭的保育）・第34条第2項（C型）「家庭的保育者一人が保育することができる乳幼児の数は、三人以下とする。
//     ただし、家庭的保育者が、家庭的保育補助者とともに保育する場合には、五人以下とする。」
//   附則第7条: 当分の間、第29条第2項・第44条第2項の算定で幼稚園・小学校・養護教諭の普通免許状を有する者を保育士とみなせる
//   附則第9条: 附則第7条・第8条を使う時は、みなしの者（第3項・第4項のみなしも）を除いた保育士を
//     「算定される保育士の数の三分の二以上」置く
//   附則第6条: 当分の間、第29条第2項各号・第44条第2項各号の合計数が一となる時は、保育士1人＋保育士と同等と市町村長が認める者でよい
//   令和6年内閣府令第18号 附則第2項（3歳・令和十年三月三十一日まで）・第3項（4歳以上・当分の間）:
//     第29条第2項・第31条第2項・第44条第2項・第47条第2項について改正前の規定（二十人・三十人につき一人）が「なおその効力を有する」
//
// 端数処理（省令は「おおむね」と書くだけで定めていない）:
//   こども家庭庁「公定価格に関するFAQ」第29版（令和8年3月31日時点）
//   No.8「年齢別に、子どもの数を配置基準で除して小数点第1位まで求め（小数点第２位以下切捨て）、各々を合計した後に
//     小数点以下を四捨五入した数になります。※家庭的保育事業、小規模保育事業Ｃ型、居宅訪問型保育事業を除く」
//     → A型・B型・事業所内保育にだけ使う。1・2歳児、4歳以上児はそれぞれ合わせてから割る（T020 と同じ）
//   No.5（A型・B型）「…及び 左記に加えて１人を加配 ※上記の定数のうちＡ型は100％、Ｂ型は50％以上(＊)は保育士
//     （必要保育従事者数（整数化後（「No.８」を参照））×1/2＝必要保育士数（小数点第1位を四捨五入））」
//     → B型の保育士＝必要保育従事者数の半分を四捨五入＝半分の切り上げ（5人なら3人）
//   No.6（C型）「家庭的保育者 子ども３人につき１人（それぞれの家庭的保育者に補助者を配置する場合は５人）」
//
// 誤差の向き: 浮動小数を避けるため、年齢区分ごとの値は 0.1人単位の整数 floor(10×人数÷比率) で持ち、四捨五入も整数で行う。
//   附則第9条の3分の2は 3×保育士 ≥ 2×必要数 を整数で比べる（丸めない）。既定は新基準（人数が多く出る側）。

export const RATIO = {
  infant: 3, // 乳児（0歳児）
  toddler: 6, // 1・2歳児
  age3New: 15, // 3歳児（令和6年4月からの基準）
  age3Old: 20, // 3歳児（経過措置・令和10年3月31日まで）
  age4New: 25, // 4歳以上児（令和6年4月からの基準）
  age4Old: 30, // 4歳以上児（経過措置・当分の間）
};
export const KATEI_SOLO = 3; // 家庭的保育者1人で3人以下（第23条第3項・第34条第2項）
export const KATEI_WITH_ASSIST = 5; // 家庭的保育補助者とともに5人以下（同ただし書）
export const NURSERY_MIN = 2; // 第44条第2項ただし書
export const AGE3_TRANSITION_UNTIL = "2028-03-31"; // 令和6年内閣府令第18号 附則第2項

// mode: "ratio"＝年齢別の比率と国の算式／"katei"＝家庭的保育者1人あたりの人数
// plusOne: 合計数に一を加える／half: 半数以上は保育士／minStaff: 最低人数／teacher: 附則第7条の免許状のみなし
// capacity: 利用定員の範囲（児童福祉法 第6条の3・第35条・第43条・第47条）
export const TYPES = {
  A: { label: "小規模保育事業A型", article: "第29条", mode: "ratio", plusOne: true, half: false, minStaff: 0, teacher: true, capacity: [6, 19] },
  B: { label: "小規模保育事業B型", article: "第31条", mode: "ratio", plusOne: true, half: true, minStaff: 0, teacher: false, capacity: [6, 19] },
  C: { label: "小規模保育事業C型", article: "第34条", mode: "katei", capacity: [6, 10] },
  katei: { label: "家庭的保育事業", article: "第23条", mode: "katei", capacity: [1, 5] },
  jigyoSmall: { label: "事業所内保育事業（利用定員19人以下）", article: "第47条", mode: "ratio", plusOne: true, half: true, minStaff: 0, teacher: false, capacity: [1, 19] },
  jigyoNursery: { label: "事業所内保育事業（利用定員20人以上・保育所型）", article: "第44条", mode: "ratio", plusOne: false, half: false, minStaff: NURSERY_MIN, teacher: true, capacity: [20, null] },
};

const MAX_CHILDREN = 1000;
const MAX_STAFF = 1000;

// 人数 ÷ 比率 を小数点第1位まで（第2位以下切り捨て）。0.1人単位の整数で返す
export function tenthsFloor(children, ratio) {
  const x = 10 * children;
  return (x - (x % ratio)) / ratio;
}

// 0.1人単位の合計を小数点以下四捨五入した人数
export function roundHalfUpTenths(t) {
  return Math.floor((t + 5) / 10);
}

// B型の保育士: 必要保育従事者数×1/2 を小数点第1位で四捨五入（FAQ No.5）＝半分の切り上げ
export function halfRoundUp(n) {
  return Math.floor((n + 1) / 2);
}

// 家庭的保育者 k 人・補助者 a 人で保育できる子どもの数（補助者は家庭的保育者1人につき1人まで効く）
export function kateiCapacity(k, a) {
  return KATEI_SOLO * k + (KATEI_WITH_ASSIST - KATEI_SOLO) * Math.min(a, k);
}

// n 人を保育するのに要る組み合わせ: 家庭的保育者だけの人数と、補助者と組むときの最少の家庭的保育者と補助者
export function kateiNeed(n) {
  const solo = Math.ceil(n / KATEI_SOLO);
  const keepers = Math.ceil(n / KATEI_WITH_ASSIST);
  const rest = n - KATEI_SOLO * keepers;
  const assistants = rest > 0 ? Math.ceil(rest / (KATEI_WITH_ASSIST - KATEI_SOLO)) : 0;
  return { solo, keepers, assistants };
}

// 家庭的保育者の人数ごとに、最少の補助者の数（補助者と組む最少の人数から、家庭的保育者だけで足りる人数まで）
export function kateiOptions(n) {
  const { solo, keepers } = kateiNeed(n);
  const list = [];
  for (let k = keepers; k <= solo; k++) {
    const rest = n - KATEI_SOLO * k;
    list.push({ keepers: k, assistants: rest > 0 ? Math.ceil(rest / (KATEI_WITH_ASSIST - KATEI_SOLO)) : 0 });
  }
  return list;
}

const blank = (v) => v === "" || v === null || v === undefined;

function parseInt0(v, label, max, errors) {
  if (blank(v)) return 0;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) {
    errors.push(`${label}は 0 以上の整数で入力してください。`);
    return 0;
  }
  const n = Number(s);
  if (n > max) {
    errors.push(`${label}は ${max.toLocaleString("ja-JP")} 人以下で入力してください。`);
    return 0;
  }
  return n;
}

// 年齢区分ごとの計算（国の算式）。age3/age4 は "new"（15・25）か "old"（20・30）
export function computeRatio(groups, type, age3 = "new", age4 = "new") {
  const t = TYPES[type];
  const r3 = age3 === "old" ? RATIO.age3Old : RATIO.age3New;
  const r4 = age4 === "old" ? RATIO.age4Old : RATIO.age4New;
  const rows = [
    { key: "infant", label: "乳児（0歳児）", children: groups.infant, ratio: RATIO.infant },
    { key: "toddler", label: "1・2歳児", children: groups.toddler, ratio: RATIO.toddler },
    { key: "age3", label: "3歳児", children: groups.age3, ratio: r3 },
    { key: "age4", label: "4歳以上児", children: groups.age4plus, ratio: r4 },
  ].map((r) => ({ ...r, tenths: tenthsFloor(r.children, r.ratio) }));
  const totalTenths = rows.reduce((s, r) => s + r.tenths, 0);
  const rounded = roundHalfUpTenths(totalTenths);
  const base = t.plusOne ? rounded + 1 : rounded;
  const required = Math.max(base, t.minStaff);
  return {
    rows,
    totalTenths,
    rounded,
    required,
    raisedToMin: base < t.minStaff,
    hoikushiRequired: t.half ? halfRoundUp(required) : required,
  };
}

export function calculate(input = {}) {
  const errors = [];
  const type = input.type ?? "A";
  const t = TYPES[type];
  if (!t) return { ok: false, errors: ["事業の種類を選んでください。"] };

  const c = {};
  for (const [k, label] of [["age0", "0歳児"], ["age1", "1歳児"], ["age2", "2歳児"], ["age3", "3歳児"], ["age4", "4歳児"], ["age5", "5歳児"]])
    c[k] = parseInt0(input[k], `${label}の人数`, MAX_CHILDREN, errors);
  if (errors.length) return { ok: false, errors };
  const groups = { infant: c.age0, toddler: c.age1 + c.age2, age3: c.age3, age4plus: c.age4 + c.age5 };
  const totalChildren = groups.infant + groups.toddler + groups.age3 + groups.age4plus;
  if (totalChildren === 0) return { ok: false, errors: ["年齢ごとの子どもの数を入力してください。"] };

  const staffKeys = t.mode === "katei"
    ? [["keepers", "家庭的保育者の数"], ["assistants", "家庭的保育補助者の数"]]
    : [["hoikushi", "保育士の数"], ["nurse", "看護師等の数"], ["pt", "特定理学療法士等の数"],
       ...(t.teacher ? [["teacher", "教諭の免許状を持つ人の数"]] : []),
       ...(t.half ? [["other", "保育士以外の保育従事者の数"]] : [])];
  const hasStaff = staffKeys.some(([k]) => !blank(input[k]));
  const s = {};
  for (const [k, label] of staffKeys) s[k] = parseInt0(input[k], label, MAX_STAFF, errors);
  if (errors.length) return { ok: false, errors };

  const [capMin, capMax] = t.capacity;
  const res = {
    ok: true,
    type,
    typeInfo: t,
    counts: c,
    groups,
    totalChildren,
    overCapacity: capMax !== null && totalChildren > capMax,
    underCapacity: capMax === null && totalChildren < capMin,
    hasAge3plus: groups.age3 + groups.age4plus > 0,
    staff: null,
  };

  if (t.mode === "katei") {
    res.katei = kateiNeed(totalChildren);
    res.kateiOptions = kateiOptions(totalChildren);
    if (hasStaff) {
      const cap = kateiCapacity(s.keepers, s.assistants);
      res.staff = {
        keepers: s.keepers,
        assistants: s.assistants,
        capacity: cap,
        enough: totalChildren <= cap,
        idleAssistants: Math.max(0, s.assistants - s.keepers),
      };
    }
    return res;
  }

  const r3 = input.age3Rule === "old" ? "old" : "new";
  const r4 = input.age4Rule === "old" ? "old" : "new";
  res.rule = { age3: r3, age4: r4 };
  res.selected = computeRatio(groups, type, r3, r4);
  res.newRule = computeRatio(groups, type, "new", "new");
  res.oldRule = computeRatio(groups, type, "old", "old");
  // 附則第6条: A型・保育所型事業所内で、各号の合計数が1となる時
  res.suppl6 = t.teacher && res.selected.rounded === 1;

  if (hasStaff) {
    const need = res.selected.required;
    const deemed = Math.min(s.nurse, 1) + Math.min(s.pt, 1);
    if (t.half) {
      const hoikushiCounted = s.hoikushi + deemed;
      const total = hoikushiCounted + s.other;
      res.staff = {
        hoikushi: s.hoikushi,
        hoikushiCounted,
        total,
        enoughTotal: total >= need,
        enoughHoikushi: hoikushiCounted >= res.selected.hoikushiRequired,
        shortTotal: Math.max(0, need - total),
        shortHoikushi: Math.max(0, res.selected.hoikushiRequired - hoikushiCounted),
        extraNurse: s.nurse > 1,
        extraPt: s.pt > 1,
        bothDeemed: s.nurse > 0 && s.pt > 0,
      };
      res.staff.enough = res.staff.enoughTotal && res.staff.enoughHoikushi;
    } else {
      const counted = s.hoikushi + deemed + s.teacher;
      const usesTeacher = s.teacher > 0;
      // 附則第9条: みなしを除いた保育士 ≥ 必要数×2/3（整数で比べる）
      const twoThirdsOk = !usesTeacher || 3 * s.hoikushi >= 2 * need;
      res.staff = {
        hoikushi: s.hoikushi,
        counted,
        usesTeacher,
        twoThirdsOk,
        twoThirdsNeed: Math.ceil((2 * need) / 3),
        enoughCount: counted >= need,
        short: Math.max(0, need - counted),
        extraNurse: s.nurse > 1,
        extraPt: s.pt > 1,
        bothDeemed: s.nurse > 0 && s.pt > 0,
      };
      res.staff.enough = res.staff.enoughCount && twoThirdsOk;
    }
  }
  return res;
}
