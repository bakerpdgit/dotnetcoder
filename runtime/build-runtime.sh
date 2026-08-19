#!/usr/bin/env bash
# Builds the .NET WebAssembly runtime bundle into public/dotnet/.
#
# Requires a .NET SDK (9 or newer) and the matching wasm-tools workload:
#   dotnet workload install wasm-tools
#
# Run from the repository root:  npm run build:runtime
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/runtime/DotNetCoder.Runner/DotNetCoder.Runner.csproj"
TESTS="$ROOT/runtime/DotNetCoder.Runner.Tests"
BIN_ROOT="$ROOT/runtime/DotNetCoder.Runner/bin/Release"
OUT="$ROOT/public/dotnet"

if ! command -v dotnet >/dev/null 2>&1; then
  echo "error: the .NET SDK is not on PATH. Install it from https://dotnet.microsoft.com/download" >&2
  exit 1
fi

SDK_VERSION="$(dotnet --version)"
SDK_MAJOR="${SDK_VERSION%%.*}"

if [ "$SDK_MAJOR" -lt 9 ] 2>/dev/null; then
  echo "error: .NET SDK $SDK_VERSION is too old; version 9 or newer is required." >&2
  exit 1
fi

# Build for whatever SDK is installed rather than a pinned version. MSBuild
# picks environment variables up as properties, and runtime/Directory.Build.props
# only supplies its default when this is unset.
export DotNetCoderTargetFramework="${DotNetCoderTargetFramework:-net${SDK_MAJOR}.0}"

echo "==> dotnet --version: $SDK_VERSION  (targeting $DotNetCoderTargetFramework)"

if ! dotnet workload list 2>/dev/null | grep -qi 'wasm-tools'; then
  echo "error: the 'wasm-tools' workload is not installed. Run:" >&2
  echo "         dotnet workload install wasm-tools" >&2
  exit 1
fi

echo "==> Testing the compiler core on desktop .NET"
dotnet run --project "$TESTS" -c Release

echo "==> Publishing the runner for browser-wasm"
dotnet publish "$PROJECT" -c Release

# The SDK has moved this folder between releases (AppBundle, publish/wwwroot),
# so locate it by what it contains rather than by name.
echo "==> Locating the published bundle"
CANDIDATES="$(find "$BIN_ROOT" -type f -name dotnet.js 2>/dev/null \
  | while read -r file; do
      parent="$(dirname "$file")"
      [ "$(basename "$parent")" = "_framework" ] && dirname "$parent"
    done | sort -u)"

if [ -z "$CANDIDATES" ]; then
  echo "error: no _framework/dotnet.js was produced under $BIN_ROOT." >&2
  echo "       Check the publish output above for the real failure." >&2
  exit 1
fi

BUNDLE="$(printf '%s\n' "$CANDIDATES" | grep -E 'AppBundle|publish' | head -1 || true)"
[ -n "$BUNDLE" ] || BUNDLE="$(printf '%s\n' "$CANDIDATES" | head -1)"

echo "==> Copying $BUNDLE -> $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r "$BUNDLE"/. "$OUT"/

if [ ! -f "$OUT/_framework/dotnet.js" ]; then
  echo "error: the copy did not produce $OUT/_framework/dotnet.js." >&2
  echo "       The published layout was not what this script expected; inspect $BUNDLE." >&2
  exit 1
fi

echo "==> Generating references.json"
node "$ROOT/scripts/make-references.mjs" "$OUT"

echo "==> Runtime bundle ready in public/dotnet/"
