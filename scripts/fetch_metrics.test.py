#!/usr/bin/env python3
"""fetch_metrics.py の検査。

**なぜこのテストが要るか（2026-09-09 に判明した経緯）**

fetch_metrics.py は日次ループ手順3「計測」の実体だが、起票から35日間、
一度も 69行目（gsc_property 未設定 → not_configured）より先へ進んだことが無い。
つまり **取得の成功経路は一度も実行されていない**。

2026-09-08 の教訓は「測定器を作ったら、次はその測定器を疑う」だった。
notify_human.ps1 に対しては実行したが、**より重要な測定器である本スクリプトには
していなかった**。人間が STEP1.5 を終えた瞬間に初めて走る経路が壊れていれば、
35日待った解除がその日には効かない。

依存ゼロ（標準ライブラリのみ）。google 系のモジュールは sys.modules に偽物を挿す。
実行: py -3 scripts/fetch_metrics.test.py   （終了コード 0 = 全PASS）
"""

import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import types
import contextlib

HERE = pathlib.Path(__file__).resolve().parent
TARGET = HERE / "fetch_metrics.py"

results = []


def check(name, ok, expected=None, actual=None):
    results.append({"name": name, "ok": bool(ok), "expected": expected, "actual": actual})


def load_module():
    """fetch_metrics.py を毎回まっさらに読み込む（モジュール状態を持ち越さない）。"""
    spec = importlib.util.spec_from_file_location("fetch_metrics_under_test", TARGET)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def install_google_stubs(rows_by_dimension, raise_on_query=None):
    """google 系の依存を偽物に差し替える。

    実物を pip install しなくても、成功経路（82〜124行目）を素通しできる。
    偽物が返すのは Search Console API の実際のレスポンス形（rows[].keys/clicks/
    impressions/ctr/position）に限定する。API に無いフィールドを偽物が返すと、
    テストが「動く」だけの嘘になるため。
    """
    executed = {"calls": []}

    class _Exec:
        def __init__(self, body):
            self._body = body

        def execute(self):
            if raise_on_query:
                raise raise_on_query
            dims = tuple(self._body.get("dimensions") or [])
            executed["calls"].append(self._body)
            return {"rows": rows_by_dimension.get(dims, [])}

    class _SearchAnalytics:
        def query(self, siteUrl=None, body=None):  # noqa: N803 (API のシグネチャに合わせる)
            executed["calls"].append({"siteUrl": siteUrl})
            return _Exec(body)

    class _Api:
        def searchanalytics(self):
            return _SearchAnalytics()

    creds_mod = types.ModuleType("google.oauth2.service_account")
    creds_mod.Credentials = types.SimpleNamespace(
        from_service_account_file=lambda path, scopes=None: object()
    )
    google_pkg = types.ModuleType("google")
    oauth2_pkg = types.ModuleType("google.oauth2")
    oauth2_pkg.service_account = creds_mod
    google_pkg.oauth2 = oauth2_pkg

    disc_mod = types.ModuleType("googleapiclient.discovery")
    disc_mod.build = lambda *a, **k: _Api()
    gac_pkg = types.ModuleType("googleapiclient")
    gac_pkg.discovery = disc_mod

    sys.modules["google"] = google_pkg
    sys.modules["google.oauth2"] = oauth2_pkg
    sys.modules["google.oauth2.service_account"] = creds_mod
    sys.modules["googleapiclient"] = gac_pkg
    sys.modules["googleapiclient.discovery"] = disc_mod
    return executed


def run(mod, tmp, pipeline_obj, key_exists, argv=("--days", "28")):
    """main() を1回走らせ、(終了コード, 出力JSON) を返す。

    本物の state/metrics_latest.json は触らない（テストが本番の観測値を汚さない）。
    """
    pipeline_path = tmp / "pipeline.json"
    if pipeline_obj is not None:
        pipeline_path.write_text(json.dumps(pipeline_obj, ensure_ascii=False), encoding="utf-8")
    key_path = tmp / "key.json"
    if key_exists:
        key_path.write_text("{}", encoding="utf-8")

    mod.PIPELINE = pipeline_path
    mod.KEY = key_path
    mod.OUT = tmp / "out.json"

    old_argv = sys.argv
    sys.argv = ["fetch_metrics.py", *argv]
    buf = io.StringIO()
    code = None
    try:
        with contextlib.redirect_stdout(buf):
            mod.main()
    except SystemExit as e:
        code = e.code
    finally:
        sys.argv = old_argv

    payload = json.loads(buf.getvalue()) if buf.getvalue().strip() else None
    return code, payload


PROP = "https://example.invalid/tools/"
PIPELINE_OK = {"site": {"gsc_property": PROP}}

TOTAL_ROW = [{"clicks": 12.0, "impressions": 340.0, "ctr": 0.035, "position": 18.4}]
PAGE_ROWS = [
    {"keys": ["https://example.invalid/tools/a/"], "clicks": 9.0,
     "impressions": 200.0, "ctr": 0.045, "position": 15.2},
    {"keys": ["https://example.invalid/tools/b/"], "clicks": 3.0,
     "impressions": 140.0, "ctr": 0.021, "position": 22.9},
]
QUERY_ROWS = [
    {"keys": ["壁紙 必要 量 計算"], "clicks": 7.0, "impressions": 120.0,
     "ctr": 0.058, "position": 11.1},
]


def main():
    with tempfile.TemporaryDirectory() as d:
        tmp = pathlib.Path(d)

        # ── CASE A: 取得成功（35日間一度も実行されていない経路） ──────────
        install_google_stubs({
            (): TOTAL_ROW,
            ("page",): PAGE_ROWS,
            ("query",): QUERY_ROWS,
        })
        mod = load_module()
        (tmp / "a").mkdir(exist_ok=True)
        code, out = run(mod, tmp / "a", PIPELINE_OK, key_exists=True)
        check("A1 成功時の終了コードは0", code in (0, None), 0, code)
        check("A2 成功時の status は ok", out and out.get("status") == "ok", "ok",
              out and out.get("status"))
        check("A3 成功時も sessions キーが存在する（下流は sessions を読む）",
              out is not None and "sessions" in out, "キーあり",
              sorted(out.keys()) if out else None)
        # ⚠ ここは「キーの有無」で書いてはならない（2026-09-09 に一度そう書いて失敗した）。
        # base に measured=False を置いた時点でキーは常に存在するため、
        # 成功経路から measured=True を消しても素通りする。**値を見ること。**
        check("A4 成功時は measured=True（未計測と区別できる）",
              out is not None and out.get("measured") is True, True,
              out and out.get("measured"))
        check("A5 impressions が取得値と一致", out and out.get("impressions") == 340.0,
              340.0, out and out.get("impressions"))
        check("A6 clicks が取得値と一致", out and out.get("clicks") == 12.0,
              12.0, out and out.get("clicks"))
        check("A7 by_page が2件", out and len(out.get("by_page", [])) == 2, 2,
              out and len(out.get("by_page", [])))

        # ── CASE B: 公開直後・表示回数0（rows が空）────────────────────
        install_google_stubs({(): [], ("page",): [], ("query",): []})
        mod = load_module()
        (tmp / "b").mkdir(exist_ok=True)
        code, out = run(mod, tmp / "b", PIPELINE_OK, key_exists=True)
        check("B1 空データでも落ちない（exit 0）", code in (0, None), 0, code)
        check("B2 空データの impressions は 0（null ではない）",
              out and out.get("impressions") == 0, 0, out and out.get("impressions"))
        check("B3 空データでも status は ok（測れている）",
              out and out.get("status") == "ok", "ok", out and out.get("status"))
        check("B4 空データでも sessions キーが存在する",
              out is not None and "sessions" in out, "キーあり",
              sorted(out.keys()) if out else None)

        # ── CASE C: gsc_property 未設定（現行の既定経路）───────────────
        install_google_stubs({})
        mod = load_module()
        (tmp / "c").mkdir(exist_ok=True)
        code, out = run(mod, tmp / "c", {"site": {}}, key_exists=True)
        check("C1 未設定は exit 0", code in (0, None), 0, code)
        check("C2 未設定は not_configured", out and out.get("status") == "not_configured",
              "not_configured", out and out.get("status"))
        check("C3 未設定の sessions は null", out and out.get("sessions") is None,
              None, out and out.get("sessions"))
        check("C4 未設定は measured=false を明示する",
              out is not None and out.get("measured") is False, False,
              out and out.get("measured"))

        # ── CASE D: キー未配置 ─────────────────────────────────────────
        install_google_stubs({})
        mod = load_module()
        (tmp / "d").mkdir(exist_ok=True)
        code, out = run(mod, tmp / "d", PIPELINE_OK, key_exists=False)
        check("D1 キー未配置は no_credentials",
              out and out.get("status") == "no_credentials", "no_credentials",
              out and out.get("status"))
        check("D2 キー未配置は exit 0（異常ではなく未完了）", code in (0, None), 0, code)

        # ── CASE E: API 例外 ───────────────────────────────────────────
        install_google_stubs({}, raise_on_query=RuntimeError("403 forbidden"))
        mod = load_module()
        (tmp / "e").mkdir(exist_ok=True)
        code, out = run(mod, tmp / "e", PIPELINE_OK, key_exists=True)
        check("E1 API 失敗は exit 2（調査が要る状態）", code == 2, 2, code)
        check("E2 API 失敗は api_error", out and out.get("status") == "api_error",
              "api_error", out and out.get("status"))
        check("E3 API 失敗の sessions は null", out and out.get("sessions") is None,
              None, out and out.get("sessions"))

        # ── CASE F: sessions は GSC では原理的に取得できない ───────────
        # 一次情報（developers.google.com/webmaster-tools/v1/searchanalytics/query）で
        # 確認済み: ApiDataRow の指標は clicks / impressions / ctr / position の4つのみ。
        # よって「成功したのに sessions が null」は正常であり、その理由が
        # 記録に残っていなければ、将来の自分は「測れなかった」と誤読する。
        install_google_stubs({
            (): TOTAL_ROW, ("page",): PAGE_ROWS, ("query",): QUERY_ROWS,
        })
        mod = load_module()
        (tmp / "f").mkdir(exist_ok=True)
        code, out = run(mod, tmp / "f", PIPELINE_OK, key_exists=True)
        check("F1 sessions が null である理由が出力に書かれている",
              out is not None and bool(out.get("sessions_note")),
              "sessions_note あり", out and out.get("sessions_note"))

    failed = [r for r in results if not r["ok"]]
    for r in results:
        mark = "ok  " if r["ok"] else "FAIL"
        line = f"[{mark}] {r['name']}"
        if not r["ok"]:
            line += f"\n        expected={r['expected']!r}\n        actual  ={r['actual']!r}"
        print(line)
    print(f"\n{len(results) - len(failed)}/{len(results)} PASS")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
