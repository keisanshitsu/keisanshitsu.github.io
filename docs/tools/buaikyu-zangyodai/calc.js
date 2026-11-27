// 歩合給の割増賃金（残業代）の計算
// （労働基準法 第37条・割増賃金令・労働基準法施行規則 第19条〜第21条）
//
// 条文（e-Gov 法令API v2 で逐語確認・2026-11-27）:
//   労働基準法 第37条（現行 322AC0000000049_20260717_508AC0000000060。未施行の2版 2027-04-01・2028-12-23 でも同文）
//     第1項「…労働時間を延長し、又は休日に労働させた場合においては、その時間又はその日の労働については、通常の労働時間
//       又は労働日の賃金の計算額の二割五分以上五割以下の範囲内でそれぞれ政令で定める率以上の率で計算した割増賃金を支払わなければ
//       ならない。ただし、当該延長して労働させた時間が一箇月について六十時間を超えた場合においては、その超えた時間の労働に
//       ついては、通常の労働時間の賃金の計算額の五割以上の率で計算した割増賃金を支払わなければならない。」
//     第4項「…午後十時から午前五時まで…の間において労働させた場合においては、その時間の労働については、通常の労働時間の
//       賃金の計算額の二割五分以上の率で計算した割増賃金を支払わなければならない。」
//     第5項「第一項及び前項の割増賃金の基礎となる賃金には、家族手当、通勤手当その他厚生労働省令で定める賃金は算入しない。」
//     （中小企業の60時間超の猶予＝旧第138条は本則に無い。附則に「第百三十八条の改正規定 令和五年四月一日」が残るだけ）
//   割増賃金令（平成6年政令第5号・406CO0000000005_20010106_412CO0000000309・未施行の版なし）
//     「…延長した労働時間の労働については二割五分とし、これらの規定により労働させた休日の労働については三割五分とする。」
//   労働基準法施行規則（現行 322M40000100023_20260401_508M60000100057。未施行の1版 2027-04-01 でも第19〜21条は同文）
//     第19条第1項「…通常の労働時間又は通常の労働日の賃金の計算額は、次の各号の金額に…延長した労働時間数若しくは休日の
//       労働時間数又は午後十時から午前五時…までの労働時間数を乗じた金額とする。
//       四 月によつて定められた賃金については、その金額を月における所定労働時間数（月によつて所定労働時間数が異る場合には、
//          一年間における一月平均所定労働時間数）で除した金額
//       六 出来高払制その他の請負制によつて定められた賃金については、その賃金算定期間…において出来高払制その他の請負制に
//          よつて計算された賃金の総額を当該賃金算定期間における、総労働時間数で除した金額
//       七 労働者の受ける賃金が前各号の二以上の賃金よりなる場合には、その部分について各号によつてそれぞれ算定した金額の合計額」
//     第20条「…延長した労働時間が午後十時から午前五時…までの間に及ぶ場合においては、…五割以上（その時間の労働のうち、
//       一箇月について六十時間を超える労働時間の延長に係るものについては、七割五分以上）の率で…」
//       第2項「…休日の労働時間が午後十時から午前五時…までの間に及ぶ場合においては、…六割以上の率で…」
//     第21条「…家族手当及び通勤手当のほか、次に掲げる賃金は、…割増賃金の基礎となる賃金には算入しない。一 別居手当
//       二 子女教育手当 三 住宅手当 四 臨時に支払われた賃金 五 一箇月を超える期間ごとに支払われる賃金」
//
// 歩合給の部分は 1.0 を含めない（割増分だけ）:
//   厚労省 スタートアップ労働条件 Q&A（事業主・賃金 Q14）「歩合給の賃金額は時間外労働分も含めた総労働時間における成果によって
//   計算されるため、100％分については支払い済みであると考えられ、割増賃金としては、割増分のみの支払いで足りるのが原則とされています」
//   （昭23.11.25 基収3052号ほか）。式「１時間あたりの賃金（歩合給の総額 ÷ 総労働時間）×割増率0.25 × 時間外労働時間」
//   兵庫労働局委託の資料の例①: 固定給 91,800÷170×1.25×30＝20,250・91,800÷170×0.25×15＝2,025・
//     歩合給 80,000÷200×0.25×30＝3,000・80,000÷200×0.25×15＝1,500、合計 198,575円（時間外30時間のうち深夜15時間）
//   例②（オール歩合）: 200,000÷200×0.25×30＝7,500・×0.25×15＝3,750、合計 211,250円
//
// 月60時間は法定時間外労働だけで数える（兵庫労働局のリーフレット 002487174.pdf「月60時間の時間外労働時間の算定には、
//   法定休日に行った労働時間は含まれませんが、それ以外の休日に行った労働時間は含まれます。」）
//
// 誤差の向き:
//   - 金額は円の整数、時間は分の整数で持つ。1時間あたりの賃金は分数のまま掛け、途中で丸めない（BigInt）
//   - 率は「時間外 25（60時間超の部分は 50）・休日 35・深夜 25」を足し合わせる（第20条の 5割・7割5分・6割と一致する）
//   - 固定給の部分は時間外・休日の 1.0 を含める（125・150・135）。深夜は所定内でも時間外・休日でも 25 を足すだけ
//   - 表示は円未満を切り上げ（必要な額が少なく見えない側）。合計は端数を持ったまま足してから切り上げる
//   - 総労働時間が時間外＋休日より短い・必要な時間が空欄の入力はエラー（合格に倒さない）

export const RATE = {
  // 割増の率（百分率）。fixed は固定給の部分（1.0 を含む）、piece は歩合給の部分（割増分だけ）
  fixed: { overtime: 125, overtime60: 150, holiday: 135, night: 25 },
  piece: { overtime: 25, overtime60: 50, holiday: 35, night: 25 },
};
export const LIMIT_60H_MIN = 60 * 60; // 第37条第1項ただし書「一箇月について六十時間」
const MAX_HOURS_MIN = 744 * 60; // 31日×24時間
const MAX_YEN = 100_000_000;

export const LABEL = {
  overtime: "時間外（60時間まで）",
  overtime60: "時間外（60時間を超えた分）",
  holiday: "法定休日",
  night: "深夜（22時〜5時）",
};

// 時間（小数可・1分単位）→ 分。空欄は undefined、不正は null
export function parseHours(v) {
  if (v === undefined || v === null || String(v).trim() === "") return undefined;
  const s = String(v).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const x = Number(s) * 60;
  const r = Math.round(x);
  if (Math.abs(x - r) > 1e-9) return null; // 1分単位にならない
  return r;
}

export function parseYen(v) {
  if (v === undefined || v === null || String(v).trim() === "") return undefined;
  const s = String(v).trim().replace(/,/g, "");
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

// 分数 { num, den }（BigInt）の円未満切り上げ
export const ceilYen = ({ num, den }) => Number((num + den - 1n) / den);
const add = (a, b) => ({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
const ZERO = { num: 0n, den: 1n };

// 1行の割増賃金: 基礎の額 yen を基礎の時間 baseMin で割った1時間あたりの賃金 × 時間 min × 率 rate/100
export function premium(yen, baseMin, min, rate) {
  return { num: BigInt(yen) * BigInt(min) * BigInt(rate), den: BigInt(baseMin) * 100n };
}

export function calculate(input = {}) {
  const errors = [];
  const monthly = parseYen(input.monthly);
  const monthlyHours = parseHours(input.monthlyHours);
  const piece = parseYen(input.piece);
  const totalHours = parseHours(input.totalHours);
  const ot = parseHours(input.overtime);
  const hol = parseHours(input.holiday);
  const night = parseHours(input.night);
  const paid = parseYen(input.paid);

  const yenOk = (x) => x === undefined || (x !== null && x <= MAX_YEN);
  if (!yenOk(monthly)) errors.push("固定給は0以上の整数（円）で入力してください。");
  if (!yenOk(piece)) errors.push("歩合給は0以上の整数（円）で入力してください。");
  if (!yenOk(paid)) errors.push("支払われた割増賃金は0以上の整数（円）で入力してください。");
  const hoursOk = (x) => x === undefined || (x !== null && x <= MAX_HOURS_MIN);
  for (const [v, name] of [[monthlyHours, "1か月平均所定労働時間"], [totalHours, "総労働時間"],
    [ot, "法定時間外労働の時間"], [hol, "法定休日労働の時間"], [night, "深夜労働の時間"]]) {
    if (!hoursOk(v)) errors.push(`${name}は「170」「7.75」のように時間で入力してください（1分単位まで・744時間まで）。`);
  }
  if (errors.length) return { ok: false, errors };

  const hasFixed = (monthly ?? 0) > 0;
  const hasPiece = (piece ?? 0) > 0;
  if (!hasFixed && !hasPiece) errors.push("固定給（月給）か歩合給の少なくとも一方を入力してください。");
  if (hasFixed && !(monthlyHours > 0)) errors.push("固定給があるときは、1か月平均所定労働時間を入力してください（施行規則 第19条第1項第4号）。");
  if (hasPiece && !(totalHours > 0)) errors.push("歩合給があるときは、その期間の総労働時間（時間外・休日を含む）を入力してください（施行規則 第19条第1項第6号）。");
  const otMin = ot ?? 0, holMin = hol ?? 0, nightMin = night ?? 0;
  if (!otMin && !holMin && !nightMin) errors.push("法定時間外・法定休日・深夜の労働時間のどれかを入力してください。");
  if (hasPiece && totalHours > 0 && totalHours < otMin + holMin)
    errors.push("総労働時間が、法定時間外と法定休日の労働時間の合計より短くなっています（総労働時間はすべての労働時間の合計です）。");
  if (totalHours > 0 && nightMin > totalHours) errors.push("深夜労働の時間が総労働時間より長くなっています。");
  if (errors.length) return { ok: false, errors };

  const ot60 = Math.max(0, otMin - LIMIT_60H_MIN);
  const otBase = otMin - ot60;
  const hours = { overtime: otBase, overtime60: ot60, holiday: holMin, night: nightMin };

  const parts = [];
  if (hasFixed) parts.push({ kind: "fixed", yen: monthly, baseMin: monthlyHours });
  if (hasPiece) parts.push({ kind: "piece", yen: piece, baseMin: totalHours });

  const lines = [];
  let total = ZERO;
  for (const p of parts) {
    p.perHour = { num: BigInt(p.yen) * 60n, den: BigInt(p.baseMin) }; // 1時間あたりの賃金（円）
    p.subtotal = ZERO;
    for (const key of ["overtime", "overtime60", "holiday", "night"]) {
      const min = hours[key];
      if (!min) continue;
      const rate = RATE[p.kind][key];
      const amount = premium(p.yen, p.baseMin, min, rate);
      lines.push({ part: p.kind, key, min, rate, amount, yen: ceilYen(amount) });
      p.subtotal = add(p.subtotal, amount);
      total = add(total, amount);
    }
    p.subtotalYen = ceilYen(p.subtotal);
  }
  const totalYen = ceilYen(total);
  const wageTotalYen = (monthly ?? 0) + (piece ?? 0) + totalYen;

  const notes = [];
  if (ot60) notes.push({ key: "over60", min: ot60 });

  let comparison = null;
  if (paid !== undefined) {
    comparison = { paid, short: Math.max(0, totalYen - paid), ok: paid >= totalYen };
  }

  return {
    ok: true,
    errors: [],
    parts,
    lines,
    hours,
    total,
    totalYen,
    wageTotalYen,
    comparison,
    notes,
  };
}

// 分数の1時間あたりの賃金を小数第2位まで（四捨五入）の文字列に。表示用
export function fmtPerHour({ num, den }) {
  const x = (num * 100n * 2n + den) / (den * 2n); // ×100 して四捨五入
  const s = x.toString().padStart(3, "0");
  return `${Number(s.slice(0, -2)).toLocaleString("ja-JP")}.${s.slice(-2)}`;
}

export function fmtMin(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}時間${String(r).padStart(2, "0")}分` : `${h}時間`;
}
