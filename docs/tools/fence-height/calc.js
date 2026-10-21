// 目隠しフェンスの必要な高さ（見る人の目の高さと距離から、隠したい物の上端を隠す高さ）
//
// 計算は断面（真横から見た1本の視線）の相似だけで、法令の数値は使わない。
// 既定値に使う目の高さの出典（2026-10-21 に統計表を読んで確認）:
//   産総研 AIST人体寸法データベース1991-92 B2「内眼角高」（定義: 床面から内眼角点までの高さ。立位・裸足）
//     https://www.airc.aist.go.jp/dhrt/91-92/data/list.html （統計表は gif/B2.gif）
//     青年 男: 平均 1596.4mm・95パーセンタイル 1699.0mm ／ 青年 女: 平均 1476.3mm・95パーセンタイル 1575.0mm
//     高齢 男: 平均 1476.1mm ／ 高齢 女: 平均 1362.5mm
//
// 座標: フェンスの根元の地面を高さ 0、フェンスの位置を x = 0 とする。
//   見る人の目   (−a, E)   E ＝ 見る人の足元の高さ ＋ 目の高さ
//   隠したい物の上端 (b, T)
//   視線がフェンスの位置を通る高さ ＝ E ＋ (T − E) × a ÷ (a ＋ b)
//   フェンスの上端がこの高さ以上なら、その点は隠れる。
//
// 隠したい物の上端を隠せば、それより下の点も隠れる（上の式は T について増加なので）。
// 見る人の距離 a については単調（T > E なら増加、T < E なら減少）なので、
// 距離を範囲で入れたときの最大は範囲の両端のどちらかに出る。両端を計算して大きいほうを採る。
//
// 逆算（フェンスの高さ H が決まっているとき、隠れる高さの上限）:
//   a > 0 のとき  E ＋ (H − E) × (a ＋ b) ÷ a
//   a = 0 のとき  H ≧ E なら上限なし（全部隠れる）、H < E なら何も隠れない
//   距離の範囲では両端の小さいほうを採る（上の式も a について単調）。
//
// 誤差の向き: 必要な高さは cm 未満を切り上げ、隠れる高さは切り捨て。
// 既定の目の高さは青年男性の95パーセンタイル（平均より高い）。データは裸足なので、靴の分だけ実際の目は高い。

// AIST B2 内眼角高（cm に丸めた値。表示用に mm も持つ）
export const EYE = {
  male95: { label: "背の高い男性（青年男性の95%）", mm: 1699.0, cm: 170 },
  maleMean: { label: "男性の平均（青年）", mm: 1596.4, cm: 160 },
  femaleMean: { label: "女性の平均（青年）", mm: 1476.3, cm: 148 },
  female95: { label: "背の高い女性（青年女性の95%）", mm: 1575.0, cm: 158 },
  elderMaleMean: { label: "男性の平均（60歳以上）", mm: 1476.1, cm: 148 },
  elderFemaleMean: { label: "女性の平均（60歳以上）", mm: 1362.5, cm: 136 },
};

// 民法 第225条第2項（協議が調わないときの囲障の高さ）
export const CIVIL_225_HEIGHT_CM = 200;

export const LIMITS = {
  eyeCm: [50, 250],
  levelCm: [-500, 2000],
  observerDistCm: [0, 10000],
  targetDistCm: [1, 10000],
  targetTopCm: [-500, 2000],
  fenceCm: [1, 1000],
};

// 視線がフェンスの位置を通る高さ（cm・丸めない）
export function sightHeightAtFence(E, T, a, b) {
  return E + ((T - E) * a) / (a + b);
}

// フェンスの高さ H で隠れる上端（cm・丸めない）。Infinity / -Infinity を返すことがある。
export function hiddenUpTo(E, H, a, b) {
  if (a === 0) return H >= E ? Infinity : -Infinity;
  return E + ((H - E) * (a + b)) / a;
}

function within(name, v, [lo, hi], errors) {
  if (!Number.isFinite(v)) errors.push(`${name}を数値で入力してください。`);
  else if (v < lo || v > hi) errors.push(`${name}は ${lo}〜${hi} の範囲で入力してください。`);
}

const intOrNaN = (v) => (v === "" || v == null ? NaN : Math.round(Number(v)));
// 浮動小数の誤差で 1cm 切り上がらないように、1e-9 だけ丸めてから切り上げ・切り捨てる
const ceilCm = (x) => Math.ceil(x - 1e-9);
const floorCm = (x) => Math.floor(x + 1e-9);

// input: { eyeCm, observerLevelCm, nearCm, farCm, targetDistCm, targetTopCm, fenceCm（任意・空欄可） }
//   すべて cm。observerLevelCm と targetTopCm はフェンスの根元の地面からの高さ（低ければ負）。
export function calculate(input) {
  const errors = [];
  const eyeCm = intOrNaN(input.eyeCm);
  const observerLevelCm = intOrNaN(input.observerLevelCm);
  const nearCm = intOrNaN(input.nearCm);
  const farRaw = input.farCm === "" || input.farCm == null ? input.nearCm : input.farCm;
  const farCm = intOrNaN(farRaw);
  const targetDistCm = intOrNaN(input.targetDistCm);
  const targetTopCm = intOrNaN(input.targetTopCm);
  const hasFence = !(input.fenceCm === "" || input.fenceCm == null);
  const fenceCm = hasFence ? intOrNaN(input.fenceCm) : null;

  within("見る人の目の高さ(cm)", eyeCm, LIMITS.eyeCm, errors);
  within("見る人の足元の高さ(cm)", observerLevelCm, LIMITS.levelCm, errors);
  within("フェンスまでのいちばん近い距離(cm)", nearCm, LIMITS.observerDistCm, errors);
  within("フェンスまでのいちばん遠い距離(cm)", farCm, LIMITS.observerDistCm, errors);
  within("フェンスから隠したい物までの距離(cm)", targetDistCm, LIMITS.targetDistCm, errors);
  within("隠したい物の上端の高さ(cm)", targetTopCm, LIMITS.targetTopCm, errors);
  if (hasFence) within("フェンスの高さ(cm)", fenceCm, LIMITS.fenceCm, errors);
  if (!errors.length && nearCm > farCm) errors.push("いちばん近い距離は、いちばん遠い距離以下にしてください。");
  if (errors.length) return { ok: false, errors };

  const E = observerLevelCm + eyeCm;
  const T = targetTopCm;
  const b = targetDistCm;
  const at = (a) => ({ distCm: a, sightCm: sightHeightAtFence(E, T, a, b) });
  const ends = nearCm === farCm ? [at(nearCm)] : [at(nearCm), at(farCm)];
  const worst = ends.reduce((p, q) => (q.sightCm > p.sightCm ? q : p));
  const requiredCm = Math.max(0, ceilCm(worst.sightCm));

  // 距離の範囲を5等分した表（両端を含む）
  const steps = [];
  const k = nearCm === farCm ? 0 : 4;
  for (let i = 0; i <= k; i++) {
    const a = k === 0 ? nearCm : Math.round(nearCm + ((farCm - nearCm) * i) / k);
    steps.push({ distCm: a, requiredCm: Math.max(0, ceilCm(sightHeightAtFence(E, T, a, b))) });
  }

  // 見下ろしているか（目が隠したい物の上端より高い）
  const lookingDown = E > T;

  let check = null;
  if (hasFence) {
    const hs = ends.map((x) => hiddenUpTo(E, fenceCm, x.distCm, b));
    const lim = Math.min(...hs);
    check = {
      fenceCm,
      hides: fenceCm >= requiredCm,
      shortCm: Math.max(0, requiredCm - fenceCm),
      hiddenUpToCm: Number.isFinite(lim) ? floorCm(lim) : lim,
    };
  }

  return {
    ok: true,
    input: { eyeCm, observerLevelCm, nearCm, farCm, targetDistCm, targetTopCm, fenceCm, hasFence },
    eyeLevelCm: E,
    lookingDown,
    worstDistCm: worst.distCm,
    requiredCm,
    over225: requiredCm > CIVIL_225_HEIGHT_CM,
    steps,
    check,
  };
}
