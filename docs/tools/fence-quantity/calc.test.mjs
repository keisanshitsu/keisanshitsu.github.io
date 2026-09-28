// フェンスの枚数・柱の本数のテスト
// verify.mjs から毎回実行される。境界値を必ず含めること。
//
// 守らなければならないこと:
//   (1) 出典由来の定数（LIXIL: 本体W 2000mm・柱間隔 2000/1000mm・300mm・コーナー柱2本・総高さ2.2m）
//   (2) 標準条件で「柱 ＝ 枚数 ＋ 辺の数」になること（販売店の解説の式と一致する＝独立した傍証）
//   (3) 柱を少なく数えないこと。すべての柱の間隔が柱間隔以下で、
//       すべての連結部・端部に柱があることを、配置を作って確かめる
//   (4) 浮動小数で枚数が1枚ずれないこと（10.0m が 5枚＋端材0.000…1 にならない）

import {
  PANEL_W_MM,
  POST_SPACING_MM,
  POST_OFFSET_MAX_MM,
  CORNER_POSTS,
  MAKER_TOTAL_HEIGHT_MAX_MM,
  WINDY_HEIGHT_MM,
  REI_BLOCK_MAX_HEIGHT_MM,
  splitSide,
  calculate,
  parseSidesM,
} from "./calc.js";

const eq = (name, actual, expected) => ({
  name,
  ok: JSON.stringify(actual) === JSON.stringify(expected),
  expected,
  actual,
});
const truthy = (name, actual) => ({ name, ok: actual === true, expected: true, actual });

const BASE = {
  sidesMm: [10000],
  closed: false,
  panelWMm: 2000,
  spacingMm: 2000,
  fenceHeightMm: 0,
  blockHeightMm: 0,
};
const calc = (over = {}) => calculate({ ...BASE, ...over });

/** 実際に柱を置いてみて、規則を満たすかを確かめる（数え方の式とは独立に） */
function layoutIsValid(lengthMm, panelWMm, spacingMm) {
  const s = splitSide(lengthMm, panelWMm, spacingMm);
  // 連結部・端部の位置
  const keys = [0];
  let x = 0;
  for (let i = 0; i < s.panels; i++) {
    x += Math.min(panelWMm, lengthMm - x);
    keys.push(x);
  }
  // 連結部・端部に柱を置き、間を柱間隔以下になるよう等分する
  const posts = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    const n = Math.ceil((b - a) / spacingMm);
    for (let k = 0; k < n; k++) posts.push(a + ((b - a) * k) / n);
  }
  posts.push(lengthMm);
  const gapsOk = posts.every((p, i) => i === 0 || p - posts[i - 1] <= spacingMm + 1e-9);
  const keysOk = keys.every((k) => posts.some((p) => Math.abs(p - k) <= POST_OFFSET_MAX_MM));
  return { count: posts.length, gapsOk, keysOk, expected: s.posts };
}

export default function cases() {
  const t = [];

  // ── 出典由来の定数の錠 ─────────────────────────────
  t.push(eq("本体W寸法は 2000mm（LIXIL フェンスAB）", PANEL_W_MM, 2000));
  t.push(eq("柱間隔は標準2000mm・強風/H1400で1000mm", [POST_SPACING_MM.standard, POST_SPACING_MM.windy], [2000, 1000]));
  t.push(eq("連結部・端部から柱までは300mm以内", POST_OFFSET_MAX_MM, 300));
  t.push(eq("コーナーは柱2本建て", CORNER_POSTS, 2));
  t.push(eq("ブロック＋フェンスの総高さは2.2m以下（メーカー指示）", MAKER_TOTAL_HEIGHT_MAX_MM, 2200));
  t.push(eq("強風仕様に切り替わる高さは H1400", WINDY_HEIGHT_MM, 1400));
  t.push(eq("施行令62条の8 第一号 ブロック塀の高さ2.2m以下", REI_BLOCK_MAX_HEIGHT_MM, 2200));

  // ── 基本: 柱 ＝ 枚数 ＋ 辺の数 ─────────────────────
  {
    const r = calc();
    t.push(eq("10m直線: 5枚・端材なし", [r.totals.panels, r.totals.cutPanels], [5, 0]));
    t.push(eq("10m直線: 柱6本（5枚＋1辺）", r.totals.posts, 6));
    t.push(eq("10m直線: 連結4か所・コーナー0・端部2", [r.totals.joints, r.totals.corners, r.totals.openEnds], [4, 0, 2]));
  }
  {
    // 販売店の解説の例「フェンス3枚、2辺 → 3＋2＝5本」を 4m＋2m で再現
    const r = calc({ sidesMm: [4000, 2000] });
    t.push(eq("4m＋2m（L字）: 3枚・柱5本 ＝ 枚数＋辺の数", [r.totals.panels, r.totals.posts], [3, 5]));
    t.push(eq("L字: コーナー1・コーナー柱2本", [r.totals.corners, r.totals.cornerPosts], [1, 2]));
  }
  {
    const r = calc({ sidesMm: [10500, 6300, 10500], closed: false });
    const panels = 6 + 4 + 6;
    t.push(eq("コの字 10.5/6.3/10.5m: 16枚", r.totals.panels, panels));
    t.push(eq("コの字: 柱 ＝ 16＋3 ＝ 19本", r.totals.posts, panels + 3));
    t.push(eq("コの字: 切詰め3枚（500・300・500mm）", r.perSide.map((s) => s.cutMm), [500, 300, 500]));
  }
  {
    const r = calc({ sidesMm: [8000, 6000, 8000, 6000], closed: true });
    t.push(eq("ぐるり囲い 8×6m: 14枚・柱18本・コーナー4・端部0",
      [r.totals.panels, r.totals.posts, r.totals.corners, r.totals.openEnds], [14, 18, 4, 0]));
  }

  // ── 境界値: パネル幅ちょうど／1mm超え／1mm未満 ─────
  t.push(eq("2000mm ちょうど: 1枚・柱2本", [splitSide(2000, 2000, 2000).panels, splitSide(2000, 2000, 2000).posts], [1, 2]));
  t.push(eq("2001mm: 2枚（端材1mm）・柱3本", [splitSide(2001, 2000, 2000).panels, splitSide(2001, 2000, 2000).cutMm, splitSide(2001, 2000, 2000).posts], [2, 1, 3]));
  t.push(eq("1999mm: 1枚（切詰め1999mm）・柱2本", [splitSide(1999, 2000, 2000).panels, splitSide(1999, 2000, 2000).cutMm, splitSide(1999, 2000, 2000).posts], [1, 1999, 2]));
  t.push(eq("1mm: 1枚・柱2本（下限側）", [splitSide(1, 2000, 2000).panels, splitSide(1, 2000, 2000).posts], [1, 2]));

  // ── 強風（柱間隔1000mm）─────────────────────────
  {
    const r = calc({ spacingMm: 1000 });
    t.push(eq("10m・柱間隔1000: 5枚・柱11本（中間柱5本）", [r.totals.panels, r.totals.posts, r.totals.intermediatePosts], [5, 11, 5]));
  }
  t.push(eq("端材1000mmちょうど・間隔1000: 中間柱が増えない", splitSide(3000, 2000, 1000).posts, 4));
  t.push(eq("端材1001mm・間隔1000: 端材に中間柱が1本入る", splitSide(3001, 2000, 1000).posts, 5));

  // ── 柱間隔がパネル幅より広い ───────────────────────
  {
    const r = calc({ spacingMm: 3000 });
    t.push(eq("柱間隔3000: 柱は連結部と端部のみ＝6本", r.totals.posts, 6));
    t.push(truthy("柱間隔がパネル幅より広い旨の注記が出る", r.notes.some((n) => n.includes("中間柱は出ません"))));
  }

  // ── 独立検証: 実際に配置して規則を満たすか ────────────
  const grid = [];
  for (const L of [1, 299, 300, 601, 1999, 2000, 2001, 3999, 4000, 4001, 7300, 10000, 12345, 20000])
    for (const S of [700, 1000, 1500, 2000, 2500])
      for (const W of [1000, 2000]) grid.push([L, W, S]);
  const bad = grid.filter(([L, W, S]) => {
    const v = layoutIsValid(L, W, S);
    return !(v.gapsOk && v.keysOk && v.count === v.expected);
  });
  t.push(eq(`配置の独立検証 ${grid.length}通り: 柱間隔と300mm規則を満たし、本数が式と一致`, bad, []));

  // ── 浮動小数 ────────────────────────────────────
  t.push(eq("'10.0' m → 10000mm", parseSidesM("10.0"), [10000]));
  t.push(eq("'0.1, 0.2' → 100, 200（0.1+0.2 問題を持ち込まない）", parseSidesM("0.1, 0.2"), [100, 200]));
  t.push(eq("区切りは カンマ・空白・読点 のいずれでもよい", parseSidesM("10、5.5 8,3m"), [10000, 5500, 8000, 3000]));
  t.push(eq("4.1m は 3枚（2枚＋端材100mm）", [splitSide(parseSidesM("4.1")[0], 2000, 2000).panels, splitSide(parseSidesM("4.1")[0], 2000, 2000).cutMm], [3, 100]));

  // ── 高さの確認（メーカー指示と施行令を混ぜない）──────
  {
    const r = calc({ blockHeightMm: 800, fenceHeightMm: 1400 });
    t.push(eq("ブロック800＋フェンス1400＝2200: ちょうどは適合", r.checks.find((c) => c.title.includes("総高さ")).status, "ok"));
    t.push(truthy("H1400 で柱間隔2000 のとき要確認が出る", r.checks.some((c) => c.status === "info" && c.title.includes("1400"))));
  }
  {
    const r = calc({ blockHeightMm: 801, fenceHeightMm: 1400 });
    t.push(eq("2201mm: 1mm超えで不適合", [r.checks.find((c) => c.title.includes("総高さ")).status, r.ngCount], ["ng", 1]));
  }
  {
    const r = calc({ blockHeightMm: 800, fenceHeightMm: 1400, spacingMm: 1000 });
    t.push(truthy("H1400 でも柱間隔1000 なら要確認は出ない", !r.checks.some((c) => c.title.includes("1000mmを超えて"))));
  }
  t.push(truthy("H1399 では要確認が出ない", !calc({ fenceHeightMm: 1399 }).checks.some((c) => c.title.includes("1400"))));
  t.push(eq("地面に直接建てる（ブロック0）なら総高さは判定しない", calc({ fenceHeightMm: 1200 }).checks.length, 0));
  t.push(truthy("ブロック高さのみ入力なら要確認（未判定を適合と言わない）",
    calc({ blockHeightMm: 1000 }).checks.some((c) => c.status === "info" && c.title.includes("未入力"))));
  t.push(eq("ブロック2201mm は施行令の不適合も別に出る",
    calc({ blockHeightMm: 2201, fenceHeightMm: 0 }).checks.filter((c) => c.status === "ng").length, 1));

  // ── 入力エラー ──────────────────────────────────
  t.push(eq("辺なしはエラー", calc({ sidesMm: [] }).ok, false));
  t.push(eq("0m の辺はエラー", calc({ sidesMm: [0] }).ok, false));
  t.push(eq("負の辺はエラー", calc({ sidesMm: [-1000] }).ok, false));
  t.push(eq("数でない辺はエラー", calc({ sidesMm: parseSidesM("abc") }).ok, false));
  t.push(eq("2辺で囲いはエラー", calc({ sidesMm: [5000, 5000], closed: true }).ok, false));
  t.push(eq("パネル幅499mmはエラー・500mmは可", [calc({ panelWMm: 499 }).ok, calc({ panelWMm: 500 }).ok], [false, true]));
  t.push(eq("柱間隔299mmはエラー・300mmは可", [calc({ spacingMm: 299 }).ok, calc({ spacingMm: 300 }).ok], [false, true]));
  t.push(eq("21辺はエラー・20辺は可",
    [calc({ sidesMm: Array(21).fill(1000) }).ok, calc({ sidesMm: Array(20).fill(1000) }).ok], [false, true]));

  // ── 端材が小さい辺の注記（多めに数えていることを隠さない）──
  t.push(truthy("端材599mm で注記が出る", calc({ sidesMm: [4599] }).notes.some((n) => n.includes("多めの側"))));
  t.push(truthy("端材600mm で注記は出ない", !calc({ sidesMm: [4600] }).notes.some((n) => n.includes("多めの側"))));

  return t;
}
