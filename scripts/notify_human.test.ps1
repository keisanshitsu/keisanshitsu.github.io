# notify_human.ps1 の「読まれたか」判定のテスト
#
# なぜ要るか（2026-09-10）:
#   9/07 に「掲示が読まれたかは NTFS の最終アクセス時刻で分かる」と宣言し、
#   9/08 に「一括掃引を人間の操作と誤認する」欠陥を見つけて Test-BulkSweep を足した。
#   その境界テストは**その場で走らせただけでコミットしなかった**ため、
#   9/10 に再発した——今度は掃引ではなく**自分の処理系による自己汚染**で。
#
#   プロジェクト側の掲示は git のワークツリー内かつ OneDrive 配下にあり、
#   書き込んだ4秒後に触られていた（baseline 22:39:58 → access 22:40:02）。
#   Test-BulkSweep はこれを拾えない。触るのが1ファイルだけで兄弟が動かないためである。
#   結果、判定器は「読まれた」と報告した。**誰も読んでいないのに、である。**
#
#   誤りの向きが最悪なので（「読まれた」は経路が生きている証拠として使われ、
#   私は催促をやめる側に倒れる）、今回はテストをコミットして毎回走らせる。
#
# 契約: 成功時 exit 0 で "N/M PASS" を出力。失敗行は "[FAIL] " で始める（verify.mjs が拾う）。

$ErrorActionPreference = 'Stop'

# 本体を実行せずに判定関数だけ読み込む
$env:NOTIFY_HUMAN_TEST = '1'
. (Join-Path $PSScriptRoot 'notify_human.ps1')

$pass = 0
$total = 0
$fails = @()

function Check([string]$Name, $Expected, $Actual) {
    $script:total++
    if ($Expected -eq $Actual) { $script:pass++ }
    else { $script:fails += "[FAIL] $Name : expected=$Expected actual=$Actual" }
}

function T([string]$Role, $Counts, [bool]$Opened) {
    $o = [pscustomobject]@{ role = $Role; opened_since = $Opened }
    if ($null -ne $Counts) { $o | Add-Member -NotePropertyName counts_toward_verdict -NotePropertyValue $Counts }
    return $o
}

# ── Get-CountsTowardVerdict: どの掲示を判定母数に入れるか ────────────────
Check 'A1 明示フラグ true が最優先'            $true  (Get-CountsTowardVerdict (T 'project' $true  $false))
Check 'A2 明示フラグ false が最優先'           $false (Get-CountsTowardVerdict (T 'desktop' $false $false))
Check 'A3 フラグ無し・desktop は数える'        $true  (Get-CountsTowardVerdict (T 'desktop' $null  $false))
Check 'A4 フラグ無し・project は数えない'      $false (Get-CountsTowardVerdict (T 'project' $null  $false))
Check 'A5 role もフラグも無ければ数える'       $true  (Get-CountsTowardVerdict ([pscustomobject]@{ opened_since = $false }))

# ── Get-AnyOpened: 総合判定 ───────────────────────────────────────────────
# B2 が本命の回帰テスト。2026-09-10 に実際に起きた形そのもの。
Check 'B1 desktop が開かれた → 読まれた'  $true  (Get-AnyOpened @( (T 'desktop' $true $true),  (T 'project' $false $false) ))
Check 'B2 project だけ動いた → 読まれていない（自己汚染。9/10 の実測形）' `
                                          $false (Get-AnyOpened @( (T 'desktop' $true $false), (T 'project' $false $true)  ))
Check 'B3 どちらも動かない → 読まれていない' $false (Get-AnyOpened @( (T 'desktop' $true $false), (T 'project' $false $false) ))
Check 'B4 両方動いた → 読まれた'            $true  (Get-AnyOpened @( (T 'desktop' $true $true),  (T 'project' $false $true)  ))
Check 'B5 空配列 → 読まれていない'          $false (Get-AnyOpened @())

# 後方互換: counts_toward_verdict を持たない古い receipt でも同じ結論になること
Check 'B6 旧形式・project だけ動いた → 読まれていない' `
                                          $false (Get-AnyOpened @( (T 'desktop' $null $false), (T 'project' $null $true) ))
Check 'B7 旧形式・desktop が動いた → 読まれた' `
                                          $true  (Get-AnyOpened @( (T 'desktop' $null $true),  (T 'project' $null $false) ))

# 誤りの向きの確認: 判定できない材料しか無いときは「うるさい側」（読まれていない扱いにしない）
Check 'B8 role 不明で開かれた → 数える（うるさい側に倒す）' `
                                          $true  (Get-AnyOpened @( ([pscustomobject]@{ opened_since = $true }) ))

# ── Get-NoticeHeadline: 見出しの件数が state と一致するか ────────────────
# C1 が本命。2026-09-13 に実際に起きた形——pending=2 なのに見出しが "1件" 固定だった。
# 掲示は39日間「残りの作業は1件です」と言い続け、STEP1.6 は人間の目に一度も触れていない。
$h2 = Get-NoticeHeadline -PendingCount 2 -Published $true -Days 39 -LiveUrl 'https://x/' -SinceStr ''
Check 'C1 pending=2 なら見出しは2件（literal 1件の再発防止）' $true ($h2.title -like '*2件*')
Check 'C2 pending=2 なら「この1点だけ」と書かない'            $false ($h2.lead -like '*この1点だけ*')

$h1 = Get-NoticeHeadline -PendingCount 1 -Published $true -Days 39 -LiveUrl 'https://x/' -SinceStr ''
Check 'C3 pending=1 なら見出しは1件'                          $true ($h1.title -like '*1件*')
Check 'C4 pending=1 なら「この1点だけ」と書く'                $true ($h1.lead -like '*この1点だけ*')

$h0 = Get-NoticeHeadline -PendingCount 0 -Published $false -Days 7 -LiveUrl '' -SinceStr ''
Check 'C5 未公開なら見出しは停止日数を出す'                   $true ($h0.title -like '*7日*')

$h5 = Get-NoticeHeadline -PendingCount 5 -Published $false -Days 7 -LiveUrl '' -SinceStr ''
Check 'C6 未公開・複数件でも件数を出す'                       $true ($h5.lead -like '*5 件*')

foreach ($f in $fails) { Write-Output $f }
Write-Output "$pass/$total PASS"
if ($fails.Count -gt 0) { exit 1 }
exit 0
