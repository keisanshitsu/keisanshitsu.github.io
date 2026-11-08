// 派遣の3年ルール（抵触日）の計算（労働者派遣法 第35条の3・第40条の2・第40条の3）
//
// 条文（e-Gov 法令API v2・現行 360AC0000000088_20261001_507AC0000000063＝2026-10-01 施行版で逐語確認）:
//   第35条の3「派遣元事業主は、派遣先の事業所その他派遣就業の場所における組織単位ごとの業務について、三年を超える
//     期間継続して同一の派遣労働者に係る労働者派遣（第四十条の二第一項各号のいずれかに該当するものを除く。）を
//     行つてはならない。」（個人単位。第40条の3 は派遣先の側から同じことを定め、延長された場合も変わらない）
//   第40条の2第1項「派遣先は、…事業所その他派遣就業の場所ごとの業務について、派遣元事業主から派遣可能期間を超える
//     期間継続して労働者派遣の役務の提供を受けてはならない。ただし、…各号のいずれかに該当するものであるときは、
//     この限りでない。」 第2項「前項の派遣可能期間…は、三年とする。」
//   第40条の2第3項 延長: 「…労働者派遣の役務の提供が開始された日（…延長した場合にあつては、当該延長前の派遣可能期間が
//     経過した日）以後…第一項の規定に抵触することとなる最初の日の一月前の日までの間（…「意見聴取期間」という。）に、
//     …三年を限り、派遣可能期間を延長することができる。…更に延長しようとするときも、同様とする。」
//   第40条の2第5項 異議への説明: 「延長前の派遣可能期間が経過することとなる日の前日までに」
//     業務取扱要領 第7（令和8年10月適用版）は「事業所単位の期間制限の抵触日の前日までに」と書く
//   例外（第40条の2第1項各号）: 無期雇用派遣労働者／60歳以上（施行規則 第32条の4「六十歳以上の者とする。」・現行
//     361M50002000020_20261001_508M60000100087）／有期プロジェクト／日数限定業務／産前産後・育児・介護休業等の代替
//
// 3か月の空白（派遣先が講ずべき措置に関する指針 第2の14(3)(4)・最終改正 令和8年厚生労働省告示第201号の PDF で逐語確認）:
//   「新たな労働者派遣の開始と当該新たな労働者派遣の役務の受入れの直前に受け入れていた労働者派遣の終了との間の
//     期間が３月を超えない場合には、…継続して労働者派遣の役務の提供を受けているものとみなすこと。」
//   業務取扱要領 第7の6(4)イ(イ)（令和8年10月適用版の PDF で逐語確認）: 「同一の派遣労働者について、派遣先の同一の組織単位に
//     おける就業の日と次回の就業の日との間の期間が３箇月以下であれば、…継続して…みなす。この場合、同一の派遣労働者に
//     ついて、派遣元事業主が異なる場合であっても同一の派遣労働者と評価されることに留意すること。」
//   → 空白がちょうど3か月なら継続（数え直さない）。3か月を1日でも超えれば数え直し。派遣会社が変わっても数え直さない。
//
// 日付の数え方（条文にも業務取扱要領 第7 にも計算例が無いので、民法で導く。現行 129AC0000000089_20260624 で逐語確認）:
//   民法 第140条「…期間の初日は、算入しない。ただし、その期間が午前零時から始まるときは、この限りでない。」
//     → 派遣は開始日の午前零時から始まるので、開始日を1日目に数える
//   民法 第143条第2項「…その起算日に応当する日の前日に満了する。ただし、月又は年によって期間を定めた場合において、
//     最後の月に応当する日がないときは、その月の末日に満了する。」
//   抵触日＝「抵触することとなる最初の日」（第26条第4項・第34条第1項）＝3年の満了日の翌日。
//     例: 2026-04-01 開始 → 満了 2029-03-31 → 抵触日 2029-04-01
//         2028-02-29 開始 → 2031年2月に応当日が無い → 満了 2031-02-28 → 抵触日 2031-03-01
//
// 誤差の向き: 日付は整数の年月日で持ち、時刻とタイムゾーンを使わない（日数の差だけ Date.UTC で数える）。
//   意見聴取期間の終わり（抵触日の一月前の日）は、前の月に応当日が無いとき（抵触日が3月31日など）その月の末日にする。
//   民法に後ろ向きの規定が無いので、早いほうの日（期限を短く見る側）に倒した。

export const PERIOD_YEARS = 3; // 第40条の2第2項・第35条の3
export const GAP_MONTHS = 3; // 派遣先指針 第2の14(3)(4)「３月を超えない場合」
export const REFORM_START = "2015-09-30"; // 平成27年改正法の施行日（それより前の契約は旧法の経過措置）
export const AGE_EXEMPT = 60; // 施行規則 第32条の4
const MAX_EXTENSIONS = 5;
const MAX_YEAR = 2100;

export const KINDS = {
  fixed: { exempt: false, label: "有期雇用の派遣（派遣会社との契約に期間がある）" },
  indefinite: { exempt: true, label: "無期雇用の派遣（派遣会社に期間の定めなく雇われている）", basis: "第40条の2第1項第1号" },
  age60: { exempt: true, label: "60歳以上の人", basis: "第40条の2第1項第2号・施行規則 第32条の4" },
  project: { exempt: true, label: "有期プロジェクトの業務", basis: "第40条の2第1項第3号イ" },
  fewdays: { exempt: true, label: "日数限定の業務", basis: "第40条の2第1項第3号ロ" },
  leave: { exempt: true, label: "産休・育休・介護休業などの代わり", basis: "第40条の2第1項第4号・第5号" },
};

export function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

// "YYYY-MM-DD" → {y, m, d}。実在しない日付・範囲外は null
export function parseDate(s) {
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "").trim());
  if (!mt) return null;
  const y = Number(mt[1]), m = Number(mt[2]), d = Number(mt[3]);
  if (y < 1900 || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function fmt(dt) {
  return `${dt.y}-${String(dt.m).padStart(2, "0")}-${String(dt.d).padStart(2, "0")}`;
}

export function cmp(a, b) {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

const dayNumber = (dt) => Date.UTC(dt.y, dt.m - 1, dt.d) / 86400000;

// b − a の日数
export function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}

export function nextDay(dt) {
  if (dt.d < daysInMonth(dt.y, dt.m)) return { y: dt.y, m: dt.m, d: dt.d + 1 };
  if (dt.m < 12) return { y: dt.y, m: dt.m + 1, d: 1 };
  return { y: dt.y + 1, m: 1, d: 1 };
}

export function prevDay(dt) {
  if (dt.d > 1) return { y: dt.y, m: dt.m, d: dt.d - 1 };
  if (dt.m > 1) return { y: dt.y, m: dt.m - 1, d: daysInMonth(dt.y, dt.m - 1) };
  return { y: dt.y - 1, m: 12, d: 31 };
}

// 起算日 start（その日を1日目に数える）から months か月の期間の満了日（民法 第143条第2項）
export function periodEnd(start, months) {
  const idx = start.m - 1 + months;
  const y = start.y + Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  if (start.d <= daysInMonth(y, m)) return prevDay({ y, m, d: start.d }); // 応当日の前日
  return { y, m, d: daysInMonth(y, m) }; // 応当日が無い → その月の末日
}

// 起算日から years 年の期間に「抵触することとなる最初の日」＝満了日の翌日
export function teishokubi(start, years = PERIOD_YEARS) {
  return nextDay(periodEnd(start, 12 * years));
}

// 抵触日の「一月前の日」（第40条の2第3項）。前の月に応当日が無いときはその月の末日（早いほうに倒す）
export function oneMonthBefore(dt) {
  const y = dt.m === 1 ? dt.y - 1 : dt.y;
  const m = dt.m === 1 ? 12 : dt.m - 1;
  return { y, m, d: Math.min(dt.d, daysInMonth(y, m)) };
}

// 前の派遣の終了日 prevEnd と次の派遣の開始日 nextStart の間の空白が3か月を超えるか（派遣先指針 第2の14(3)(4)）
//   空白は prevEnd の翌日から nextStart の前日まで。その空白が「3月を超えない」なら継続とみなす。
//   lastContinuousStart: この日までに次の派遣が始まれば継続（＝空白がちょうど3か月になる開始日）
//   earliestResetStart: この日以後に始まれば数え直し
export function gapCheck(prevEnd, nextStart) {
  const gapStart = nextDay(prevEnd);
  const gapLimitEnd = periodEnd(gapStart, GAP_MONTHS); // 3か月の空白の最後の日
  const lastContinuousStart = nextDay(gapLimitEnd);
  const earliestResetStart = nextDay(lastContinuousStart);
  const gapDays = daysBetween(prevEnd, nextStart) - 1;
  return {
    gapDays,
    lastContinuousStart,
    earliestResetStart,
    continuous: cmp(nextStart, lastContinuousStart) <= 0,
  };
}

// 事業所単位: 受入開始日から3年。延長は1回につき3年（3年より短い延長は扱わない）
export function siteDates(siteStart, extensions) {
  let start = siteStart;
  let t = teishokubi(start);
  const chain = [fmt(t)];
  for (let i = 0; i < extensions; i++) {
    start = t; // 「延長前の派遣可能期間が経過した日」から次の3年
    t = teishokubi(start);
    chain.push(fmt(t));
  }
  return { teishokubi: t, chain, currentPeriodStart: start };
}

export function calculate(input) {
  const errors = [];
  const kind = KINDS[input.kind] ? input.kind : "fixed";
  const today = parseDate(input.today);
  if (!today) errors.push("今日の日付を読み取れません。");

  if (KINDS[kind].exempt) {
    if (errors.length) return { ok: false, errors };
    return { ok: true, exempt: true, kind, basis: KINDS[kind].basis, label: KINDS[kind].label };
  }

  const personRaw = String(input.personStart ?? "").trim();
  const siteRaw = String(input.siteStart ?? "").trim();
  const prevEndRaw = String(input.prevEnd ?? "").trim();

  const personStart = parseDate(personRaw);
  if (!personRaw) errors.push("いまの課（組織単位）で派遣として働き始めた日を入力してください。");
  else if (!personStart) errors.push("働き始めた日を読み取れません。実在する日付を入れてください。");

  const siteStart = siteRaw ? parseDate(siteRaw) : null;
  if (siteRaw && !siteStart) errors.push("事業所が派遣を受け入れ始めた日を読み取れません。");

  const prevStartRaw = String(input.prevStart ?? "").trim();
  const prevStart = prevStartRaw ? parseDate(prevStartRaw) : null;
  if (prevStartRaw && !prevStart) errors.push("前の派遣を始めた日を読み取れません。");
  const prevEnd = prevEndRaw ? parseDate(prevEndRaw) : null;
  if (prevEndRaw && !prevEnd) errors.push("前の派遣が終わった日を読み取れません。");
  if (Boolean(prevStartRaw) !== Boolean(prevEndRaw))
    errors.push("同じ課での前の派遣は、始めた日と終わった日の両方を入れてください（どちらも空なら、前の派遣は無いものとして計算します）。");
  if (prevStart && prevEnd && cmp(prevStart, prevEnd) > 0) errors.push("前の派遣を始めた日が、終わった日より後になっています。");

  const ext = Number(input.extensions ?? 0);
  if (!Number.isInteger(ext) || ext < 0 || ext > MAX_EXTENSIONS) errors.push(`延長の回数は0〜${MAX_EXTENSIONS}回で選んでください。`);

  const reform = parseDate(REFORM_START);
  for (const [dt, name] of [[personStart, "働き始めた日"], [siteStart, "事業所の受入開始日"], [prevStart, "前の派遣を始めた日"]]) {
    if (dt && cmp(dt, reform) < 0)
      errors.push(`${name}が2015年9月30日より前です。改正法の期間制限は施行日以後に結ばれた・更新された派遣契約から適用されるので、このツールでは扱いません。`);
  }
  if (personStart && siteStart && cmp(siteStart, personStart) > 0)
    errors.push("事業所が派遣を受け入れ始めた日は、あなたが働き始めた日と同じか、それより前のはずです。");
  if (prevEnd && personStart && cmp(prevEnd, personStart) >= 0)
    errors.push("前の派遣が終わった日は、いまの派遣を始めた日より前の日付にしてください。");
  if (errors.length) return { ok: false, errors };

  // 同じ課での前の派遣との空白: 3か月以内なら継続とみなし、個人の起算日は前の派遣の開始日までさかのぼる
  let gap = null;
  let personFrom = personStart;
  if (prevStart && prevEnd) {
    gap = gapCheck(prevEnd, personStart);
    if (gap.continuous) personFrom = prevStart;
  }

  const person = { start: personFrom, currentStart: personStart, teishokubi: teishokubi(personFrom) };
  person.lastDay = prevDay(person.teishokubi);
  if (siteStart && cmp(siteStart, personFrom) > 0)
    return { ok: false, errors: ["前の派遣とつながっているので、事業所が派遣を受け入れ始めた日は、前の派遣を始めた日と同じか、それより前のはずです。"] };

  let site = null;
  if (siteStart) {
    const s = siteDates(siteStart, ext);
    site = {
      start: siteStart,
      extensions: ext,
      teishokubi: s.teishokubi,
      chain: s.chain,
      lastDay: prevDay(s.teishokubi),
      hearingFrom: s.currentPeriodStart, // 意見聴取期間の始まり（受入開始日、延長後は延長前の期間が経過した日）
      hearingDeadline: oneMonthBefore(s.teishokubi), // 意見聴取期間の終わり＝抵触日の一月前の日
      explainDeadline: prevDay(s.teishokubi), // 異議への説明＝抵触日の前日まで
    };
  }

  // 先に来るほうの抵触日で、いまの課で働けなくなる（個人単位は延長できない）
  let binding = { by: "person", teishokubi: person.teishokubi };
  if (site && cmp(site.teishokubi, person.teishokubi) < 0) binding = { by: "site", teishokubi: site.teishokubi };
  binding.lastDay = prevDay(binding.teishokubi);
  binding.daysLeft = daysBetween(today, binding.teishokubi); // 抵触日まで（0以下なら抵触日を過ぎている）

  return {
    ok: true,
    exempt: false,
    kind,
    today,
    person,
    site,
    binding,
    gap,
  };
}
