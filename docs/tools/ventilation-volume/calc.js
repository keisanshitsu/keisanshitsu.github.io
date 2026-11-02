// 24時間換気の必要換気量の計算（建築基準法施行令 第20条の8 第1項第1号イ）
//
// 条文（e-Gov 法令API v2・2026-11-01 施行版 325CO0000000338_20261101_508CO0000000284 で逐語確認）:
//   「有効換気量…が、次の式によつて計算した必要有効換気量以上であること。 Ｖｒ＝ｎＡｈ」
//   ｎ「住宅等の居室…にあつては〇・五、その他の居室にあつては〇・三」
//   Ａ「居室の床面積（単位　平方メートル）」 ｈ「居室の天井の高さ（単位　メートル）」
//   （２）「一の機械換気設備が二以上の居室に係る場合にあつては、当該換気設備の有効換気量が、
//         当該二以上の居室のそれぞれの必要有効換気量の合計以上であること。」
// 住宅等の居室（令20条の7 第1項第2号 表の備考一）:
//   「住宅の居室並びに下宿の宿泊室、寄宿舎の寝室及び家具その他これに類する物品の販売業を営む店舗の売場
//    （常時開放された開口部を通じてこれらと相互に通気が確保される廊下その他の建築物の部分を含む。）」
// 天井の高さ（令21条）: 「二・一メートル以上」「室の床面から測り、一室で天井の高さの異なる部分がある場合
//   においては、その平均の高さによるものとする。」
//
// 誤差の向き: 浮動小数を避けるため、床面積は 0.01㎡、天井高は 1cm、ｎは 0.1 刻みの整数にして掛ける。
//   必要有効換気量の内部単位は 1e-5 ㎥/h（0.1 × 0.01㎡ × 0.01m）。比較は整数で厳密に行う。
//   表示は 0.1㎥/h に「切り上げ」（必要量を小さく見せない側）、換気回数は「切り捨て」（足りていると見せない側）。

export const N10 = { house: 5, other: 3 }; // ｎ × 10
export const CEILING_MIN_CM = 210; // 令21条1項
export const UNIT_PER_M3H = 100000; // 内部単位（1e-5 ㎥/h）
export const KIND_LABEL = { house: "住宅等の居室（0.5回/h）", other: "その他の居室（0.3回/h）" };

const MAX_AREA_C = 1000000; // 10,000㎡
const MIN_H_CM = 100;
const MAX_H_CM = 2000;
const MAX_FAN_TENTHS = 1000000; // 100,000 ㎥/h

// 入力（㎡・m・㎥/h の数値）を整数の内部単位に直す。0.01 未満は四捨五入。
export const areaC = (m2) => Math.round(Number(m2) * 100);
export const heightCm = (m) => Math.round(Number(m) * 100);
export const fanTenths = (m3h) => Math.round(Number(m3h) * 10);

// 1部屋の必要有効換気量（内部単位）。Vr = n × A × h
export function vrUnits(kind, aC, hCm) {
  return N10[kind] * aC * hCm;
}

// 内部単位 → 0.1㎥/h 単位に切り上げた数値（例 12.26225 → 12.3）
export function ceilTenth(units) {
  return Math.ceil(units / 10000) / 10;
}

// 換気回数 n = V / (A h)。小数第2位までに切り捨て
export function airChanges(fanT, volumeC) {
  // fanT: 0.1㎥/h 単位、volumeC: 1e-4 ㎥ 単位（0.01㎡ × 1cm）
  if (volumeC <= 0) return null;
  // n×100 = (fanT/10) / (volumeC/10000) × 100 = fanT × 100000 / volumeC
  return Math.floor((fanT * 100000) / volumeC) / 100;
}

export function calculate({ rooms, fanM3h }) {
  const errors = [];
  const list = [];
  (rooms || []).forEach((r, i) => {
    const label = r.name && String(r.name).trim() ? String(r.name).trim() : `部屋${i + 1}`;
    const blank = (v) => v === "" || v === null || v === undefined;
    if (blank(r.area) && blank(r.height)) return; // 空行は無視
    const aC = areaC(r.area);
    const hC = heightCm(r.height);
    if (!Number.isFinite(aC) || aC <= 0 || aC > MAX_AREA_C) {
      errors.push(`${label}: 床面積は 0.01〜10,000㎡ で入力してください。`);
      return;
    }
    if (!Number.isFinite(hC) || hC < MIN_H_CM || hC > MAX_H_CM) {
      errors.push(`${label}: 天井の高さは 1〜20m で入力してください。`);
      return;
    }
    const kind = r.kind === "other" ? "other" : "house";
    const units = vrUnits(kind, aC, hC);
    list.push({
      name: label,
      kind,
      areaC: aC,
      heightCm: hC,
      volumeC: aC * hC,
      vrUnits: units,
      vr: ceilTenth(units),
      lowCeiling: hC < CEILING_MIN_CM,
    });
  });

  if (!list.length && !errors.length) errors.push("部屋の床面積と天井の高さを入力してください。");
  if (errors.length) return { ok: false, errors };

  const totalUnits = list.reduce((s, r) => s + r.vrUnits, 0);
  const totalVolumeC = list.reduce((s, r) => s + r.volumeC, 0);
  const res = {
    ok: true,
    rooms: list,
    totalUnits,
    totalVr: ceilTenth(totalUnits),
    totalVolume: totalVolumeC / 10000,
    fan: null,
  };

  const blankFan = fanM3h === "" || fanM3h === null || fanM3h === undefined;
  if (!blankFan) {
    const fT = fanTenths(fanM3h);
    if (!Number.isFinite(fT) || fT <= 0 || fT > MAX_FAN_TENTHS) {
      return { ok: false, errors: ["換気設備の有効換気量は 0.1〜100,000 ㎥/h で入力してください。"] };
    }
    const fanUnits = fT * 10000;
    const enough = fanUnits >= totalUnits;
    res.fan = {
      m3h: fT / 10,
      enough,
      shortfall: enough ? 0 : ceilTenth(totalUnits - fanUnits),
      airChanges: airChanges(fT, totalVolumeC),
    };
  }
  return res;
}
