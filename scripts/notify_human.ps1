# 自律収益プロジェクト — 人間への通知（2026-09-06 追加 / 2026-09-07 全面改訂）
#
# なぜ要るか:
#   私の出力先は SETUP_HUMAN.md と logs\ の2つしかなく、**どちらも .gitignore 済みの
#   ローカルファイル**である。私が書き続けた依頼は、人間が自発的にそのファイルを
#   開かないかぎり1文字も届かない。通知経路が設計上存在しなかった（2026-09-06 週次レビュー）。
#
# 2026-09-07 の改訂理由（実測にもとづく。推測ではない）:
#   9/06 版は「トーストが画面に出たかは確認できない」として、その確認を人間への
#   質問（記入欄「通知は見えたか」）に委ねていた。**これは誤りだった。**
#   質問は答えが返らなければ永久に未解決のままであり、32日間ボトルネックを
#   取り違えた原因そのものが「未確認の前提を放置したこと」だったからである。
#   9/07 に実測したところ、確認は**私の側で機械的にできた**:
#     (a) トースト … Show() 前後で通知ストア（wpndatabase.db-wal）の更新時刻を比較すれば、
#         Windows の通知プラットフォームに届いたかが判定できる。9/07 の対照実験で
#         「Show() → WAL が更新される」ことを確認済み。Setting も Enabled だった。
#         → **トースト経路は壊れていない。** 9/06 版の「方式を変える」判断は根拠が無い
#     (b) 掲示ファイル … NTFS の最終アクセス時刻が有効（fsutil: DisableLastAccess=2 =
#         更新ON）であり、Get-Item は**メタデータのみ**なので観測しても汚染しない
#         （9/07 の対照実験で確認: Get-Item 2回では変化せず、ReadAllText では変化した）。
#         → **「読まれたか」は測れる。** 実際に測ったところ、9/06 に置いた
#         いま必要な作業.txt は作成後23時間、一度も開かれていなかった
#
#   したがって壊れていたのは**方式ではなく置き場所**である。掲示はプロジェクト
#   フォルダの中にあり、**フォルダを開かないと目に入らない**。そこで:
#     1. 掲示を **デスクトップ直下**にも置く（フォルダを開かなくても目に入る）
#     2. トーストを scenario="reminder" にして**自動で消えないように**する
#     3. 到達を**毎回測って** state\notify_receipt.json に記録する
#        → 次回起動時、私は「届いたか？」を人間に聞かずに読むだけで分かる
#
# 2026-09-08 の改訂理由（またしても、自分の測定器のほうが間違っていた）:
#   9/07 は「読まれたか」を測れるようにしたが、**測り方が甘かった**。
#   本日デスクトップ31項目のアクセス時刻を並べたところ、**23項目が同一の秒**
#   （2026-09-08T09:01:13）に更新されていた。人間が1秒で23個を開くことはない。
#   OneDrive の同期スキャン等による**一括掃引**である。
#   9/07 版は「アクセス時刻が進んだ＝人が開いた」としか見ていないので、
#   掃引が掲示ファイルを含んだ日に「**人間が読んだ**」と誤って記録する。
#   そして「読まれた」は経路が生きている証拠として使われ、私は催促をやめる側に倒れる。
#     → Test-BulkSweep を追加。兄弟項目の同時刻アクセスで裏を取る。
#     → トーストに Tag/Group を付けた（実測で未消化トーストが10件たまっていた）
#
#   これで4回目である: 8/09「できないと決めつけた」／9/05「手段が1つだと決めつけた」／
#   9/07「測れないと決めつけた」／9/08「**測れたと決めつけた**」。
#   測定器を作ったら、次はその測定器を疑うこと。
#
# 一般則（CLAUDE.md へ転記済み）:
#   人間に確認を求める前に、それが自分で測れないかを1回試す。
#   測れることを人に聞くのは、依頼のコストを相手に押しつけているだけである。
#
# 絶対条件: ここで何が起きても日次ループを止めないこと。
#   全体を try/catch で包み、常に exit 0 で返す。通知は本業ではない。
#
# 手動で試すとき: powershell -ExecutionPolicy Bypass -File scripts\notify_human.ps1

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root        = Split-Path -Parent $PSScriptRoot
$Pipeline    = Join-Path $Root 'state\pipeline.json'
$Receipt     = Join-Path $Root 'state\notify_receipt.json'
$NoteProject = Join-Path $Root 'いま必要な作業.txt'

# デスクトップ直下。OneDrive でリダイレクトされていても正しく解決される
# （2026-09-07 実測: C:\Users\horik_vle3kvw\OneDrive\Desktop）。
$DesktopDir  = [Environment]::GetFolderPath('Desktop')
$NoteDesktop = if ($DesktopDir -and (Test-Path $DesktopDir)) {
    Join-Path $DesktopDir '★くらし計算室 いま必要な作業.txt'
} else { $null }

function Get-AccessTime([string]$Path) {
    # ⚠ Get-Item はメタデータのみを読むので最終アクセス時刻を汚染しない。
    #    ここで Get-Content / ReadAllText を使うと自分で観測対象を壊す（9/07 実測）。
    if (-not $Path -or -not (Test-Path $Path)) { return $null }
    try { return (Get-Item $Path).LastAccessTime.ToString('s') } catch { return $null }
}

function Test-BulkSweep([string]$Path, [string]$AccessTime) {
    # ⚠ 2026-09-08 追加。**最終アクセス時刻が動いた＝人が開いた、ではない。**
    #
    #   9/07 版はアクセス時刻が baseline より進んでいれば無条件で「読まれた」と
    #   判定していた。しかし本日デスクトップを実測したところ、31項目のうち **23項目が
    #   まったく同一の秒（2026-09-08T09:01:13）** にアクセス時刻を更新されていた。
    #   人間が23個のファイルを1秒で開くことはない。OneDrive の同期スキャンなどの
    #   **一括掃引**である。掃引が掲示ファイルを含んでいたら、9/07 版は
    #   「人間が読んだ」と誤判定していた。
    #
    #   誤判定の向きが悪い: 「読まれた」は経路が生きている証拠として使われ、
    #   私は催促をやめる側に倒れる。**届いていないのに届いたことにする**のが最悪である。
    #
    #   したがって同じフォルダの兄弟項目を見て裏を取る。同じ秒に複数が触られて
    #   いれば掃引、その1つだけが動いていれば人間の操作とみなす。
    #   Get-ChildItem は列挙のみでファイル本体を読まないため、観測は汚染しない
    #   （Get-Item と同じ理屈。9/07 の対照実験を援用）。
    #
    #   ⚠ 誤りうる向きも書いておく: 人間が開いた瞬間にたまたま掃引が重なると
    #   「掃引」と判定して人間の操作を見落とす。ただしその場合こちらは
    #   催促を続ける側に倒れるので、被害は「しつこい」で済む。安全な向きに倒してある。
    if (-not $Path -or -not $AccessTime) { return $null }
    try {
        $at = [datetime]$AccessTime

        # ⚠ 自分自身を兄弟として数えないこと。ここは文字列比較では足りない。
        #   初版は `$_.FullName -ne $Path` としていたが、$Path が 8.3 短縮名
        #   （例 C:\Users\HORIK~1\...）で渡ると FullName（長い名前）と一致せず、
        #   **掲示ファイル自身が cohort に入って件数が常に1多くなる**。
        #   しきい値3が実質2に下がるため、兄弟2件でも掃引と誤判定していた。
        #   境界テスト（CASE C: 兄弟2件 → is_sweep が True になった）で検出。
        #   Get-Item は短縮名を正規化し、かつメタデータのみでアクセス時刻を汚染しない。
        $self = try { (Get-Item -LiteralPath $Path -Force).FullName } catch { $Path }
        $dir  = Split-Path -Parent $self
        if (-not $dir -or -not (Test-Path $dir)) { return $null }
        $cohort = @(Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue |
                    Where-Object { -not [string]::Equals($_.FullName, $self, [StringComparison]::OrdinalIgnoreCase) -and
                                   [math]::Abs(($_.LastAccessTime - $at).TotalSeconds) -le 2 })
        return [pscustomobject]@{
            cohort_size = $cohort.Count
            is_sweep    = ($cohort.Count -ge 3)   # 同一秒±2秒に3項目以上 = 掃引
        }
    }
    catch { return $null }
}

function Get-WalStamp {
    # Windows 通知プラットフォームの書き込み先。ここが更新されれば
    # トーストは「画面に出たかはともかく、通知ストアには届いた」と言える。
    $wal = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Notifications\wpndatabase.db-wal'
    if (-not (Test-Path $wal)) { return $null }
    try { return (Get-Item $wal).LastWriteTime } catch { return $null }
}

try {
    if (-not (Test-Path $Pipeline)) { "pipeline.json が無いので通知しない"; exit 0 }

    $p = Get-Content $Pipeline -Raw -Encoding UTF8 | ConvertFrom-Json

    # ── 0. 前回置いた掲示が読まれたかを、**上書きする前に**判定する ──────────
    $prev = $null
    if (Test-Path $Receipt) {
        try { $prev = Get-Content $Receipt -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $prev = $null }
    }
    $history = @()
    if ($prev -and $prev.history) { $history = @($prev.history) }

    $verdict = $null
    if ($prev -and $prev.targets) {
        $opened = @()
        foreach ($t in @($prev.targets)) {
            $now = Get-AccessTime $t.path
            $moved = $false
            if ($now -and $t.baseline_access) { $moved = ([datetime]$now -gt [datetime]$t.baseline_access) }

            # アクセス時刻が動いていても、それが一括掃引なら人間の操作ではない（9/08 追加）
            $sweep = $null
            if ($moved) { $sweep = Test-BulkSweep $t.path $now }
            $wasOpened = $moved -and -not ($sweep -and $sweep.is_sweep)

            $opened += [pscustomobject]@{
                role            = $t.role
                exists_now      = [bool]$now
                opened_since    = $wasOpened
                access_moved    = $moved
                sweep_suspected = [bool]($sweep -and $sweep.is_sweep)
                cohort_size     = $(if ($sweep) { $sweep.cohort_size } else { $null })
                access_now      = $now
                baseline        = $t.baseline_access
            }
        }
        $verdict = [pscustomobject]@{
            checked_on      = (Get-Date -Format 'yyyy-MM-dd')
            written_on      = $prev.last_written
            any_opened      = [bool](@($opened | Where-Object { $_.opened_since }).Count -gt 0)
            targets         = $opened
            toast_reached   = $prev.toast.reached_store
        }
        $history = @($history) + @($verdict)
        if ($history.Count -gt 30) { $history = $history[($history.Count - 30)..($history.Count - 1)] }

        if ($verdict.any_opened) {
            "前回の掲示は読まれた（最終アクセスが更新され、かつ一括掃引ではない）"
        }
        elseif (@($opened | Where-Object { $_.sweep_suspected }).Count -gt 0) {
            "⚠ 前回の掲示は読まれていない（アクセス時刻は動いたが、同一秒に多数の兄弟項目も動いており一括掃引と判定）"
        }
        else { "⚠ 前回の掲示は読まれていない（最終アクセスが作成時のまま）" }
    }

    # ── 1. 未完了の人間タスクを取る ──────────────────────────────────────
    $pending = @($p.blocked_on_human | Where-Object { $_.status -eq 'pending' })
    if ($pending.Count -eq 0) {
        foreach ($f in @($NoteProject, $NoteDesktop)) {
            if ($f -and (Test-Path $f)) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
        }
        "未完了の人間タスクは無い。掲示を消して終了"
        # 判定結果だけは残す（片づいた事実の記録になる）
        if ($verdict) {
            $out = [pscustomobject]@{ schema = 1; last_written = $null; task_id = $null
                                      targets = @(); toast = $null; history = $history }
            $out | ConvertTo-Json -Depth 6 | Set-Content -Path $Receipt -Encoding UTF8
        }
        exit 0
    }

    $top = $pending | Where-Object { $_.is_now_the_recommended_unblock -eq $true } | Select-Object -First 1
    if ($null -eq $top) { $top = $pending[0] }

    # 経過日数は「起票日から今日まで」。前回実行からの差ではない
    # （日次ループは日次で動いていないため。CLAUDE.md 環境メモ参照）。
    # [int] は四捨五入する。22時間を「1日」と書くと自己申告が実際より進んで見えるので切り捨てる
    $days = [int][Math]::Floor(((Get-Date) - [datetime]$p.meta.created).TotalDays)

    $minutes = if ($null -ne $top.human_minutes) { "$($top.human_minutes)分" } else { "数分" }
    $cost    = if ($null -ne $top.cost_jpy -and $top.cost_jpy -eq 0) { "0円" } else { "" }
    $cost_s  = if ($cost) { "・$cost" } else { "" }

    # ⚠ 見出しは state から作る。固定文にしない（2026-09-09 修正）
    # 修正前は「公開が N日 止まっています」を無条件に出していた。公開した当日に
    # この文が出て、**人間に届く唯一の経路が嘘をついた**。
    # 9/06〜9/08 で潰してきたのは「届かない」問題だが、届いても内容が誤っていれば同じである。
    $published = $false
    try { $published = [bool]$p.publication.connected } catch { }

    if ($published) {
        $liveUrl  = $p.site.published_url
        $sinceStr = ''
        if ($p.publication.published_on) {
            $sinceStr = " 公開から {0}日。" -f [int][Math]::Floor(((Get-Date) - [datetime]$p.publication.published_on).TotalDays)
        }
        $title = "くらし計算室 — 公開済み。残りの作業は1件です"
        $lead  = "サイトは公開されています: $liveUrl$sinceStr`n次に必要なのは、この1点だけです。"
    }
    else {
        $title = "くらし計算室 — 公開が {0}日 止まっています" -f $days
        $lead  = "いま止まっているのは、この1点だけです。"
    }

    $body = "{0}`n所要 {1}{2}。デスクトップの「★くらし計算室 いま必要な作業.txt」に手順があります" `
            -f $top.what, $minutes, $cost_s

    # 空の項目は行ごと出さない。「URL  : 」のような空欄は、書いたつもりで
    # 何も伝えていない状態になる（2026-09-09 に実際に出力してしまった）。
    $detail = "  所要 : $minutes$cost_s"
    if (-not [string]::IsNullOrWhiteSpace($top.url)) { $detail += "`n  URL  : $($top.url)" }
    if (-not [string]::IsNullOrWhiteSpace($top.why_human_only)) {
        $detail += "`n  なぜ私にできないか: $($top.why_human_only)"
    }

    # ── 2. durable: デスクトップ直下とプロジェクト直下の両方に置く ──────────
    #    9/06 版はプロジェクト直下だけだった。フォルダを開かないと目に入らず、
    #    実測では23時間一度も開かれなかった。デスクトップなら開く操作が要らない。
    $note = @"
$title

$lead

  [$($top.id)] $($top.what)

$detail

終わったら、プロジェクトフォルダの SETUP_HUMAN.md の「記入欄」に書いてください。
次の自動実行で私が拾って続きを進めます。

──────────────────────────────────────────────
やらないと決めた場合は「やらない」とだけ書いてください。それも有効な答えです。
増産を止めます。在庫を積むだけで1円も生まない状態を続けるのが、いちばん損なので。
──────────────────────────────────────────────

（このファイルは自動生成です。作業が片づくと自動で消えます）
最終更新: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
"@

    $targets = @()
    foreach ($pair in @(@{ role = 'desktop'; path = $NoteDesktop }, @{ role = 'project'; path = $NoteProject })) {
        if (-not $pair.path) { continue }
        try {
            Set-Content -Path $pair.path -Value $note -Encoding UTF8 -ErrorAction Stop
            $targets += [pscustomobject]@{
                role            = $pair.role
                path            = $pair.path
                written_at      = (Get-Date -Format 's')
                baseline_access = (Get-AccessTime $pair.path)
            }
        }
        catch { "掲示の書き込みに失敗（無視して続行）: $($pair.path) / $($_.Exception.Message)" }
    }

    # ── 3. push: トースト。自動で消えないよう scenario="reminder" にする ─────
    #    9/06 版は既定の5秒で消える通知だった。9/07 の実測ではトーストは
    #    通知ストアに到達していた（＝方式は壊れていない）ので、変えるのは
    #    「消えること」だけでよい。
    $toast = [pscustomobject]@{ shown_at = $null; reached_store = $null; notifier_setting = $null; error = $null }
    try {
        [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
        [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]

        $esc = { param($s) $s -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' }
        $xml = @"
<toast scenario="reminder">
  <visual>
    <binding template="ToastGeneric">
      <text>$(& $esc $title)</text>
      <text>$(& $esc $body)</text>
    </binding>
  </visual>
  <actions>
    <action content="あとで" arguments="later" activationType="foreground"/>
  </actions>
</toast>
"@
        $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
        $doc.LoadXml($xml)
        $tn = New-Object Windows.UI.Notifications.ToastNotification $doc

        # ⚠ 2026-09-08 追加。同じ Tag/Group を付けると Windows は**置き換える**。
        #   付けないと毎回別物として積み上がる。本日 GetHistory を実測したところ
        #   **未消化のトーストが10件**たまっていた。同じ依頼が10個並ぶ通知は
        #   情報ではなく雑音であり、まとめて無視される側に回る。1件に保つ。
        $tn.Tag   = 'kurashi-keisan-human-task'
        $tn.Group = 'kurashi-keisan'

        # PowerShell 自身の AppId を借りる。専用AppIdの登録はレジストリ書き込みを伴うため避けた。
        $appId    = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
        $toast.notifier_setting = $notifier.Setting.ToString()

        # 到達の実測: Show() の前後で通知ストア（WAL）の更新時刻を比べる。
        # 「画面に出たか」までは分からないが、「届いたか」は分かる。区別して書く。
        $walBefore = Get-WalStamp
        $notifier.Show($tn)
        $toast.shown_at = (Get-Date -Format 's')
        Start-Sleep -Seconds 3
        $walAfter = Get-WalStamp
        if ($walBefore -and $walAfter) { $toast.reached_store = ($walAfter -gt $walBefore) }

        "通知を出した: [$($top.id)] $($top.what)（経過 $days 日／通知ストア到達=$($toast.reached_store)）"
    }
    catch {
        $toast.error = "$($_.Exception.GetType().Name) / $($_.Exception.Message)"
        "トーストに失敗（無視して続行）: $($toast.error)"
    }

    # ── 4. 受領記録を残す。次回の実行が「読まれたか」をここから判定する ──────
    $receiptOut = [pscustomobject]@{
        schema       = 1
        last_written = (Get-Date -Format 's')
        task_id      = $top.id
        elapsed_days = $days
        targets      = $targets
        toast        = $toast
        history      = $history
        note         = '次回起動時、targets[].baseline_access と現在の LastAccessTime を比べて「読まれたか」を判定する。判定結果は history に積む。人間に聞かない'
    }
    $receiptOut | ConvertTo-Json -Depth 6 | Set-Content -Path $Receipt -Encoding UTF8
}
catch {
    # 通知の失敗で日次ループを落とさない。記録だけ残す。
    "通知に失敗（無視して続行）: $($_.Exception.GetType().Name) / $($_.Exception.Message)"
}

exit 0
