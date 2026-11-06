// 保育士の配置基準の計算（児童福祉施設の設備及び運営に関する基準 第33条第2項）
//
// 条文（e-Gov 法令API v2・現行 323M40000100063_20261001_508M60000002090＝2026-10-01 施行版で逐語確認）:
//   第33条第2項「保育士の数は、乳児おおむね三人につき一人以上、満一歳以上満三歳に満たない幼児おおむね六人につき
//     一人以上、満三歳以上満四歳に満たない幼児おおむね十五人につき一人以上、満四歳以上の幼児おおむね二十五人につき
//     一人以上とする。ただし、保育所一につき二人を下ることはできない。」
//   令和6年内閣府令第18号 附則第2項（3歳）: 「保育の提供に支障を及ぼすおそれがあるときは、令和十年三月三十一日までの間、
//     …（満三歳以上満四歳に満たない児童に対し保育を提供する保育士…の数に関する部分に限る。）は、適用しない。」
//     → 改正前の規定（二十人につき一人）が「なおその効力を有する」
//   同 附則第3項（4歳以上）: 同じ形で「当分の間」。改正前は三十人につき一人
//   省令 附則第94条: 「当分の間、第三十三条第二項ただし書の規定を適用しないことができる。」（必要な保育士が一人となる
//     時は、知事等が保育士と同等の知識及び経験を有すると認める者を加えて置く）
//
// 端数処理（省令は「おおむね」とだけ書き、端数処理を定めていない）:
//   こども家庭庁「公定価格に関するFAQ」No.8（第26版 令和6年12月23日時点・第29版 令和8年3月31日時点も同文）
//   「年齢別に、子どもの数を配置基準で除して小数点第1位まで求め（小数点第２位以下切捨て）、各々を合計した後に
//     小数点以下を四捨五入した数になります。」
//   ＜算式＞｛４歳以上児数×1/30（小数点第１位まで計算（小数点第２位以下切り捨て））｝＋｛３歳児数×1/20（〃）｝
//          ＋｛１､２歳児数×1/6（〃）｝＋｛乳児数×1/3（〃）｝＝必要教育・保育従事者数（小数点第１位を四捨五入）
//   ※年齢区分は「1・2歳児」「4歳以上児」をそれぞれ合わせてから割る（1歳と2歳、4歳と5歳を別々に切り捨てない）
//   川崎市（令和3年4月から「国の算式に統一」）・船橋市・藤沢市は、最低基準の確認にもこの算式を使っている。
//   本ツールはこの算式を、省令の比率（15・25）と経過措置の比率（20・30）の両方に当てはめる。
//
// 誤差の向き: 浮動小数を避けるため、年齢区分ごとの値は 0.1人単位の整数 floor(10×人数÷比率) で持ち、
//   四捨五入も整数で行う。算式の結果が2人を下回るときは省令ただし書の2人を表示する（附則第94条の特例は注記）。

export const RATIO = {
  infant: 3, // 乳児（0歳児）
  toddler: 6, // 1・2歳児
  age3New: 15, // 3歳児（令和6年4月からの基準）
  age3Old: 20, // 3歳児（経過措置・令和10年3月31日まで）
  age4New: 25, // 4歳以上児（令和6年4月からの基準）
  age4Old: 30, // 4歳以上児（経過措置・当分の間）
};
export const MIN_STAFF = 2; // 第33条第2項ただし書
export const AGE3_TRANSITION_UNTIL = "2028-03-31"; // 令和6年内閣府令第18号 附則第2項
const MAX_CHILDREN = 1000;
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

const blank = (v) => v === "" || v === null || v === undefined;

function parseCount(v, label, errors) {
  if (blank(v)) return 0;
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) {
    errors.push(`${label}の人数は 0 以上の整数で入力してください。`);
    return 0;
  }
  const n = Number(s);
  if (n > MAX_CHILDREN) {
    errors.push(`${label}の人数は ${MAX_CHILDREN.toLocaleString("ja-JP")} 人以下で入力してください。`);
    return 0;
  }
  return n;
}

// 年齢区分ごとの計算。age3/age4 は "new"（15・25）か "old"（20・30）
export function compute(groups, age3 = "new", age4 = "new") {
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
  return {
    rows,
    totalTenths,
    rounded,
    required: Math.max(rounded, MIN_STAFF),
    raisedToMin: rounded < MIN_STAFF,
  };
}

export function calculate({ age0, age1, age2, age3, age4, age5, age3Rule, age4Rule, staff }) {
  const errors = [];
  const c = {
    age0: parseCount(age0, "0歳児", errors),
    age1: parseCount(age1, "1歳児", errors),
    age2: parseCount(age2, "2歳児", errors),
    age3: parseCount(age3, "3歳児", errors),
    age4: parseCount(age4, "4歳児", errors),
    age5: parseCount(age5, "5歳児", errors),
  };
  if (errors.length) return { ok: false, errors };
  const groups = {
    infant: c.age0,
    toddler: c.age1 + c.age2,
    age3: c.age3,
    age4plus: c.age4 + c.age5,
  };
  const totalChildren = groups.infant + groups.toddler + groups.age3 + groups.age4plus;
  if (totalChildren === 0) return { ok: false, errors: ["年齢ごとの子どもの数を入力してください。"] };

  const r3 = age3Rule === "old" ? "old" : "new";
  const r4 = age4Rule === "old" ? "old" : "new";
  const res = {
    ok: true,
    counts: c,
    groups,
    totalChildren,
    rule: { age3: r3, age4: r4 },
    selected: compute(groups, r3, r4),
    newRule: compute(groups, "new", "new"),
    oldRule: compute(groups, "old", "old"),
    staff: null,
  };

  if (!blank(staff)) {
    const st = Math.round(Number(staff) * 10);
    if (!Number.isFinite(st) || st < 0 || st > MAX_STAFF_TENTHS) {
      return { ok: false, errors: ["配置している保育士の数は 0〜1,000 人（0.1人単位）で入力してください。"] };
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
