# 自律収益プロジェクト — 人間への通知（2026-09-06 追加）
#
# なぜ要るか:
#   私の出力先は SETUP_HUMAN.md と logs\ の2つしかなく、**どちらも .gitignore 済みの
#   ローカルファイル**である。つまり私が32日間書き続けた依頼は、人間が自発的に
#   そのファイルを開かないかぎり1文字も届かない。通知経路が設計上存在しなかった。
#   2026-09-06 の週次レビューで検出。
#
# 何をするか:
#   pipeline.json の blocked_on_human に pending が残っているときだけ、
#   (1) Windows のトースト通知を出す  (2) プロジェクト直下に1枚の要約テキストを置く
#   の2つを行う。pending が無ければ何もせず、置いたテキストも消す。
#
# 絶対条件: ここで何が起きても日次ループを止めないこと。
#   全体を try/catch で包み、常に exit 0 で返す。通知は本業ではない。
#
# 手動で試すとき: powershell -ExecutionPolicy Bypass -File scripts\notify_human.ps1

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root     = Split-Path -Parent $PSScriptRoot
$Pipeline = Join-Path $Root 'state\pipeline.json'
$NoteFile = Join-Path $Root 'いま必要な作業.txt'

try {
    if (-not (Test-Path $Pipeline)) { "pipeline.json が無いので通知しない"; exit 0 }

    $p = Get-Content $Pipeline -Raw -Encoding UTF8 | ConvertFrom-Json

    # 未完了の人間タスク。推奨（is_now_the_recommended_unblock）があればそれを先頭にする。
    $pending = @($p.blocked_on_human | Where-Object { $_.status -eq 'pending' })
    if ($pending.Count -eq 0) {
        if (Test-Path $NoteFile) { Remove-Item $NoteFile -Force -ErrorAction SilentlyContinue }
        "未完了の人間タスクは無い。通知しない"
        exit 0
    }

    $top = $pending | Where-Object { $_.is_now_the_recommended_unblock -eq $true } | Select-Object -First 1
    if ($null -eq $top) { $top = $pending[0] }

    # 経過日数は「起票日から今日まで」。前回実行からの差ではない
    # （日次ループは日次で動いていないため。CLAUDE.md 環境メモ参照）。
    $days = [int]((Get-Date) - [datetime]$p.meta.created).TotalDays

    $minutes = if ($null -ne $top.human_minutes) { "$($top.human_minutes)分" } else { "数分" }
    $cost    = if ($null -ne $top.cost_jpy -and $top.cost_jpy -eq 0) { "0円" } else { "" }
    $cost_s  = if ($cost) { "・$cost" } else { "" }

    $title = "くらし計算室 — 公開が {0}日 止まっています" -f $days
    $body  = "{0}`n所要 {1}{2}。詳細は SETUP_HUMAN.md" -f $top.what, $minutes, $cost_s

    # ── (1) durable: プロジェクト直下にテキストを置く ────────────────────
    # トーストは消えるが、これは残る。Desktop のプロジェクトフォルダに出るので
    # フォルダを開いた時点で目に入る。
    $note = @"
$title

いま止まっているのはこの1点です:

  [$($top.id)] $($top.what)

  所要: $minutes$cost_s
  なぜ私にできないか: $($top.why_human_only)
  URL: $($top.url)

手順の詳細と、ほかの選択肢は SETUP_HUMAN.md にあります。
終わったら SETUP_HUMAN.md の「記入欄」に書いてください。次の自動実行で私が拾います。

（このファイルは自動生成です。人間タスクが片づくと自動で消えます）
最終更新: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
"@
    Set-Content -Path $NoteFile -Value $note -Encoding UTF8

    # ── (2) push: Windows のトースト通知 ─────────────────────────────────
    # ⚠ Show() が例外を投げなくても「画面に出た」とは限らない（集中モード等で
    #    抑制されうる）。通ったことにしない。表示の可否はユーザーに確認する。
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]

    $esc = {
        param($s)
        $s -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;'
    }
    $xml = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>$(& $esc $title)</text>
      <text>$(& $esc $body)</text>
    </binding>
  </visual>
</toast>
"@
    $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
    $doc.LoadXml($xml)
    $toast = New-Object Windows.UI.Notifications.ToastNotification $doc

    # PowerShell 自身の AppId を借りる。専用AppIdの登録はレジストリ書き込みを伴うため避けた。
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)

    "通知を出した: [$($top.id)] $($top.what)（経過 $days 日）"
}
catch {
    # 通知の失敗で日次ループを落とさない。記録だけ残す。
    "通知に失敗（無視して続行）: $($_.Exception.GetType().Name) / $($_.Exception.Message)"
}

exit 0
