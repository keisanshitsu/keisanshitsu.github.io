// 屋根面積計算のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// このツールは外部の製品カタログに依存しないので、テストが守るのは主に3つ:
//   (1) 勾配係数の値そのもの（幾何の式を書き換えたら落ちる）
//   (2) 「形状が違っても、勾配が同じなら実面積は同じ」という本ツール最大の主張
//   (3) 隅棟の伸び率を勾配係数と取り違えていないこと（実務で最も出やすい誤り）

import {
  TSUBO_M2,
  SLOPE_UNITS,
  SHAPES,
  toSun,
  slopeFactor,
  slopeDeg,
  slopePercent,
  hipFactor,
  calculate,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});
const truthy = (name, actual) => ({ name, ok: actual === true, expected: true, actual });
const r = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

export default function cases() {
  const t = [];

  // ── 定数の錠 ────────────────────────────────────────────────────
  // 1坪 ＝ 1間² ＝ (6尺)² ＝ (20/11 m)² ＝ 400/121 ㎡。
  // 1尺＝10/33m は明治24年 度量衡法に由来する慣行値で、現行の計量法に定義は無い。
  t.push(eq("1坪 = 400/121 ㎡ ≒ 3.305785", r(TSUBO_M2, 6), 3.305785));
  t.push(eq("勾配の入力表記は4種類", Object.keys(SLOPE_UNITS).sort(), ["deg", "fraction", "percent", "sun"]));
  t.push(eq("扱う屋根形状は4種類", Object.keys(SHAPES).sort(), ["katanagare", "kirizuma", "rikuyane", "yosemune"]));
  t.push(eq("陸屋根だけが sloped=false", Object.entries(SHAPES).filter(([, v]) => !v.sloped).map(([k]) => k), ["rikuyane"]));

  // ── 勾配係数 √(1+(寸/10)²) ────────────────────────────────────────
  // 実務でよく引かれる値と一致すること。3寸≒1.044 / 4〜5寸≒1.08〜1.12。
  t.push(eq("0寸（水平）の勾配係数は 1", slopeFactor(0), 1));
  t.push(eq("3寸の勾配係数 = 1.0440", r(slopeFactor(3), 4), 1.044));
  t.push(eq("4寸の勾配係数 = 1.0770", r(slopeFactor(4), 4), 1.077));
  t.push(eq("5寸の勾配係数 = 1.1180", r(slopeFactor(5), 4), 1.118));
  t.push(eq("10寸の勾配係数 = √2 = 1.4142", r(slopeFactor(10), 4), 1.4142));
  t.push(eq("10寸は45度", r(slopeDeg(10), 6), 45));
  t.push(eq("4寸は21.8度", r(slopeDeg(4), 1), 21.8));
  t.push(eq("10寸は100%", slopePercent(10), 100));

  // ── 隅棟の伸び率 √(2+(寸/10)²) は勾配係数と別物 ─────────────────────
  // ここを勾配係数で計算すると隅棟が約3割短く出る。最も出やすい誤りなので固定する。
  t.push(eq("0寸の隅棟伸び率 = √2 = 1.4142", r(hipFactor(0), 4), 1.4142));
  t.push(eq("4寸の隅棟伸び率 = √2.16 = 1.4697", r(hipFactor(4), 4), 1.4697));
  t.push(truthy("隅棟伸び率は常に勾配係数より大きい", [0, 3, 4, 5, 10].every((s) => hipFactor(s) > slopeFactor(s))));

  // ── 表記の相互変換 ──────────────────────────────────────────────
  t.push(eq("45度 → 10寸（浮動小数の誤差を丸めで吸収する）", toSun("deg", 45), 10));
  t.push(eq("0度 → 0寸", toSun("deg", 0), 0));
  t.push(eq("100% → 10寸", toSun("percent", 100), 10));
  t.push(eq("30% → 3寸", toSun("percent", 30), 3));
  t.push(eq("分数 1/2 → 5寸", toSun("fraction", 1, 2), 5));
  t.push(eq("分数 3/10 → 3寸", toSun("fraction", 3, 10), 3));
  t.push(eq("寸はそのまま（0.5寸刻みも保つ）", toSun("sun", 4.5), 4.5));
  t.push(truthy("分数の分母0は NaN", Number.isNaN(toSun("fraction", 1, 0))));
  t.push(truthy("未知の表記は NaN", Number.isNaN(toSun("unknown", 1))));

  // ── 切妻 9100×7280・軒の出0・4寸 ──────────────────────────────────
  const kiri = calculate({ widthMm: 9100, depthMm: 7280, eavesMm: 0, shape: "kirizuma", sun: 4 });
  t.push(truthy("切妻の計算が成功する", kiri.ok));
  t.push(eq("切妻: 水平投影面積 66.25㎡", kiri.projected.areaM2, 66.25));
  t.push(eq("切妻: 実屋根面積 71.35㎡", kiri.roof.areaM2, 71.35));
  t.push(eq("切妻: 21.58坪", kiri.roof.tsubo, 21.58));
  t.push(eq("切妻: 棟の長さ 9.1m（長辺に通る）", kiri.lengths.ridgeM, 9.1));
  t.push(eq("切妻: 流れ長さ 3.92m", kiri.lengths.slopeLenM, 3.92));
  t.push(eq("切妻: 軒先の合計 18.2m（棟と平行な2辺）", kiri.lengths.eaveM, 18.2));
  t.push(eq("切妻: けらばの合計 15.68m（妻2面×各2本）", kiri.lengths.rakeM, 15.68));
  t.push(eq("切妻に隅棟は無い", [kiri.lengths.hipEachM, kiri.lengths.hipCount], [null, 0]));

  // ── 寄棟 同寸法・同勾配 ─────────────────────────────────────────
  const yose = calculate({ widthMm: 9100, depthMm: 7280, eavesMm: 0, shape: "yosemune", sun: 4 });
  t.push(eq("寄棟: 棟の長さ 1.82m（長辺−短辺）", yose.lengths.ridgeM, 1.82));
  t.push(eq("寄棟: 隅棟1本 5.35m", yose.lengths.hipEachM, 5.35));
  t.push(eq("寄棟: 隅棟は4本・合計 21.4m", [yose.lengths.hipCount, yose.lengths.hipTotalM], [4, 21.4]));
  t.push(eq("寄棟: 軒先は4辺すべて 32.76m", yose.lengths.eaveM, 32.76));
  t.push(eq("寄棟にけらばは無い", yose.lengths.rakeM, null));

  // ── 本ツール最大の主張: 勾配が同じなら形状が違っても実面積は同じ ──────────
  const kata = calculate({ widthMm: 9100, depthMm: 7280, eavesMm: 0, shape: "katanagare", sun: 4 });
  t.push(eq("切妻・寄棟・片流れで実面積が一致する（＝投影面積×勾配係数）",
    [yose.roof.areaM2, kata.roof.areaM2], [kiri.roof.areaM2, kiri.roof.areaM2]));
  t.push(eq("同じく坪も一致する",
    [yose.roof.tsubo, kata.roof.tsubo], [kiri.roof.tsubo, kiri.roof.tsubo]));

  // ── 片流れ 5460×3640・3寸 ───────────────────────────────────────
  const k2 = calculate({ widthMm: 5460, depthMm: 3640, eavesMm: 0, shape: "katanagare", sun: 3 });
  t.push(eq("片流れ: 投影 19.87㎡ / 実 20.75㎡", [k2.projected.areaM2, k2.roof.areaM2], [19.87, 20.75]));
  t.push(eq("片流れ: 6.28坪", k2.roof.tsubo, 6.28));
  t.push(eq("片流れ: 流れ長さは半分にしない 3.8m", k2.lengths.slopeLenM, 3.8));
  t.push(eq("片流れ: 頂部 5.46m / 軒先 5.46m（各1本）", [k2.lengths.ridgeM, k2.lengths.eaveM], [5.46, 5.46]));
  t.push(eq("片流れ: けらば 7.6m（2本）", k2.lengths.rakeM, 7.6));

  // ── 陸屋根 ─────────────────────────────────────────────────────
  const riku = calculate({ widthMm: 10000, depthMm: 8000, eavesMm: 0, shape: "rikuyane", sun: 5 });
  t.push(eq("陸屋根は勾配入力を無視して係数1", [riku.slope.sun, riku.slope.factor], [0, 1]));
  t.push(eq("陸屋根: 実面積は投影面積と等しい 80㎡", [riku.projected.areaM2, riku.roof.areaM2], [80, 80]));
  t.push(eq("陸屋根: 80㎡ = 24.2坪（400/121で割り切れる境界）", riku.roof.tsubo, 24.2));
  t.push(eq("陸屋根に棟・けらば・隅棟は無い",
    [riku.lengths.ridgeM, riku.lengths.rakeM, riku.lengths.hipEachM], [null, null, null]));
  t.push(truthy("陸屋根は水勾配について注記する", riku.notes.some((n) => n.includes("水勾配"))));

  // ── 軒の出は4辺に出る（両側で2倍足す）─────────────────────────────
  const eaves = calculate({ widthMm: 9100, depthMm: 7280, eavesMm: 600, shape: "kirizuma", sun: 4 });
  t.push(eq("軒の出600mm: 投影寸法は 10.3m × 8.48m", [eaves.projected.widthM, eaves.projected.depthM], [10.3, 8.48]));
  t.push(eq("軒の出600mm: 投影 87.34㎡ / 実 94.07㎡", [eaves.projected.areaM2, eaves.roof.areaM2], [87.34, 94.07]));
  t.push(truthy("軒の出を入れると面積は必ず増える", eaves.roof.areaM2 > kiri.roof.areaM2));

  // ── 境界値 ─────────────────────────────────────────────────────
  const hougyou = calculate({ widthMm: 7280, depthMm: 7280, eavesMm: 0, shape: "yosemune", sun: 4 });
  t.push(eq("正方形の寄棟は棟が0m（方形屋根）", hougyou.lengths.ridgeM, 0));
  t.push(truthy("方形屋根であることを注記する", hougyou.notes.some((n) => n.includes("方形"))));

  const forced = calculate({ widthMm: 9100, depthMm: 7280, shape: "yosemune", sun: 4, ridgeAlong: "depth" });
  t.push(eq("寄棟で短辺に棟を指定したら長辺に取り直す", forced.lengths.ridgeM, 1.82));
  t.push(truthy("取り直したことを黙らず注記する", forced.notes.some((n) => n.includes("長辺"))));

  const zero = calculate({ widthMm: 9100, depthMm: 7280, shape: "kirizuma", sun: 0 });
  t.push(eq("0寸なら実面積は投影面積と等しい", zero.roof.areaM2, zero.projected.areaM2));
  t.push(truthy("0寸は雨仕舞いが成立しない旨を注記する", zero.notes.some((n) => n.includes("水平"))));

  // ── 入力の検証 ──────────────────────────────────────────────────
  const bad = [
    ["幅0は拒否", { widthMm: 0, depthMm: 7280, shape: "kirizuma", sun: 4 }],
    ["奥行き負は拒否", { widthMm: 9100, depthMm: -1, shape: "kirizuma", sun: 4 }],
    ["軒の出が負は拒否", { widthMm: 9100, depthMm: 7280, eavesMm: -1, shape: "kirizuma", sun: 4 }],
    ["未知の形状は拒否", { widthMm: 9100, depthMm: 7280, shape: "irimoya", sun: 4 }],
    ["勾配が負は拒否", { widthMm: 9100, depthMm: 7280, shape: "kirizuma", sun: -1 }],
    ["勾配100寸超は拒否", { widthMm: 9100, depthMm: 7280, shape: "kirizuma", sun: 101 }],
    ["勾配が数値でないのは拒否", { widthMm: 9100, depthMm: 7280, shape: "kirizuma", sun: NaN }],
    ["幅が数値でないのは拒否", { widthMm: NaN, depthMm: 7280, shape: "kirizuma", sun: 4 }],
  ];
  for (const [name, p] of bad) {
    const res = calculate(p);
    t.push(eq(name, [res.ok, res.errors.length > 0], [false, true]));
  }
  t.push(eq("100寸ちょうどは受け付ける（上限は境界を含む）",
    calculate({ widthMm: 9100, depthMm: 7280, shape: "kirizuma", sun: 100 }).ok, true));

  return t;
}
