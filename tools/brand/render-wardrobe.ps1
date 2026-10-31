# Renders Wardrobe Designer's brand images from tools/brand/wardrobe.html with headless Chrome,
# as render.ps1 does EDGEmat's.
#
#   .\tools\brand\render-wardrobe.ps1
#
# Output (committed), in docs/assets/wardrobe-designer:
#   banner.png   2560 x 640, at the top of the Nexus description and the docs page
#   social.png   1280 x 640, for links shared on social sites
#   nexus.png    1280 x 640, the Nexus page's primary image: the social layout 55 px lower, with the top
#                left empty for the EDGEmodders header, which the owner adds by hand. Rendering it
#                again clears the header: add it again after
#   icon.png     256 x 256, transparent cut corners

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$src = Join-Path $PSScriptRoot 'wardrobe.html'
$out = Join-Path $repo 'docs\assets\wardrobe-designer'
New-Item -ItemType Directory -Force $out | Out-Null

$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Chrome or Edge not found.' }

$url = 'file:///' + ($src -replace '\\', '/')
$profileDir = Join-Path $env:TEMP 'edgemat-brand-chrome'

function Render($kind, $width, $height, $scale) {
    $target = Join-Path $out "$kind.png"
    if (Test-Path $target) { Remove-Item $target }
    # Chrome logs harmless errors to stderr. Windows PowerShell 5.1 would treat them as fatal under 'Stop'.
    $ErrorActionPreference = 'Continue'
    # The virtual time budget gives the web fonts time to load; the transparent background keeps the icon's cut corners.
    & $chrome --headless=new --disable-gpu --hide-scrollbars --no-first-run "--user-data-dir=$profileDir" `
        "--window-size=$width,$height" "--force-device-scale-factor=$scale" --default-background-color=00000000 `
        --virtual-time-budget=8000 "--screenshot=$target" "$url`?kind=$kind" 2>$null | Out-Null
    $ErrorActionPreference = 'Stop'
    if (-not (Test-Path $target)) { throw "Render failed: $kind.png" }
    Write-Output "Rendered $target"
}

Render 'banner' 2560 640 1
Render 'social' 1280 640 1
Render 'nexus' 1280 640 1
Render 'icon' 256 256 1
