// 屋根面積（勾配・形状対応）の計算ロジック
//
// このファイルはブラウザとテストの両方から読み込まれる。
// 「テストしたコード」と「出荷したコード」を必ず同一にするため、
// 計算式を HTML 側に複製してはならない。
//
// ── このツールが外部の数値にほとんど依存しない理由 ────────────────────
// 本ツールの中核は幾何であり、業界の慣行値や製品カタログの数字を持たない。
// 唯一の外部定数は坪への換算だけで、それも「参考値」として扱う（下記）。
// したがって「出典が古くなって間違いになる」種類の壊れ方をしない。
//
// ── 根拠1: 実面積 ＝ 水平投影面積 × 勾配係数（同一勾配なら形状によらず厳密）──
// 水平面に対して角度 θ で傾いた平面図形は、真上から見た影の面積が
// （もとの面積）× cosθ になる。したがって
//     実面積 ＝ 投影面積 ÷ cosθ
// 屋根が複数の面に分かれていても、すべての面の勾配が等しければ
// 各面について同じ式が成り立ち、影を足し合わせたものが建物の水平投影面積になる。
//     Σ(実面積_i) ＝ Σ(投影面積_i) ÷ cosθ ＝ 水平投影面積 ÷ cosθ
// つまり切妻でも寄棟でも入母屋でも、勾配が同じなら答えは同じ式で出る。
// 「寄棟は面が4つあって複雑」という説明をよく見るが、面積に関しては複雑ではない。
//
// ── 根拠2: 勾配係数（伸び率）＝ √(1 + (寸/10)²) ────────────────────
// 寸勾配は「水平に10進むあいだに垂直に n 上がる」という表し方なので tanθ ＝ n/10。
//     1/cosθ ＝ √(1 + tan²θ) ＝ √(1 + (n/10)²)
// 3寸なら √1.09 ≒ 1.0440、4寸なら √1.16 ≒ 1.0770、5寸なら √1.25 ≒ 1.1180。
//
// ── 根拠3: 坪は法定計量単位ではない（経済産業省・2026-09-17 確認）─────────
//   https://www.meti.go.jp/policy/economy/hyojun/techno_infra/11_gaiyou_tani2.html
//   「計量法では第８条第１項において『法定計量単位以外の計量単位（非法定計量単位）は、
//    第２条第１項第１号に掲げる物象の状態の量について、取引又は証明に用いてはならない。』
//    と、定めており、７２の物象の状態の量について、取引又は証明において
//    非法定計量単位の使用を禁止している。」
//   同ページは同時に、何が「取引又は証明」に当たらないかも示している——
//   「『真実である旨を表明すること』とは、真実であることについて一定の法的責任等を
//    伴って表明すること。参考値を示すなど、単なる事実の表明は該当しない。」
//   よって本ツールは ㎡ を主たる出力とし、坪は参考値として併記する。
//   換算 1坪 ＝ 400/121 ㎡ ≒ 3.3058 ㎡ は、1尺＝10/33m（明治24年 度量衡法）に
//   由来する慣行値であり、現行法に定義は無い。この由来を画面にも明記している。
//
// 長さの単位はすべて mm で受け取り、m と ㎡ で返す。

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/** 1坪の平方メートル数（慣行値）。1間＝6尺＝20/11 m、その2乗 ＝ 400/121 ㎡ */
export const TSUBO_M2 = 400 / 121;

/** 勾配の表記。日本の屋根は「寸」が標準だが、図面は角度や％のこともある */
export const SLOPE_UNITS = {
  sun: { label: "寸勾配（水平10に対する垂直）", suffix: "寸" },
  fraction: { label: "分数（垂直 ／ 水平）", suffix: "" },
  deg: { label: "角度", suffix: "°" },
  percent: { label: "百分率", suffix: "%" },
};

/**
 * どの表記で入力されても「寸」に揃える。
 * 角度は tan を通すので 90°以上は屋根として成立しない（呼び出し側で弾く）。
 */
export function toSun(unit, value, run = 10) {
  let n;
  if (unit === "sun") n = value;
  else if (unit === "fraction") n = run === 0 ? NaN : (value / run) * 10;
  else if (unit === "deg") n = 10 * Math.tan((value * Math.PI) / 180);
  else if (unit === "percent") n = value / 10;
  else n = NaN;
  // 45° の tan が 0.9999999999999999 になるような誤差を丸めで吸収する。
  // 6桁は、実務で使う最小刻み（0.5寸）より4桁細かい。
  return Number.isFinite(n) ? round(n, 6) : NaN;
}

/** 勾配係数（伸び率）＝ 1/cosθ ＝ √(1 + (寸/10)²) */
export function slopeFactor(sun) {
  return Math.sqrt(1 + (sun / 10) ** 2);
}

/** 寸 → 度 */
export function slopeDeg(sun) {
  return (Math.atan(sun / 10) * 180) / Math.PI;
}

/** 寸 → ％（10寸＝45°＝100%） */
export function slopePercent(sun) {
  return sun * 10;
}

/**
 * 隅棟（下り棟）の伸び率。
 * 寄棟の隅棟は平面上で45°に走るので、水平投影長は (S/2)×√2。
 * これに高さ (S/2)×(n/10) が加わるから、実長は
 *   √( (S/2)² + (S/2)² + ((S/2)(n/10))² ) ＝ (S/2)×√(2 + (n/10)²)
 * 勾配係数（√(1+(n/10)²)）とは別物である。混同すると隅棟が短く出る。
 */
export function hipFactor(sun) {
  return Math.sqrt(2 + (sun / 10) ** 2);
}

export const SHAPES = {
  kirizuma: { label: "切妻（きりづま）", faces: 2, sloped: true },
  yosemune: { label: "寄棟（よせむね）", faces: 4, sloped: true },
  katanagare: { label: "片流れ（かたながれ）", faces: 1, sloped: true },
  rikuyane: { label: "陸屋根（ろくやね・フラット）", faces: 1, sloped: false },
};

/**
 * @param {object} p
 * @param {number} p.widthMm   建物の平面の幅（桁行方向）
 * @param {number} p.depthMm   建物の平面の奥行き（梁間方向）
 * @param {number} [p.eavesMm] 軒の出（4辺とも同じとみなす）
 * @param {string} p.shape     SHAPES のキー
 * @param {number} p.sun       勾配（寸）。陸屋根では無視する
 * @param {string} [p.ridgeAlong] "auto" | "width" | "depth"
 */
export function calculate({ widthMm, depthMm, eavesMm = 0, shape, sun, ridgeAlong = "auto" }) {
  const errors = [];
  const nums = { widthMm, depthMm, eavesMm };
  for (const [k, v] of Object.entries(nums)) {
    if (!Number.isFinite(v)) errors.push(`${k} が数値でない`);
  }
  if (Number.isFinite(widthMm) && widthMm <= 0) errors.push("幅は0より大きい値を入れてください");
  if (Number.isFinite(depthMm) && depthMm <= 0) errors.push("奥行きは0より大きい値を入れてください");
  if (Number.isFinite(eavesMm) && eavesMm < 0) errors.push("軒の出に負の値は入れられません");
  if (!SHAPES[shape]) errors.push("屋根の形状が選ばれていません");

  const sloped = SHAPES[shape]?.sloped ?? true;
  const s = sloped ? sun : 0;
  if (sloped) {
    if (!Number.isFinite(s)) errors.push("勾配を数値で入れてください");
    else if (s < 0) errors.push("勾配に負の値は入れられません");
    else if (s > 100) errors.push("勾配が急すぎます（100寸＝約84°を上限としています）");
  }
  if (errors.length) return { ok: false, errors };

  // 投影寸法。軒は4辺に出るので両側で 2 倍足す。
  const wp = widthMm + 2 * eavesMm;
  const dp = depthMm + 2 * eavesMm;

  // 棟が走る方向を決める。長辺に通すのが標準。
  let along = ridgeAlong;
  if (along !== "width" && along !== "depth") along = wp >= dp ? "width" : "depth";
  let Lp = along === "width" ? wp : dp; // 棟に平行な投影寸法
  let Sp = along === "width" ? dp : wp; // 棟に直交する投影寸法

  const notes = [];
  // 寄棟は4面とも同じ勾配だと隅棟が平面上45°になり、棟は長辺方向にしか通らない。
  // 短辺を指定されたら幾何が成立しないので、黙って直さず理由を返す。
  if (shape === "yosemune" && Lp < Sp) {
    [Lp, Sp] = [Sp, Lp];
    along = along === "width" ? "depth" : "width";
    notes.push("寄棟は4面が同じ勾配のとき棟が長辺方向にしか通らないため、棟の向きを長辺に取り直しました。");
  }

  const k = sloped ? slopeFactor(s) : 1;
  const projM2 = (wp * dp) / 1e6;
  const roofM2 = projM2 * k;

  const m = (mm) => round(mm / 1000, 2);
  let ridge = null, slopeLen = null, eave = null, rake = null, hipEach = null, hipCount = 0;

  if (shape === "kirizuma") {
    ridge = Lp;
    slopeLen = (Sp / 2) * k;
    eave = 2 * Lp;          // 軒先は棟と平行な2辺
    rake = 4 * slopeLen;    // けらばは妻2面 × 各2本
  } else if (shape === "yosemune") {
    ridge = Math.max(0, Lp - Sp);
    slopeLen = (Sp / 2) * k;
    eave = 2 * (Lp + Sp);   // 4辺すべてが軒先
    hipEach = (Sp / 2) * hipFactor(s);
    hipCount = 4;
    if (ridge === 0) notes.push("幅と奥行きが等しいため棟の長さが0になります。これは頂点が1点に集まる「方形（ほうぎょう）屋根」です。");
  } else if (shape === "katanagare") {
    ridge = Lp;             // 頂部（棟側）の水平長
    slopeLen = Sp * k;      // 軒先から頂部まで一気に流れる
    eave = Lp;
    rake = 2 * slopeLen;
  } else {
    // 陸屋根。実際には排水のため 1/50〜1/100 程度の水勾配を取るが、
    // 面積への影響は 0.02% 未満なので係数1として扱い、その旨を注記する。
    eave = 2 * (wp + dp);
    notes.push("陸屋根は勾配係数を1として計算しています。実際の水勾配（1/50〜1/100程度）が面積に与える影響は0.02%未満です。");
  }

  if (sloped && s === 0) {
    notes.push("勾配0寸は水平です。実際の屋根では雨仕舞いが成立しないため、入力を確認してください。");
  }

  return {
    ok: true,
    errors: [],
    shape,
    shapeLabel: SHAPES[shape].label,
    ridgeAlong: along,
    projected: { widthM: m(wp), depthM: m(dp), areaM2: round(projM2, 2) },
    slope: {
      sun: round(s, 3),
      factor: round(k, 4),
      deg: round(slopeDeg(s), 1),
      percent: round(slopePercent(s), 1),
    },
    roof: { areaM2: round(roofM2, 2), tsubo: round(roofM2 / TSUBO_M2, 2) },
    lengths: {
      ridgeM: ridge === null ? null : m(ridge),
      slopeLenM: slopeLen === null ? null : m(slopeLen),
      eaveM: eave === null ? null : m(eave),
      rakeM: rake === null ? null : m(rake),
      hipEachM: hipEach === null ? null : m(hipEach),
      hipCount,
      hipTotalM: hipEach === null ? null : m(hipEach * hipCount),
    },
    notes,
  };
}
