#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
repo_root="$PWD"
version=$(node -p 'require("./package.json").version')
platform=$(node -p 'process.platform')
arch=$(node -p 'process.arch')
case "$platform/$arch" in
  linux/x64) target=linux-amd64 ;;
  darwin/arm64) target=darwin-arm64 ;;
  *) echo "Unsupported native build platform: $platform/$arch" >&2; exit 1 ;;
esac

tarball="$repo_root/.release/zcode-app-cli-$version.tgz"
name="zcode-app-cli-$version-$target"
work_dir=$(mktemp -d)
trap 'rm -rf -- "$work_dir"' EXIT
stage="$work_dir/$name"
mkdir -p "$stage"
tar -xzf "$tarball" --strip-components=1 -C "$stage"
npm install --prefix "$stage" --omit=dev --ignore-scripts --no-audit --no-fund
mkdir -p "$stage/runtime"
cp "$(node -p 'process.execPath')" "$stage/runtime/node"
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o "$stage/zcode" scripts/portable-launcher.go
chmod +x "$stage/zcode" "$stage/runtime/node"
if [[ "$platform" == darwin ]]; then
  codesign --force --sign - "$stage/runtime/node"
  codesign --force --sign - "$stage/zcode"
  codesign --verify "$stage/zcode"
  codesign --verify "$stage/runtime/node"
fi

archive="$repo_root/.release/$name.tar.gz"
tar -czf "$archive" -C "$work_dir" "$name"
mkdir "$work_dir/verify"
tar -xzf "$archive" -C "$work_dir/verify"
# Verify the extracted layout, including PATH-style symlink invocation.
ln -s "$work_dir/verify/$name/zcode" "$work_dir/zcode"
"$work_dir/zcode" --version
"$work_dir/zcode" doctor --json
echo "Packed $archive"
