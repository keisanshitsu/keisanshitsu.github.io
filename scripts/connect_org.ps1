# 組織サイト（D案）へ接続する — リポジトリ作成 → push → Pages 有効化
#
#   powershell -ExecutionPolicy Bypass -File scripts\connect_org.ps1
#
# 公開先: https://<org>.github.io/   （main ブランチの /docs）
# 組織名は state\pipeline.json の site.github_org を正とする。ここに直書きしない。
#
# なぜ組織サイトなのか（CLAUDE.md「上の対立は解消した」）:
#   ユーザーの要件は「URLに自分の名前や数字を入れたくない」。
#   独自ドメイン（A案）でも満たせるが年1,000〜2,000円と人間の作業13分が要る。
#   組織サイト（D案）は費用ゼロ・組織作成1分で同じ要件を満たす。
#
# ── 安全装置（絶対に外さないこと） ────────────────────────────────────
#   1. push 先に既存コミットがあれば **push せずに中止する**
#   2. `--force` を絶対に使わない
#   3. 公開前ゲート(verify.mjs)が exit 0 でなければ push しない
#   4. トークンの値を表示・記録しない（daily_run.ps1 が出力を logs\ に流すため）
# ユーザーは同じアカウントで別の本番サイト(HG Analytics)を運用している。
# 押し込む前に必ず空であることを確かめること。

param([switch]$Quiet)

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Say($msg, $color = 'Gray') { if (-not $Quiet) { Write-Host $msg -ForegroundColor $color } }

# ── 資格情報（connect_github.ps1 と同じ方法。理由はそちらのコメント参照） ──
function Get-StoredGitHubToken {
    $req = Join-Path $env:TEMP ("credreq_" + [Guid]::NewGuid().ToString('N') + ".txt")
    $prev = $env:GIT_TERMINAL_PROMPT
    try {
        $env:GIT_TERMINAL_PROMPT = '0'
        [System.IO.File]::WriteAllBytes($req,
            [System.Text.Encoding]::ASCII.GetBytes("protocol=https`nhost=github.com`n`n"))
        $out = cmd /c "git credential fill < ""$req"""
        foreach ($line in @($out)) { if ($line -match '^password=(.+?)\s*$') { return $Matches[1] } }
    }
    catch { return $null }
    finally { $env:GIT_TERMINAL_PROMPT = $prev; Remove-Item $req -Force -ErrorAction SilentlyContinue }
    return $null
}

# ── 1. 組織名を state から読む ────────────────────────────────────────
$PipelinePath = Join-Path $Root 'state\pipeline.json'
$pipeline = (Get-Content $PipelinePath -Raw -Encoding UTF8) | ConvertFrom-Json
$Org = $pipeline.site.github_org
if ([string]::IsNullOrWhiteSpace($Org)) {
    Say "[error] pipeline.json の site.github_org が未設定です。" 'Red'
    exit 2
}
$RepoName = "$Org.github.io"
$RepoUrl  = "https://github.com/$Org/$RepoName"
$PagesUrl = "https://$Org.github.io/"
Say "組織: $Org / リポジトリ: $RepoName"

# ── 2. 認証と権限 ─────────────────────────────────────────────────────
$Token = Get-StoredGitHubToken
if (-not $Token) {
    Say "[error] GitHub の資格情報を取得できませんでした。" 'Red'
    Say "        一度 https://github.com にサインインした状態で git push を通してください。" 'Yellow'
    exit 3
}
$H = @{ Authorization = "token $Token"; 'User-Agent' = 'kurashi-keisan-setup'
        Accept = 'application/vnd.github+json' }

try {
    $m = Invoke-RestMethod -Uri "https://api.github.com/user/memberships/orgs/$Org" `
        -Headers $H -Method Get -ErrorAction Stop
    Say "[ok] 組織メンバーシップ: state=$($m.state) role=$($m.role)" 'Green'
    if ($m.role -ne 'admin') {
        Say "[error] 組織の admin ではありません。リポジトリを作成できません。" 'Red'
        exit 4
    }
}
catch {
    $code = $_.Exception.Response.StatusCode.value__
    Say "[error] 組織 $Org にアクセスできません (HTTP $code)" 'Red'
    if ($code -eq 403 -or $code -eq 404) {
        Say "        新規組織は OAuth App のアクセス制限が既定で有効です。" 'Yellow'
        Say "        オーナーが次のページで許可してください（約20秒）:" 'Yellow'
        Say "        https://github.com/organizations/$Org/settings/oauth_application_policy" 'Yellow'
    }
    exit 4
}

# ── 2.9. 既に接続済みか ───────────────────────────────────────────────
# 接続後にこのスクリプトを再実行できるようにしておく。
# 3〜5（リポジトリ作成・ゲート・push）は初回だけの手順で、2回目以降は
# 「既にコミットがある」に引っかかって中止になってしまう。
# 一方 6〜7（Pages の設定確認と修復）は **何度でも流せることに価値がある**。
# 実際 2026-09-09 に Pages が path='/' で作られる事故が起きており、
# それを直すために再実行できる必要があった。
$AlreadyConnected = (@(git remote) -contains 'origin') -and
                    ((git config --get remote.origin.url) -eq "$RepoUrl.git")
if ($AlreadyConnected) {
    Say "[skip] origin は既に $RepoUrl を指しています。Pages の確認だけ行います" 'DarkGray'
}

if (-not $AlreadyConnected) {

# ── 3. 安全装置: push 先が空であることを確認する ──────────────────────
$RepoExists = $true
try {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$Org/$RepoName" `
        -Headers $H -Method Get -ErrorAction Stop | Out-Null
}
catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) { $RepoExists = $false }
    else {
        Say "[error] GitHub API に到達できません: $($_.Exception.Message)" 'Red'
        Say "        確認できないまま push はしません。" 'Yellow'
        exit 7
    }
}

if ($RepoExists) {
    $HasCommits = $true
    try {
        Invoke-RestMethod -Uri "https://api.github.com/repos/$Org/$RepoName/commits?per_page=1" `
            -Headers $H -Method Get -ErrorAction Stop | Out-Null
    }
    catch { if ($_.Exception.Response.StatusCode.value__ -eq 409) { $HasCommits = $false } }

    if ($HasCommits) {
        Say ''
        Say "[中止] $RepoUrl には既にコミットがあります。" 'Red'
        Say "       上書きは行いません（--force は本ドクトリンで禁止）。" 'Red'
        Say "       中身を確認し、別リポジトリにするか手で合流してください。" 'Yellow'
        exit 8
    }
    Say "[ok] リポジトリは存在し、空です: $RepoUrl" 'Green'
}
else {
    $json = @{
        name = $RepoName; description = 'くらしの計算室 — 根拠つきの計算ツール'
        private = $false; auto_init = $false; has_issues = $false; has_wiki = $false
    } | ConvertTo-Json
    # 日本語を含む body は UTF-8 のバイト列で送る（PS5.1 の既定では化ける）
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    try {
        Invoke-RestMethod -Uri "https://api.github.com/orgs/$Org/repos" -Headers $H `
            -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8' `
            -ErrorAction Stop | Out-Null
        Say "[ok] リポジトリを作成しました: $RepoUrl" 'Green'
    }
    catch {
        $code = $_.Exception.Response.StatusCode.value__
        Say "[error] リポジトリを作成できませんでした (HTTP $code)" 'Red'
        if ($code -eq 403) {
            Say "        OAuth App のアクセス制限に弾かれた可能性が高いです。" 'Yellow'
            Say "        https://github.com/organizations/$Org/settings/oauth_application_policy" 'Yellow'
        }
        exit 5
    }
}

# ── 4. 公開前ゲート ──────────────────────────────────────────────────
# 初回 push も「公開」である。検証していない状態を世界に出す最初の一回にしない。
node (Join-Path $Root 'scripts\verify.mjs')
if ($LASTEXITCODE -ne 0) {
    Say "[中止] 公開前ゲート(verify.mjs)が通りませんでした。push しません。" 'Red'
    exit 6
}

# ── 5. remote の付け替えと push ───────────────────────────────────────
# 旧 origin(hori0827/kurashi-keisan) は personal として残す。消さない。
$remotes = @(git remote)
if ($remotes -contains 'origin') {
    $cur = git config --get remote.origin.url
    if ($cur -ne "$RepoUrl.git") {
        if (-not ($remotes -contains 'personal')) { git remote rename origin personal | Out-Null }
        else { git remote remove origin | Out-Null }
        git remote add origin "$RepoUrl.git"
        Say "[ok] origin を $RepoUrl へ付け替え（旧 origin は personal として保持）" 'Green'
    }
}
else { git remote add origin "$RepoUrl.git" }

git branch -M main
git push -u origin main
if ($LASTEXITCODE -ne 0) {
    Say "[error] push に失敗しました。--force は使いません。" 'Red'
    Say "        拒否された場合は git pull --rebase origin main で合流してください。" 'Yellow'
    exit 9
}
Say "[ok] push しました" 'Green'

} # /if (-not $AlreadyConnected)

# ── 6. Pages を有効化する（ここが「公開」の引き金） ───────────────────
# ⚠ 2026-09-09 実測: このAPIは素直ではない。3点とも実際に踏んだ。
#   (1) POST が HTTP 500 を返しながら **実際には作成されていた**。しかも
#       body で指定した path='/docs' は無視され、既定の path='/' になっていた。
#       → 500 を「失敗」と扱って諦めると、ルート配信のまま放置される。
#          その状態では CLAUDE.md や state/ が配信され、サイト本体は 404 になる
#   (2) PUT で source を直しても **再ビルドは起きない**。CDN は古いビルドを返し続ける
#   (3) したがって POST → GET で実状態を確認 → 必要なら PUT → **POST /pages/builds**
#       の順で、最後に必ずビルドを要求する
# 一般則: 応答コードだけで成否を決めない。**GET して実際の状態を見る。**
$PagesApi = "https://api.github.com/repos/$Org/$RepoName/pages"
$pagesBody = '{"build_type":"legacy","source":{"branch":"main","path":"/docs"}}'

try {
    Invoke-RestMethod -Uri $PagesApi -Headers $H -Method Post -Body $pagesBody `
        -ContentType 'application/json' -ErrorAction Stop | Out-Null
    Say "[ok] GitHub Pages を有効化しました" 'Green'
}
catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 409) { Say "[ok] Pages は既に有効です" 'Green' }
    else { Say "[info] POST が HTTP $code を返しました。実状態を GET で確認します" 'DarkGray' }
}

# 応答に関わらず、実際にどうなっているかを見る
$pages = $null
try { $pages = Invoke-RestMethod -Uri $PagesApi -Headers $H -Method Get -ErrorAction Stop } catch {}

if (-not $pages) {
    Say "[error] Pages が作成されていません。" 'Red'
    Say "        手動: $RepoUrl/settings/pages → Source=main / フォルダ=/docs" 'Yellow'
    exit 10
}

if ($pages.source.path -ne '/docs' -or $pages.source.branch -ne 'main') {
    Say "[fix] 発行元が $($pages.source.branch)$($pages.source.path) になっています。/docs へ直します" 'Yellow'
    try {
        Invoke-RestMethod -Uri $PagesApi -Headers $H -Method Put `
            -Body '{"source":{"branch":"main","path":"/docs"}}' `
            -ContentType 'application/json' -ErrorAction Stop | Out-Null
        Say "[ok] 発行元を main /docs に変更しました" 'Green'
    }
    catch {
        Say "[error] 発行元を変更できませんでした (HTTP $($_.Exception.Response.StatusCode.value__))" 'Red'
        Say "        手動: $RepoUrl/settings/pages → Source=main / フォルダ=/docs" 'Yellow'
        exit 11
    }
}

# PUT だけでは再ビルドされない。必ずビルドを要求する
try {
    Invoke-RestMethod -Uri "$PagesApi/builds" -Headers $H -Method Post -ErrorAction Stop | Out-Null
    Say "[ok] ビルドを要求しました" 'Green'
}
catch { Say "[warn] ビルド要求に失敗 (HTTP $($_.Exception.Response.StatusCode.value__))" 'Yellow' }

# ── 7. 実際に配信されるまで待って確かめる ────────────────────────────
# 「有効化した」と「見えている」は別である。GET して確かめるまで完了扱いにしない。
Say "配信を待っています（最大4分）..."
$deadline = (Get-Date).AddMinutes(4)
$live = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 15
    try {
        $resp = Invoke-WebRequest -Uri $PagesUrl -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        if ($resp.StatusCode -eq 200 -and $resp.Content -match '<title>') { $live = $true; break }
    }
    catch { }
}

Say ''
if ($live) {
    Say "[完了] 公開されました: $PagesUrl" 'Green'
    exit 0
}
Say "[warn] まだ配信が確認できません: $PagesUrl" 'Yellow'
Say "       数分後にもう一度開いてください。状態: $RepoUrl/settings/pages" 'Yellow'
exit 0
