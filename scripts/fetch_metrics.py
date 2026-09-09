#!/usr/bin/env python3
"""Search Console から流入実績を取得する。

日次ループの手順3「計測」の実体。**無人で完結すること**が設計要件なので、
ブラウザでのOAuth同意を必要としないサービスアカウント認証を使う。

前提（人間側の一度きりの作業。SETUP_HUMAN.md STEP 1.5）:
  1. GCPでサービスアカウントを作り、JSONキーを secrets/gsc_service_account.json に置く
  2. Search Console のプロパティ設定 → ユーザーと権限 → そのサービスアカウントの
     メールアドレスを「フル」権限で追加する
  3. state/pipeline.json の site.gsc_property に対象URLを書く
     現在の値: null（未公開のため。公開先が決まっていない）

     公開先によって書く値が変わる:
       - D案（組織サイト）… "https://<組織名>.github.io/"（URLプレフィックス型）
       - A案（独自ドメイン）… "sc-domain:<取得したドメイン>"（ドメイン型）

     ⚠ どちらの場合も "https://hori0827.github.io/" と書いてはならない。
     同じホストで別に稼働している HG Analytics（株式スクリーニング）の数字が混入する。
     流入がどちらのものか区別できなくなり、意思決定ルールの #4〜#7 が
     誤った前提で発火する。D案・A案はどちらも別ホストなのでこの問題は起きない。

依存: py -3 -m pip install google-api-python-client google-auth

使い方: py -3 scripts/fetch_metrics.py [--days 28]

終了コード:
  0 = 取得成功、または「まだ計測できない」ことを正常に判定した
  2 = 設定は揃っているのに取得に失敗した（調査が要る状態）

重要: 計測できない場合は流入を 0 ではなく null として記録する。
「ゼロだった」と「測っていない」を混同すると、誰にも見えていないツールの
SEO改善に時間を溶かすことになる。

⚠ Search Console は sessions を返さない（2026-09-09 に一次情報で確認）
--------------------------------------------------------------------
https://developers.google.com/webmaster-tools/v1/searchanalytics/query
ApiDataRow の指標は **clicks / impressions / ctr / position の4つだけ**であり、
sessions / users / visits は存在しない。

一方 pipeline.json の north_star.metric は "monthly_sessions" で、
KPIラダー L2〜L4 も「月◯セッション」で定義されている。
**つまり本スクリプトは、北極星指標を原理的に測れない。**

このことは 35日間気づかれなかった。理由は、成功経路が一度も実行されていなかったため
（gsc_property が未設定で 69行目で必ず戻る）。さらに悪いことに、修正前の成功経路は
`sessions` キーを **出力していなかった**。失敗時は "sessions": null を出すので、
下流から見ると **「取得成功」と「未計測」が区別できない**。
意思決定ルール #1（計測値が null なら計測を通す）が永久に発火し続け、
人間が STEP1.5 を終えても #4〜#7 に到達しない状態だった。

したがって全ての経路で次の2つを必ず出す:
  - "measured": 取得に成功したか（true/false）。**null かどうかで判断させない**
  - "sessions": 常に null（GSCでは取得できない）。理由は sessions_note に書く
ラダーを clicks で読み替えるか GA4 を足すかは方針判断なので、週次レビューに送る。
"""

import argparse
import datetime as dt
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PIPELINE = ROOT / "state" / "pipeline.json"
OUT = ROOT / "state" / "metrics_latest.json"
KEY = ROOT / "secrets" / "gsc_service_account.json"
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]


def emit(payload, code=0):
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    sys.exit(code)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=28)
    args = ap.parse_args()

    stamp = dt.date.today().isoformat()
    # measured / sessions は **全経路で必ず出す**。どちらかが欠けると、下流は
    # 「取得成功」と「未計測」を区別できない（2026-09-09 のテストで実際に検出）。
    base = {"fetched_at": stamp, "window_days": args.days,
            "measured": False, "sessions": None}

    if not PIPELINE.exists():
        emit({**base, "status": "no_pipeline", "sessions": None,
              "hint": "state/pipeline.json が無い"}, 2)

    pipeline = json.loads(PIPELINE.read_text(encoding="utf-8"))
    prop = (pipeline.get("site") or {}).get("gsc_property")

    if not prop:
        emit({**base, "status": "not_configured", "sessions": None,
              "hint": "pipeline.json の site.gsc_property が未設定。まだ公開していない可能性が高い"})

    if not KEY.exists():
        emit({**base, "status": "no_credentials", "sessions": None,
              "hint": f"{KEY} が無い。SETUP_HUMAN.md STEP 1.5 が未完了"})

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        emit({**base, "status": "missing_deps", "sessions": None,
              "hint": "py -3 -m pip install google-api-python-client google-auth"}, 2)

    end = dt.date.today() - dt.timedelta(days=2)   # GSCは約2日遅れる
    start = end - dt.timedelta(days=args.days - 1)

    try:
        creds = service_account.Credentials.from_service_account_file(str(KEY), scopes=SCOPES)
        api = build("searchconsole", "v1", credentials=creds, cache_discovery=False)

        def query(dimensions):
            return api.searchanalytics().query(siteUrl=prop, body={
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "dimensions": dimensions,
                "rowLimit": 50,
            }).execute().get("rows", [])

        totals = query([])
        pages = query(["page"])
        queries = query(["query"])
    except Exception as e:                                    # noqa: BLE001
        emit({**base, "status": "api_error", "sessions": None,
              "error": f"{type(e).__name__}: {e}",
              "hint": "サービスアカウントがSearch Consoleのユーザーに追加されているか確認する"}, 2)

    t = totals[0] if totals else {}
    clicks = t.get("clicks", 0)
    emit({
        **base,
        "status": "ok",
        "measured": True,          # ← 取得できた。sessions が null でも「未計測」ではない
        "sessions": None,
        "sessions_note": (
            "Search Console は sessions を返さない（指標は clicks/impressions/ctr/position の4つのみ。"
            "https://developers.google.com/webmaster-tools/v1/searchanalytics/query 2026-09-09 確認）。"
            "したがって sessions が null であることは失敗を意味しない。measured を見ること"
        ),
        "sessions_proxy_candidate": {
            "metric": "clicks",
            "value": clicks,
            "caveat": "検索経由のクリックのみ。SNS・直接流入・被リンク経由は含まないため実セッションを下回る",
            "status": "未採用。KPIラダーを clicks で読み替えるか GA4 を足すかは週次レビューで決める",
        },
        "property": prop,
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "clicks": clicks,
        "impressions": t.get("impressions", 0),
        "avg_position": round(t.get("position", 0), 1) if t else None,
        "by_page": [
            {"page": r["keys"][0], "clicks": r["clicks"],
             "impressions": r["impressions"], "position": round(r["position"], 1)}
            for r in pages
        ],
        "top_queries": [
            {"query": r["keys"][0], "clicks": r["clicks"],
             "impressions": r["impressions"], "position": round(r["position"], 1)}
            for r in queries[:20]
        ],
    })


if __name__ == "__main__":
    main()
