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

# ── 6. Pages を有効化する（ここが「公開」の引き金） ───────────────────
$pagesBody = @{ source = @{ branch = 'main'; path = '/docs' } } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$Org/$RepoName/pages" -Headers $H `
        -Method Post -Body $pagesBody -ContentType 'application/json' -ErrorAction Stop | Out-Null
    Say "[ok] GitHub Pages を有効化しました（main / docs）" 'Green'
}
catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 409) { Say "[ok] Pages は既に有効です" 'Green' }
    else {
        Say "[warn] Pages の自動有効化に失敗 (HTTP $code)" 'Yellow'
        Say "       手動: $RepoUrl/settings/pages → Source=main / フォルダ=/docs" 'Yellow'
    }
}

Say ''
Say "公開URL（反映まで1〜2分）: $PagesUrl" 'Green'
exit 0
