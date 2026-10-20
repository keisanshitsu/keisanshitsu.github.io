// 駐車スペースの寸法と台数（車庫証明の「全体を収容」と、国交省 駐車場設計・施工指針の駐車ます）
//
// 根拠（2026-10-20 に逐語確認）:
//   自動車の保管場所の確保等に関する法律施行令（昭和37年政令第329号）第1条第2号（e-Gov 法令API v2・現行 2026-05-27 施行版）
//     https://laws.e-gov.go.jp/api/2/law_data/337CO0000000329
//     「当該自動車が法令の規定により通行することができないこととされる道路以外の道路から当該自動車を支障なく出入させ、
//       かつ、その全体を収容することができるものであること。」
//   道路運送車両法施行規則（昭和26年運輸省令第74号）別表第一（e-Gov 法令API v2・現行 2026-10-20 施行版）
//     https://laws.e-gov.go.jp/api/2/law_data/326M50000800074
//     小型自動車 長さ 四・七〇メートル以下 幅 一・七〇メートル以下 高さ 二・〇〇メートル以下
//     軽自動車   長さ 三・四〇メートル以下 幅 一・四八メートル以下 高さ 二・〇〇メートル以下
//   国土交通省「駐車場設計・施工指針」（平成4年6月10日 道企発第40号・改正 平成6年9月28日 道企発第63号）
//     https://www.mlit.go.jp/road/sign/kijyun/pdf/19920610tyuusyajou.pdf
//     2.4.2「駐車ますの大きさは、設計対象車両に応じて、表－２．４．１に示す値以上とすることを原則とする。」
//       表-2.4.1（長さ・幅員 m）: 軽自動車 3.6・2.0／小型乗用車 5.0・2.3／普通乗用車 6.0・2.5
//     2.4.3 表-2.4.2 天井の有効高さ（車室 m）: 軽自動車 2.1／小型乗用車 2.1／普通乗用車 2.2
//
// 改正状況（2026-10-20 確認）: 車庫法施行令は未施行の改正なし。施行規則は 2027-01-01 施行の改正版でも別表第一は同一。
//
// ⚠ 指針は道路附属物としての駐車場（公共駐車場）の設計指針であって、自宅の車庫に義務として掛かるものではない。
// 本ツールでは「ゆとりの目安」として比べる。車庫証明の要件（施行令第1条第2号）とは別の物差しとして並べる。
//
// 計算（長さはすべて cm の整数で行う）:
//   並列（横に並べる）: 必要な幅 ＝ Σ 幅、必要な奥行 ＝ max 長さ
//   縦列（前後に並べる）: 必要な幅 ＝ max 幅、必要な奥行 ＝ Σ 長さ
//   車庫証明の目安 … 車体の全長・全幅をそのまま使う（車どうし・壁との隙間 0 ＝ 最も甘い条件）
//   指針の枠       … 区分ごとの駐車ますの長さ・幅員を使う
//   天井（屋根がある場合だけ）: 車庫証明の目安は max 全高 ≦ 天井、指針は max 有効高さ ≦ 天井
//   何台入るか（指針の枠を格子に並べる）: floor(間口 ÷ ます幅) × floor(奥行 ÷ ます長さ)
//
// 誤差の向き: 車庫証明の目安は隙間 0 で判定するので「収まる」と出ても出し入れできるとは限らない（甘い側）。
// 本文と結果欄に明記する。ドアの開閉に要る幅は公的な数値が無いので判定せず、両脇に残る幅を示すだけにする。
//
// 扱わないもの: 「支障なく出入させ」（前面道路との関係）、使用の本拠から2km以内（同条第1号）、車路の幅員、
// 車いす使用者用の駐車ます、小型貨物車以上。

// 指針 表-2.4.1・表-2.4.2（cm）
export const GUIDE = {
  kei: { label: "軽自動車", lengthCm: 360, widthCm: 200, ceilingCm: 210 },
  small: { label: "小型乗用車", lengthCm: 500, widthCm: 230, ceilingCm: 210 },
  normal: { label: "普通乗用車", lengthCm: 600, widthCm: 250, ceilingCm: 220 },
};

// 施行規則 別表第一の上限（cm）。普通自動車は「小型・軽…以外」なので上限を持たない（null）。
export const CLASS_MAX = {
  kei: { lengthCm: 340, widthCm: 148, heightCm: 200 },
  small: { lengthCm: 470, widthCm: 170, heightCm: 200 },
  normal: null,
};

// 別表第一の種別名（指針の「小型乗用車」とは呼び方が違う）
export const CLASS_LABEL = { kei: "軽自動車", small: "小型自動車", normal: "普通自動車" };

export const LIMITS = {
  spaceCm: [100, 5000],
  ceilingCm: [100, 1000],
  carLengthCm: [200, 800],
  carWidthCm: [100, 260],
  carHeightCm: [100, 400],
  cars: [1, 3],
};

// 並べ方に応じて必要な幅・奥行（cm）を出す。items は { lengthCm, widthCm } の配列。
export function footprint(items, layout) {
  const ws = items.map((x) => x.widthCm);
  const ls = items.map((x) => x.lengthCm);
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  return layout === "series"
    ? { widthCm: Math.max(...ws), depthCm: sum(ls) }
    : { widthCm: sum(ws), depthCm: Math.max(...ls) };
}

// 格子に並べたときの台数。
export function gridCount(spaceWidthCm, spaceDepthCm, boxWidthCm, boxLengthCm) {
  const across = Math.floor(spaceWidthCm / boxWidthCm);
  const deep = Math.floor(spaceDepthCm / boxLengthCm);
  return { across, deep, total: across * deep };
}

// 寸法がその区分の上限に収まっているか（普通自動車は常に true）。
export function withinClass(cls, car) {
  const m = CLASS_MAX[cls];
  if (!m) return true;
  return car.lengthCm <= m.lengthCm && car.widthCm <= m.widthCm && (car.heightCm == null || car.heightCm <= m.heightCm);
}

function within(name, v, [lo, hi], errors) {
  if (!Number.isFinite(v)) errors.push(`${name}を数値で入力してください。`);
  else if (v < lo || v > hi) errors.push(`${name}は ${lo}〜${hi} の範囲で入力してください。`);
}

const intOrNaN = (v) => (v === "" || v == null ? NaN : Math.round(Number(v)));

// input: { spaceWidthCm, spaceDepthCm, ceilingCm（屋根なしは null/""）, layout: "parallel"|"series",
//          cars: [{ cls: "kei"|"small"|"normal", lengthCm, widthCm, heightCm }] }
export function calculate(input) {
  const errors = [];
  const spaceWidthCm = intOrNaN(input.spaceWidthCm);
  const spaceDepthCm = intOrNaN(input.spaceDepthCm);
  const hasRoof = !(input.ceilingCm === "" || input.ceilingCm == null);
  const ceilingCm = hasRoof ? intOrNaN(input.ceilingCm) : null;
  const layout = input.layout === "series" ? "series" : "parallel";
  const rawCars = Array.isArray(input.cars) ? input.cars : [];

  within("駐車スペースの間口(cm)", spaceWidthCm, LIMITS.spaceCm, errors);
  within("駐車スペースの奥行(cm)", spaceDepthCm, LIMITS.spaceCm, errors);
  if (hasRoof) within("屋根の下端までの高さ(cm)", ceilingCm, LIMITS.ceilingCm, errors);
  if (rawCars.length < LIMITS.cars[0] || rawCars.length > LIMITS.cars[1]) errors.push("車は1〜3台で入力してください。");

  const cars = rawCars.map((c, i) => {
    const cls = c.cls in GUIDE ? c.cls : null;
    const car = {
      cls,
      lengthCm: intOrNaN(c.lengthCm),
      widthCm: intOrNaN(c.widthCm),
      heightCm: c.heightCm === "" || c.heightCm == null ? null : intOrNaN(c.heightCm),
    };
    const nm = `${i + 1}台目の`;
    if (!cls) errors.push(`${nm}区分を選んでください。`);
    within(`${nm}全長(cm)`, car.lengthCm, LIMITS.carLengthCm, errors);
    within(`${nm}全幅(cm)`, car.widthCm, LIMITS.carWidthCm, errors);
    if (car.heightCm != null) within(`${nm}全高(cm)`, car.heightCm, LIMITS.carHeightCm, errors);
    if (hasRoof && car.heightCm == null) errors.push(`屋根があるときは${nm}全高を入力してください。`);
    const measured = Number.isFinite(car.lengthCm) && Number.isFinite(car.widthCm) &&
      (car.heightCm == null || Number.isFinite(car.heightCm));
    if (cls && measured && !withinClass(cls, car))
      errors.push(`${nm}寸法が${CLASS_LABEL[cls]}の上限（道路運送車両法施行規則 別表第一）を超えています。区分か寸法を確認してください。`);
    return car;
  });
  if (errors.length) return { ok: false, errors };

  // 車庫証明の目安（車体そのもの・隙間 0）
  const body = footprint(cars, layout);
  const maxHeightCm = hasRoof ? Math.max(...cars.map((c) => c.heightCm)) : null;
  const garage = {
    needWidthCm: body.widthCm,
    needDepthCm: body.depthCm,
    spareWidthCm: spaceWidthCm - body.widthCm,
    spareDepthCm: spaceDepthCm - body.depthCm,
    needHeightCm: maxHeightCm,
    spareHeightCm: hasRoof ? ceilingCm - maxHeightCm : null,
  };
  garage.fits = garage.spareWidthCm >= 0 && garage.spareDepthCm >= 0 && (!hasRoof || garage.spareHeightCm >= 0);

  // 指針の駐車ます
  const boxes = cars.map((c) => ({ widthCm: GUIDE[c.cls].widthCm, lengthCm: GUIDE[c.cls].lengthCm }));
  const g = footprint(boxes, layout);
  const guideCeilingCm = Math.max(...cars.map((c) => GUIDE[c.cls].ceilingCm));
  const guide = {
    needWidthCm: g.widthCm,
    needDepthCm: g.depthCm,
    spareWidthCm: spaceWidthCm - g.widthCm,
    spareDepthCm: spaceDepthCm - g.depthCm,
    needHeightCm: hasRoof ? guideCeilingCm : null,
    spareHeightCm: hasRoof ? ceilingCm - guideCeilingCm : null,
  };
  guide.fits = guide.spareWidthCm >= 0 && guide.spareDepthCm >= 0 && (!hasRoof || guide.spareHeightCm >= 0);

  // 車ごと: 指針の枠の中で車体のまわりに残る幅・長さ
  const perCar = cars.map((c) => ({
    ...c,
    boxWidthCm: GUIDE[c.cls].widthCm,
    boxLengthCm: GUIDE[c.cls].lengthCm,
    sideSpareCm: GUIDE[c.cls].widthCm - c.widthCm,
    endSpareCm: GUIDE[c.cls].lengthCm - c.lengthCm,
  }));

  // 区分ごとに、指針の枠で何台入るか
  const capacity = Object.fromEntries(
    Object.entries(GUIDE).map(([k, v]) => [k, {
      ...gridCount(spaceWidthCm, spaceDepthCm, v.widthCm, v.lengthCm),
      ceilingOk: hasRoof ? ceilingCm >= v.ceilingCm : null,
    }]),
  );

  return {
    ok: true,
    input: { spaceWidthCm, spaceDepthCm, ceilingCm, hasRoof, layout, cars },
    garage,
    guide,
    perCar,
    capacity,
  };
}
