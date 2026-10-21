// 目隠しフェンスの必要な高さのテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 一次情報由来の定数（AIST B2 内眼角高、民法225条2項の 2m）
//   (2) 相似の式そのもの（手計算と一致）
//   (3) 「ちょうど」の高さで隠れ、1cm 低いと隠れない
//   (4) 見下ろす視線は近いほど、見上げる視線は遠いほど高いフェンスが要る（距離の範囲は両端の厳しいほう）
//   (5) 切り上げ・切り捨ての向き（必要な高さは切り上げ、隠れる高さは切り捨て）
//   (6) 逆算（このフェンスで隠れる高さ）が順算と食い違わない

import { EYE, CIVIL_225_HEIGHT_CM, sightHeightAtFence, hiddenUpTo, calculate } from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});

// 道路に立つ人（目 170cm・足元はフェンスの根元と同じ）が、フェンスの奥 3m で座っている人の目（110cm）を見る
const BASE = { eyeCm: 170, observerLevelCm: 0, nearCm: 100, farCm: 100, targetDistCm: 300, targetTopCm: 110, fenceCm: "" };
const calc = (over) => calculate({ ...BASE, ...over });

export default function cases() {
  const t = [];

  // ── (1) 定数 ──────────────────────────────────────
  t.push(eq("AIST B2 青年男 平均 1596.4mm・95% 1699.0mm", [EYE.maleMean.mm, EYE.male95.mm], [1596.4, 1699.0]));
  t.push(eq("AIST B2 青年女 平均 1476.3mm・95% 1575.0mm", [EYE.femaleMean.mm, EYE.female95.mm], [1476.3, 1575.0]));
  t.push(eq("AIST B2 高齢 男 1476.1mm・女 1362.5mm", [EYE.elderMaleMean.mm, EYE.elderFemaleMean.mm], [1476.1, 1362.5]));
  t.push(eq("cm は mm を四捨五入した値", Object.values(EYE).every((e) => e.cm === Math.round(e.mm / 10)), true));
  t.push(eq("民法225条2項 高さ二メートル", CIVIL_225_HEIGHT_CM, 200));

  // ── (2) 式 ────────────────────────────────────────
  t.push(eq("見下ろし 170 → 110・a=1m b=3m で 155cm", sightHeightAtFence(170, 110, 100, 300), 155));
  t.push(eq("見上げ 170 → 180・a=1m b=3m で 172.5cm", sightHeightAtFence(170, 180, 100, 300), 172.5));
  t.push(eq("フェンスに張り付く（a=0）と目の高さ", sightHeightAtFence(170, 110, 0, 300), 170));
  t.push(eq("目と上端が同じ高さなら距離に関係なくその高さ",
    [sightHeightAtFence(150, 150, 50, 300), sightHeightAtFence(150, 150, 900, 10)], [150, 150]));
  t.push(eq("calculate: 155cm", calc({}).requiredCm, 155));
  t.push(eq("2階から（足元 270・目 160）庭の座った人 110 を、a=2m b=3m で 302cm",
    calc({ observerLevelCm: 270, eyeCm: 160, nearCm: 200, farCm: 200 }).requiredCm, 302));
  t.push(eq("2mを超えたら over225", calc({ observerLevelCm: 270, eyeCm: 160, nearCm: 200, farCm: 200 }).over225, true));
  t.push(eq("ちょうど 200cm は over225 にならない",
    // 170 + (T−170)×100/400 = 200 → T = 290
    [calc({ targetTopCm: 290 }).requiredCm, calc({ targetTopCm: 290 }).over225], [200, false]));
  t.push(eq("隠したい物が地面より下（−100）でも計算できる 35cm",
    calc({ targetTopCm: -100, nearCm: 100, farCm: 100, targetDistCm: 100 }).requiredCm, 35));
  t.push(eq("視線が地面より下を通るなら 0cm（負にしない）",
    calc({ observerLevelCm: -300, eyeCm: 160, targetTopCm: 0, nearCm: 100, farCm: 100, targetDistCm: 100 }).requiredCm, 0));
  t.push(eq("見下ろしの判定", [calc({}).lookingDown, calc({ targetTopCm: 180 }).lookingDown], [true, false]));

  // ── (3) 境界: ちょうどで隠れ、1cm 低いと隠れない ──
  t.push(eq("フェンス 155cm で隠れる", calc({ fenceCm: 155 }).check.hides, true));
  t.push(eq("フェンス 154cm で隠れない・不足 1cm",
    [calc({ fenceCm: 154 }).check.hides, calc({ fenceCm: 154 }).check.shortCm], [false, 1]));
  t.push(eq("見上げ: 172.5 → 173cm 必要。173 で隠れ 172 で隠れない",
    [calc({ targetTopCm: 180, fenceCm: 173 }).check.hides, calc({ targetTopCm: 180, fenceCm: 172 }).check.hides], [true, false]));

  // ── (4) 距離の向き ────────────────────────────────
  // 見下ろし: a=1m で 155、a=4m で 135.71… → 近いほうが厳しい
  const down = calc({ nearCm: 100, farCm: 400 });
  t.push(eq("見下ろしは近い端が厳しい（155cm・1m）", [down.requiredCm, down.worstDistCm], [155, 100]));
  // 見上げ: a=1m で 172.5、a=4m で 175.71… → 遠いほうが厳しい
  const up = calc({ nearCm: 100, farCm: 400, targetTopCm: 180 });
  t.push(eq("見上げは遠い端が厳しい（176cm・4m）", [up.requiredCm, up.worstDistCm], [176, 400]));
  t.push(eq("表は両端を含む5行", [down.steps.length, down.steps[0].distCm, down.steps[4].distCm], [5, 100, 400]));
  t.push(eq("近い＝遠いなら表は1行", calc({}).steps.length, 1));
  t.push(eq("遠い距離が空欄なら近い距離と同じ", calc({ farCm: "" }).input.farCm, 100));
  // 範囲内の最大は両端のどちらかに出る（細かく刻んで確かめる）
  {
    let ok = true;
    for (const T of [-50, 60, 110, 170, 250]) for (const E0 of [0, 150, 400]) {
      const r = calculate({ ...BASE, observerLevelCm: E0, targetTopCm: T, nearCm: 50, farCm: 800 });
      let mx = -Infinity;
      for (let a = 50; a <= 800; a++) mx = Math.max(mx, sightHeightAtFence(E0 + 170, T, a, 300));
      if (r.requiredCm !== Math.max(0, Math.ceil(mx - 1e-9))) ok = false;
    }
    t.push(eq("範囲の最大は両端（1cm刻みの総当たりと一致）", ok, true));
  }
  t.push(eq("表の各行は両端の結果を超えない",
    down.steps.every((s) => s.requiredCm <= down.requiredCm) && up.steps.every((s) => s.requiredCm <= up.requiredCm), true));

  // ── (5) 丸め ──────────────────────────────────────
  t.push(eq("必要な高さは切り上げ（135.71… → 136）", calc({ nearCm: 400, farCm: 400 }).requiredCm, 136));
  t.push(eq("整数ちょうどは切り上げない（149）", calc({ targetTopCm: 100, nearCm: 30, farCm: 30, targetDistCm: 70 }).requiredCm, 149));
  t.push(eq("隠れる高さは切り捨て（H=154 → 106、H=155 → 110）",
    [calc({ fenceCm: 154 }).check.hiddenUpToCm, calc({ fenceCm: 155 }).check.hiddenUpToCm], [106, 110]));

  // ── (6) 逆算 ──────────────────────────────────────
  t.push(eq("逆算の式 170・H155・a1m・b3m → 110", hiddenUpTo(170, 155, 100, 300), 110));
  t.push(eq("a=0: 目の高さ以上なら全部、未満なら何も隠れない",
    [hiddenUpTo(170, 170, 0, 300), hiddenUpTo(170, 169, 0, 300)], [Infinity, -Infinity]));
  {
    // 順算で求めた必要な高さのフェンスなら、逆算した隠れる高さは上端以上になる
    let ok = true;
    for (const T of [30, 110, 160, 200]) for (const near of [0, 80, 300]) {
      const r = calculate({ ...BASE, targetTopCm: T, nearCm: near, farCm: near + 200 });
      const req = Math.max(1, r.requiredCm);
      const c = calculate({ ...BASE, targetTopCm: T, nearCm: near, farCm: near + 200, fenceCm: req }).check;
      if (!(c.hides && c.hiddenUpToCm >= T)) ok = false;
      if (req > 1) {
        const c2 = calculate({ ...BASE, targetTopCm: T, nearCm: near, farCm: near + 200, fenceCm: req - 1 }).check;
        if (c2.hides || c2.hiddenUpToCm >= T) ok = false;
      }
    }
    t.push(eq("順算と逆算が食い違わない（必要な高さで隠れ、1cm 低いと隠れない）", ok, true));
  }

  // ── 入力エラー ────────────────────────────────────
  t.push(eq("近い > 遠い はエラー", calc({ nearCm: 300, farCm: 100 }).ok, false));
  t.push(eq("目の高さ 49cm はエラー・50cm は可", [calc({ eyeCm: 49 }).ok, calc({ eyeCm: 50 }).ok], [false, true]));
  t.push(eq("隠したい物までの距離 0 はエラー（1cm は可）", [calc({ targetDistCm: 0 }).ok, calc({ targetDistCm: 1 }).ok], [false, true]));
  t.push(eq("空欄の目の高さはエラー", calc({ eyeCm: "" }).ok, false));
  t.push(eq("フェンスの高さは空欄でよい（check は null）", calc({ fenceCm: "" }).check, null));

  return t;
}
