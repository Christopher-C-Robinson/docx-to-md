#!/usr/bin/env bash
# install.sh — One-command installer for docx-to-md (macOS & Linux)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Christopher-C-Robinson/docx-to-md/main/scripts/install.sh | bash
#
# Environment overrides:
#   INSTALL_DIR   — directory to install the docx2md binary (default: /usr/local/bin,
#                   falls back to ~/.local/bin if not writable without sudo)
#   APP_DIR       — macOS only: directory for the .app bundle
#                   (default: ~/Applications, or /Applications if writable)

set -euo pipefail

REPO="Christopher-C-Robinson/docx-to-md"
GITHUB_API="https://api.github.com/repos/${REPO}/releases/latest"
APP_NAME="docx2md"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { printf "${BOLD}==> %s${RESET}\n" "$*"; }
success() { printf "${GREEN}✓  %s${RESET}\n" "$*"; }
warn()    { printf "${YELLOW}Warning: %s${RESET}\n" "$*" >&2; }
error()   { printf "${RED}Error: %s${RESET}\n" "$*" >&2; exit 1; }

# ── Dependency checks ─────────────────────────────────────────────────────────
command -v curl  >/dev/null 2>&1 || error "'curl' is required but not installed."

# ── Platform detection ────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  ASSET_SUFFIX="mac-arm64.zip" ;;
      x86_64) ASSET_SUFFIX="mac-x64.zip"   ;;
      *) error "Unsupported macOS architecture: $ARCH" ;;
    esac
    PLATFORM="macOS ($ARCH)"
    ;;
  Linux)
    case "$ARCH" in
      x86_64) ASSET_SUFFIX="linux-x64.AppImage" ;;
      *)
        error "Pre-built binaries are only available for Linux x86_64.
For other architectures, install via npm:  npm install -g docx-to-md"
        ;;
    esac
    PLATFORM="Linux ($ARCH)"
    ;;
  *)
    error "Unsupported OS: $OS.
For Windows, run the PowerShell installer instead:
  powershell -NoProfile -ExecutionPolicy Bypass -Command \"iwr https://raw.githubusercontent.com/Christopher-C-Robinson/docx-to-md/main/scripts/install.ps1 -UseBasicParsing | iex\""
    ;;
esac

# ── Fetch latest release info ─────────────────────────────────────────────────
info "Fetching latest release information..."
RELEASE_JSON="$(curl -fsSL "$GITHUB_API")" \
  || error "Failed to fetch release info from GitHub. Check your internet connection."

VERSION="$(printf '%s' "$RELEASE_JSON" \
  | grep '"tag_name"' \
  | head -1 \
  | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
[ -n "$VERSION" ] || error "Could not determine latest release version."

DOWNLOAD_URL="$(printf '%s' "$RELEASE_JSON" \
  | grep '"browser_download_url"' \
  | grep "$ASSET_SUFFIX" \
  | head -1 \
  | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/')"
[ -n "$DOWNLOAD_URL" ] || error "Could not find a release asset matching '$ASSET_SUFFIX' for $VERSION."

FILENAME="$(basename "$DOWNLOAD_URL")"

# ── Resolve install directories ───────────────────────────────────────────────
if [ "$OS" = "Darwin" ]; then
  # Prefer user-local ~/Applications (no sudo needed); fall back to /Applications
  if [ -n "${APP_DIR:-}" ]; then
    APPS_DIR="$APP_DIR"
  elif [ -d "$HOME/Applications" ] || mkdir -p "$HOME/Applications" 2>/dev/null; then
    APPS_DIR="$HOME/Applications"
  else
    APPS_DIR="/Applications"
  fi
fi

# Binary / wrapper destination
# Resolution order: explicit INSTALL_DIR env var > writable /usr/local/bin >
# passwordless sudo to /usr/local/bin > user-local ~/.local/bin (no sudo).
if [ -n "${INSTALL_DIR:-}" ]; then
  BIN_DIR="$INSTALL_DIR"
elif [ -w "/usr/local/bin" ]; then
  BIN_DIR="/usr/local/bin"
elif sudo -n true 2>/dev/null; then
  BIN_DIR="/usr/local/bin"
else
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
fi

# ── Download ──────────────────────────────────────────────────────────────────
info "Installing docx-to-md $VERSION for $PLATFORM..."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TMP_FILE="$TMP_DIR/$FILENAME"

info "Downloading $FILENAME..."
curl -fsSL --progress-bar -o "$TMP_FILE" "$DOWNLOAD_URL" \
  || error "Download failed. URL: $DOWNLOAD_URL"

# ── Install ───────────────────────────────────────────────────────────────────
install_file() {
  # install_file <src> <dest>
  local src="$1" dest="$2"
  if [ -w "$(dirname "$dest")" ]; then
    cp "$src" "$dest"
  elif sudo -n true 2>/dev/null; then
    sudo cp "$src" "$dest"
    sudo chmod +x "$dest"
  else
    error "Cannot write to $(dirname "$dest"). Re-run with sudo or set INSTALL_DIR to a writable path."
  fi
}

case "$OS" in
  # ── macOS ──────────────────────────────────────────────────────────────────
  Darwin)
    command -v unzip >/dev/null 2>&1 || error "'unzip' is required but not installed."

    info "Extracting application bundle..."
    unzip -q "$TMP_FILE" -d "$TMP_DIR/extracted"

    APP_BUNDLE="$(find "$TMP_DIR/extracted" -maxdepth 2 -name "*.app" | head -1)"
    [ -n "$APP_BUNDLE" ] || error "No .app bundle found in the downloaded archive."
    APP_BUNDLE_NAME="$(basename "$APP_BUNDLE")"
    DEST_APP="$APPS_DIR/$APP_BUNDLE_NAME"

    info "Installing $APP_BUNDLE_NAME to $APPS_DIR/..."
    [ -d "$DEST_APP" ] && rm -rf "$DEST_APP"
    cp -r "$APP_BUNDLE" "$DEST_APP"

    # Remove the Gatekeeper quarantine attribute so the app opens without warning.
    # This is safe for software you have intentionally chosen to install.
    xattr -rd com.apple.quarantine "$DEST_APP" 2>/dev/null || true

    # Create a thin CLI launcher so `docx2md` is available from the terminal.
    MACOS_EXE="$(find "$DEST_APP/Contents/MacOS" -maxdepth 1 -type f | head -1)"
    if [ -n "$MACOS_EXE" ]; then
      WRAPPER="$TMP_DIR/docx2md-wrapper"
      cat > "$WRAPPER" <<EOF
#!/bin/sh
exec "$MACOS_EXE" "\$@"
EOF
      chmod +x "$WRAPPER"
      install_file "$WRAPPER" "$BIN_DIR/$APP_NAME"
      chmod +x "$BIN_DIR/$APP_NAME" 2>/dev/null || true
      success "CLI launcher installed at $BIN_DIR/$APP_NAME"
    else
      warn "Could not locate the macOS executable inside $DEST_APP. CLI launcher skipped."
    fi

    success "$APP_BUNDLE_NAME installed to $APPS_DIR/"
    ;;

  # ── Linux ───────────────────────────────────────────────────────────────────
  Linux)
    chmod +x "$TMP_FILE"
    DEST_BIN="$BIN_DIR/$APP_NAME"
    install_file "$TMP_FILE" "$DEST_BIN"
    chmod +x "$DEST_BIN" 2>/dev/null || true
    success "Binary installed at $DEST_BIN"
    ;;
esac

# ── PATH hint ─────────────────────────────────────────────────────────────────
if [[ "$BIN_DIR" = "$HOME/.local/bin" ]] && [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  warn "$HOME/.local/bin is not on your PATH."
  warn "Add the following line to your shell profile (~/.bashrc, ~/.zshrc, etc.) and restart your shell:"
  warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

# ── Success message ───────────────────────────────────────────────────────────
echo ""
success "docx-to-md $VERSION installed!"
echo ""
printf '%s\n' "${BOLD}Launch the desktop app:${RESET}"
if [ "$OS" = "Darwin" ]; then
  printf '  open "%s"\n' "$APPS_DIR/$APP_BUNDLE_NAME"
  printf '  %s\n' "# or double-click it in Finder"
else
  printf '  %s\n' "$BIN_DIR/$APP_NAME"
fi
echo ""
printf '%s\n' "${BOLD}CLI (Node.js required):${RESET}"
printf "  npm install -g docx-to-md\n"
printf "  docx2md convert input.docx -o output.md\n"
echo ""
