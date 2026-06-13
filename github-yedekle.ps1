# GitHub yedekleme - sik terminal gorunumu
# github-yedekle.bat tarafindan calistirilir.

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Scriptin bulundugu klasore gec
Set-Location -Path $PSScriptRoot

$W = 50  # ic genislik

function Write-Line($text, $color = 'Gray') {
    Write-Host "  $text" -ForegroundColor $color
}

function Write-Box($title, $color = 'Cyan') {
    $top = "$([char]0x2554)" + ("$([char]0x2550)" * $W) + "$([char]0x2557)"
    $bot = "$([char]0x255A)" + ("$([char]0x2550)" * $W) + "$([char]0x255D)"
    $bar = "$([char]0x2551)"
    $pad = $W - $title.Length
    $left = [math]::Floor($pad / 2)
    $right = $pad - $left
    $mid = $bar + (' ' * $left) + $title + (' ' * $right) + $bar
    Write-Host ''
    Write-Host "  $top" -ForegroundColor $color
    Write-Host "  $mid" -ForegroundColor $color
    Write-Host "  $bot" -ForegroundColor $color
    Write-Host ''
}

function Write-Step($num, $total, $label) {
    $tag = "[$num/$total]"
    Write-Host ("  {0,-7} {1,-38}" -f $tag, $label) -NoNewline -ForegroundColor White
}

function Step-OK($note = '') {
    $check = "$([char]0x2713)"
    if ($note) { Write-Host "$check $note" -ForegroundColor Green }
    else { Write-Host $check -ForegroundColor Green }
}

function Fail-And-Exit($message) {
    Write-Host "$([char]0x2717)" -ForegroundColor Red
    Write-Host ''
    $line = "$([char]0x2500)" * ($W + 2)
    Write-Host "  $line" -ForegroundColor Red
    Write-Host "   HATA: $message" -ForegroundColor Red
    Write-Host "  $line" -ForegroundColor Red
    Write-Host ''
    exit 1
}

# ---- Baslik ----
Write-Box 'GitHub Yedekleme'

# Git var mi?
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    Fail-And-Exit 'Git bulunamadi. Lutfen Git kurulu oldugundan emin olun.'
}

# Aktif branch
$branch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) {
    Fail-And-Exit 'Aktif branch bulunamadi.'
}

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

Write-Line ("Klasor : {0}" -f (Get-Location).Path) 'DarkGray'
Write-Line ("Branch : {0}" -f $branch) 'DarkGray'
Write-Line ("Zaman  : {0}" -f $stamp) 'DarkGray'
Write-Host ''

# ---- 1/4 Degisiklikleri hazirla ----
Write-Step 1 4 'Degisiklikler hazirlaniyor...'
git add -A 2>$null
if ($LASTEXITCODE -ne 0) { Fail-And-Exit 'Dosyalar eklenemedi (git add).' }
Step-OK

# ---- 2/4 Yerel yedekleri commit disi birak ----
Write-Step 2 4 'Yerel yedekler haric tutuluyor...'
git reset HEAD -- "_web-disi/local-backups" 2>$null | Out-Null
Step-OK

# ---- 3/4 Commit ----
Write-Step 3 4 'Commit olusturuluyor...'
git diff --cached --quiet
$hasChanges = ($LASTEXITCODE -ne 0)
if ($hasChanges) {
    $fileCount = (git diff --cached --name-only | Measure-Object).Count
    git commit -m "Backup: $stamp" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail-And-Exit 'Commit olusturulamadi.' }
    Step-OK ("$fileCount dosya")
} else {
    Step-OK 'degisiklik yok'
}

# ---- 4/4 Push ----
Write-Step 4 4 "GitHub'a yukleniyor..."
$tmp = [System.IO.Path]::GetTempFileName()
git push origin $branch 2>$tmp
$pushCode = $LASTEXITCODE
$pushErr = ''
if (Test-Path $tmp) {
    $pushErr = [System.IO.File]::ReadAllText($tmp)
    [System.IO.File]::Delete($tmp)
}
if ($pushCode -ne 0) {
    Write-Host ''
    if ($pushErr) { Write-Host $pushErr -ForegroundColor DarkYellow }
    Fail-And-Exit 'Push basarisiz oldu.'
}
Step-OK

# ---- Bitis ----
Write-Host ''
$line = "$([char]0x2500)" * ($W + 2)
$tl = "$([char]0x250C)"; $tr = "$([char]0x2510)"; $bl = "$([char]0x2514)"; $br = "$([char]0x2518)"; $vb = "$([char]0x2502)"
$msg = "  $([char]0x2713)  GitHub yedegi tamamlandi!"
Write-Host "  $tl$line$tr" -ForegroundColor Green
Write-Host ("  $vb{0,-$($W+2)}$vb" -f $msg) -ForegroundColor Green
Write-Host "  $bl$line$br" -ForegroundColor Green
Write-Host ''
exit 0
