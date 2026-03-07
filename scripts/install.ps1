# install.ps1 — One-command installer for docx-to-md (Windows)
#
# Usage (paste in PowerShell):
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://raw.githubusercontent.com/Christopher-C-Robinson/docx-to-md/main/scripts/install.ps1 -UseBasicParsing | iex"
#
# Environment overrides:
#   $env:DOCX2MD_INSTALL_DIR  — directory to install the docx2md binary
#                               (default: %LOCALAPPDATA%\Programs\docx-to-md)

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# ── Configuration ──────────────────────────────────────────────────────────────
$Repo        = 'Christopher-C-Robinson/docx-to-md'
$ApiUrl      = "https://api.github.com/repos/$Repo/releases/latest"
$AppName     = 'docx2md'
$AssetSuffix = 'win-x64-portable.exe'

# Respect an optional environment override for the install directory.
if ($env:DOCX2MD_INSTALL_DIR) {
    $InstallDir = $env:DOCX2MD_INSTALL_DIR
} else {
    $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\docx-to-md'
}

# ── Helper functions ──────────────────────────────────────────────────────────
function Write-Step  { param([string]$Msg) Write-Host "==> $Msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Msg) Write-Host "  $Msg" -ForegroundColor Green }
function Write-Warn  { param([string]$Msg) Write-Host "Warning: $Msg" -ForegroundColor Yellow }
function Fail        { param([string]$Msg) Write-Host "Error: $Msg" -ForegroundColor Red; exit 1 }

# ── Architecture check ────────────────────────────────────────────────────────
$Is64BitOS = [Environment]::Is64BitOperatingSystem
if (-not $Is64BitOS) {
    Fail "Only x64 Windows is currently supported by pre-built releases.`nFor other architectures, install via npm: npm install -g docx-to-md"
}

# ── Fetch latest release info ─────────────────────────────────────────────────
Write-Step "Fetching latest release information..."

try {
    $Headers = @{ 'User-Agent' = 'docx-to-md-installer/1.0' }
    $Release = Invoke-RestMethod -Uri $ApiUrl -Headers $Headers
} catch {
    Fail "Failed to fetch release info from GitHub. Check your internet connection.`n$_"
}

$Version = $Release.tag_name
if (-not $Version) { Fail "Could not determine latest release version." }

$Asset = $Release.assets | Where-Object { $_.name -like "*$AssetSuffix" } | Select-Object -First 1
if (-not $Asset) { Fail "Could not find a release asset matching '*$AssetSuffix' for $Version." }

$DownloadUrl = $Asset.browser_download_url
$FileName    = $Asset.name

# ── Download ──────────────────────────────────────────────────────────────────
Write-Step "Installing docx-to-md $Version for Windows (x64)..."

$TmpDir  = Join-Path ([System.IO.Path]::GetTempPath()) "docx2md-install-$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

$TmpFile = Join-Path $TmpDir $FileName

try {
    Write-Step "Downloading $FileName..."
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $TmpFile -UseBasicParsing
} catch {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
    Fail "Download failed. URL: $DownloadUrl`n$_"
}

# ── Install ───────────────────────────────────────────────────────────────────
Write-Step "Installing to $InstallDir..."

# Create the install directory if it does not exist (no admin needed for %LOCALAPPDATA%).
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

$DestExe = Join-Path $InstallDir "$AppName.exe"
Copy-Item -Path $TmpFile -Destination $DestExe -Force
try {
    # Best-effort removal of Mark-of-the-Web on the installed executable.
    Unblock-File -Path $DestExe -ErrorAction SilentlyContinue
} catch {
    # Ignore when unavailable or restricted.
}

# Clean up the temporary download directory.
Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue

Write-Ok "Binary installed at $DestExe"

# ── Update user PATH ──────────────────────────────────────────────────────────
$UserPath = [System.Environment]::GetEnvironmentVariable('PATH', 'User')
$PathDirs  = $UserPath -split ';' | Where-Object { $_ -ne '' }

if ($PathDirs -notcontains $InstallDir) {
    Write-Step "Adding $InstallDir to your user PATH..."
    $NewPath = ($PathDirs + $InstallDir) -join ';'
    [System.Environment]::SetEnvironmentVariable('PATH', $NewPath, 'User')
    # Apply to the current session as well.
    $env:PATH = "$env:PATH;$InstallDir"
    Write-Ok "PATH updated. Restart your terminal (or open a new window) to use 'docx2md'."
} else {
    Write-Ok "$InstallDir is already on your PATH."
}

# ── Start Menu shortcut ───────────────────────────────────────────────────────
$StartMenuDir = [System.IO.Path]::Combine(
    $env:APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null

$ShortcutPath = Join-Path $StartMenuDir "$AppName.lnk"
try {
    $WshShell  = New-Object -ComObject WScript.Shell
    $Shortcut  = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath      = $DestExe
    $Shortcut.Description     = 'Convert DOCX files to Markdown'
    $Shortcut.WorkingDirectory = $InstallDir
    $Shortcut.Save()
    Write-Ok "Start Menu shortcut created at $ShortcutPath"
} catch {
    Write-Warn "Could not create Start Menu shortcut: $_"
}

# ── Success message ───────────────────────────────────────────────────────────
Write-Host ""
Write-Ok "docx-to-md $Version installed!"
Write-Host ""
Write-Host "Launch the desktop app:" -ForegroundColor Cyan
Write-Host "  docx2md.exe"
Write-Host "  # or search for 'docx2md' in the Start Menu"
Write-Host "  # or double-click $DestExe"
Write-Host ""
Write-Host "CLI (Node.js required):" -ForegroundColor Cyan
Write-Host "  npm install -g docx-to-md"
Write-Host "  docx2md convert input.docx -o output.md"
Write-Host ""
