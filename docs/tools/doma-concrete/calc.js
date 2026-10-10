// 土間コンクリートの材料一式（生コン・砕石・ワイヤーメッシュ・残土）
//
// 出典（すべて 2026-10-10 に公開資料から逐語確認）:
//   [MLIT] 国土交通省「公共建築工事標準仕様書（建築工事編）令和7年版」
//          https://www.mlit.go.jp/gobuild/content/001888816.pdf
//          22.5.4(4)(ｳ)「長手方向に200mm 程度重ね、要所を鉄線で結束して敷き込み」
//          22.5.3(6)「JIS G 3551 (溶接金網及び鉄筋格子) に基づき、鉄線径６mm、網目寸法150mm とする」
//          22.5.2(3)「コンクリート版の厚さが150mm の場合は表面から1/2 程度の位置に設ける。
//                     また、コンクリート版の厚さが200mm の場合は表面から1/3 程度の位置に設ける」
//          表22.5.1  車路及び駐車場 24 N/mm²・スランプ8cm／歩行者用通路 18 N/mm²・スランプ8cm
//          22.5.2(1)「特記がなければ、歩行者用通路のコンクリート版の厚さは、70mm とする」
//          表22.5.3  駐車場: 縦方向 突合せ目地 5m程度ごと／横方向 収縮目地 3m程度ごと
//                    車路及び歩行者用通路: 縦方向 3m程度ごと／横方向 4m程度ごと
//          4.6.3(1)「砂利及び砂地業の範囲及び厚さは、特記による。特記がなければ、厚さは60mm」
//          22.3.4(1)「一層の敷均し厚さを、締固め後の仕上り厚さが200mm を超えないように敷き均し」
//   [RIN]  林野庁「森林整備保全事業 設計積算 参考資料」第1編 1-1-2 土量変化率 表2.1
//          https://www.rinya.maff.go.jp/j/sekou/gijutu/attach/pdf/bugakarisankou-58.pdf
//          L＝ほぐした土量／地山の土量、C＝締固め後の土量／地山の土量
//          礫質土 L1.20 C0.90／砂質土及び砂 L1.20 C0.90／粘性土 L1.25 C0.90
//          (注)3「L／Cは『締固め後の土量』を『ほぐした土量』に換算する場合」
//   [SHW]  昭和産業「ワイヤーメッシュ（溶接金網）」https://www.showasangyo.co.jp/product/16/
//          φ6.0×150: 1×2m 6.22kg／2×4m 24.42kg
//
// 意図的に持たないもの（裏取りできる公的な値が無い）:
//   生コンのロス率の既定値（入力。既定0%）・生コン車の積載量・プラントの最小発注単位・
//   住宅の土間厚と砕石厚の「標準」（駐車場の版厚は仕様書でも「特記」）。
//
// 断面のモデル:
//   仕上がり面を今の地面と同じ高さにする（掘り下げて打つ）前提。
//   掘る深さ＝コンクリート厚＋砕石厚。掘った土（地山）× L ＝ 運び出す量（ほぐした土量）。
//   砕石は締固め後の厚さで入力し、× L/C（礫質土を準用）で敷く前の量の目安を出す。
//   ⚠ 砕石そのものの変化率ではない。礫質土の標準値を準用した目安である。
//
// メッシュの割付け:
//   1方向あたりの枚数 = 長さ ≤ シート寸法 なら 1、そうでなければ 1 + ⌈(長さ − シート寸法) ÷ (シート寸法 − 重ね)⌉
//   仕様書が重ね200mmを明記しているのは長手方向のみ。短手方向も同じ重ねを取る前提で数える（枚数が多くなる側）。
//   シートを縦に置く／横に置くの2通りを計算し、枚数が少ないほうを採る。
//   端部のかぶり（型枠から離す分）は差し引かない（枚数が多くなる側。切断で調整する）。

export const MESH_OVERLAP_MM = 200; // [MLIT] 22.5.4(4)(ｳ)
export const MESH_SPEC = { wireMm: 6, pitchMm: 150 }; // [MLIT] 22.5.3(6)

export const USES = {
  parking: {
    label: "駐車場",
    strengthN: 24, // [MLIT] 表22.5.1
    joints: { longitudinalM: 5, transverseM: 3 }, // [MLIT] 表22.5.3
  },
  walkway: {
    label: "通路（人が歩くだけ）",
    strengthN: 18, // [MLIT] 表22.5.1
    defaultSlabMm: 70, // [MLIT] 22.5.2(1)
    joints: { longitudinalM: 3, transverseM: 4 }, // [MLIT] 表22.5.3
  },
};

export const SOILS = {
  sand: { label: "砂質土・砂", L: 1.2, C: 0.9 }, // [RIN] 表2.1
  clay: { label: "粘性土", L: 1.25, C: 0.9 },
  gravel: { label: "礫質土（砂利まじり）", L: 1.2, C: 0.9 },
};

// 砕石の換算に準用する変化率（礫質土）
export const BASE_SOIL = SOILS.gravel;

export const SHEETS = [
  { w: 1000, l: 2000, kg: 6.22 }, // [SHW]
  { w: 2000, l: 4000, kg: 24.42 },
];

export const LIFT_MAX_MM = 200; // [MLIT] 22.3.4(1) 一層の仕上り厚さの上限

const LIMITS = {
  sideMm: [100, 100000],
  slabMm: [50, 300],
  baseMm: [0, 500],
  extraPct: [0, 50],
  sheetMm: [500, 6000],
};

// 1方向に必要なシートの枚数
export function piecesAlong(lengthMm, sheetMm, overlapMm) {
  if (lengthMm <= sheetMm) return 1;
  return 1 + Math.ceil((lengthMm - sheetMm) / (sheetMm - overlapMm));
}

export function meshLayout(widthMm, lengthMm, sheetWMm, sheetLMm, overlapMm) {
  const make = (orient, alongLength, alongWidth) => {
    const nL = piecesAlong(lengthMm, alongLength, overlapMm);
    const nW = piecesAlong(widthMm, alongWidth, overlapMm);
    return { orient, alongLengthMm: alongLength, alongWidthMm: alongWidth, nL, nW, sheets: nL * nW };
  };
  const a = make("long-along-length", sheetLMm, sheetWMm);
  const b = make("long-along-width", sheetWMm, sheetLMm);
  const [chosen, other] = b.sheets < a.sheets ? [b, a] : [a, b];
  return { chosen, other };
}

const inRange = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function calculate(input) {
  const i = {
    widthMm: Number(input.widthMm),
    lengthMm: Number(input.lengthMm),
    slabMm: Number(input.slabMm),
    baseMm: Number(input.baseMm),
    use: input.use in USES ? input.use : "parking",
    soil: input.soil in SOILS ? input.soil : "sand",
    extraPct: Number(input.extraPct ?? 0),
    mesh: input.mesh !== false,
    sheetWMm: Number(input.sheetWMm ?? 1000),
    sheetLMm: Number(input.sheetLMm ?? 2000),
    overlapMm: Number(input.overlapMm ?? MESH_OVERLAP_MM),
  };

  const errors = [];
  if (!inRange(i.widthMm, LIMITS.sideMm) || !inRange(i.lengthMm, LIMITS.sideMm))
    errors.push("幅と奥行きは 0.1m〜100m で入力してください。");
  if (!inRange(i.slabMm, LIMITS.slabMm)) errors.push("コンクリートの厚さは 5cm〜30cm で入力してください。");
  if (!inRange(i.baseMm, LIMITS.baseMm)) errors.push("砕石の厚さは 0cm〜50cm で入力してください。");
  if (!inRange(i.extraPct, LIMITS.extraPct)) errors.push("生コンの割増は 0%〜50% で入力してください。");
  if (i.mesh) {
    if (!inRange(i.sheetWMm, LIMITS.sheetMm) || !inRange(i.sheetLMm, LIMITS.sheetMm))
      errors.push("メッシュの寸法は 0.5m〜6m で入力してください。");
    else if (!Number.isFinite(i.overlapMm) || i.overlapMm < 0 || i.overlapMm >= Math.min(i.sheetWMm, i.sheetLMm))
      errors.push("メッシュの重ねは 0 以上、シートの短い辺より小さくしてください。");
  }
  if (errors.length) return { ok: false, errors };

  const use = USES[i.use];
  const soil = SOILS[i.soil];
  const areaM2 = (i.widthMm / 1000) * (i.lengthMm / 1000);

  // 生コン
  const concreteM3 = areaM2 * (i.slabMm / 1000);
  const concreteOrderM3 = concreteM3 * (1 + i.extraPct / 100);

  // 砕石（締固め後 → 敷く前の目安）
  const baseCompactedM3 = areaM2 * (i.baseMm / 1000);
  const baseLooseM3 = baseCompactedM3 * (BASE_SOIL.L / BASE_SOIL.C);
  const baseLifts = i.baseMm === 0 ? 0 : Math.ceil(i.baseMm / LIFT_MAX_MM);

  // 掘削と残土
  const digDepthMm = i.slabMm + i.baseMm;
  const excavationM3 = areaM2 * (digDepthMm / 1000);
  const soilLooseM3 = excavationM3 * soil.L;

  // メッシュ
  let mesh = null;
  if (i.mesh) {
    const lay = meshLayout(i.widthMm, i.lengthMm, i.sheetWMm, i.sheetLMm, i.overlapMm);
    const spec = SHEETS.find((s) => s.w === i.sheetWMm && s.l === i.sheetLMm);
    const sheetAreaM2 = (i.sheetWMm / 1000) * (i.sheetLMm / 1000);
    mesh = {
      ...lay,
      sheets: lay.chosen.sheets,
      weightKg: spec ? r3(spec.kg * lay.chosen.sheets) : null,
      // 面積割り（重ねを無視）との差。「面積÷シート面積」で買うと足りなくなる量
      naiveSheets: Math.ceil(r3(areaM2 / sheetAreaM2)),
    };
  }

  const checks = [];
  checks.push({
    status: "info",
    title: `強度の目安: ${use.strengthN} N/mm²（${use.label}）`,
    detail: `公共建築工事標準仕様書の表22.5.1は、車路及び駐車場を24 N/mm²、歩行者用通路を18 N/mm²としています（スランプはどちらも8cm）。生コンを注文するときの呼び強度の参考にしてください。`,
  });
  if (i.use === "walkway" && i.slabMm < use.defaultSlabMm) {
    checks.push({
      status: "ng",
      title: `厚さ ${i.slabMm / 10}cm は通路の標準 ${use.defaultSlabMm / 10}cm より薄い`,
      detail: "同仕様書は、特記がなければ歩行者用通路のコンクリート版の厚さを70mmとしています。",
    });
  }
  if (i.mesh) {
    let pos = "仕様書が位置を示しているのは厚さ150mmと200mmの場合です。";
    if (i.slabMm === 150) pos = "厚さ150mmなので、表面から1/2程度（約75mm）の位置です。";
    else if (i.slabMm === 200) pos = "厚さ200mmなので、表面から1/3程度（約67mm）の位置です。";
    checks.push({
      status: "info",
      title: "メッシュは浮かせて、厚さの途中に入れる",
      detail: `${pos} 同仕様書は、打込みを2層に分けて下層を敷き均した後にメッシュを敷き込むとしています。地面に直置きすると補強になりません。`,
    });
  }
  if (baseLifts > 1) {
    checks.push({
      status: "info",
      title: `砕石は${baseLifts}回に分けて締め固める`,
      detail: `同仕様書は路盤を「締固め後の仕上り厚さが200mmを超えないように」敷き均すとしています。${i.baseMm / 10}cmなら${baseLifts}層です。`,
    });
  }
  const j = use.joints;
  checks.push({
    status: "info",
    title: `目地の間隔の目安: 縦方向 ${j.longitudinalM}m・横方向 ${j.transverseM}m 程度ごと`,
    detail: `同仕様書の表22.5.3（${use.label}）の値です。公共建築の標準であり、住宅の土間では施工業者の判断で決まります。`,
  });

  return {
    ok: true,
    input: i,
    areaM2: r3(areaM2),
    concreteM3: r3(concreteM3),
    concreteOrderM3: r3(concreteOrderM3),
    baseCompactedM3: r3(baseCompactedM3),
    baseLooseM3: r3(baseLooseM3),
    baseLifts,
    digDepthMm,
    excavationM3: r3(excavationM3),
    soilLooseM3: r3(soilLooseM3),
    mesh,
    checks,
  };
}
