# Releases

This repository publishes GitHub Releases, not the upstream npm package.
The official runtime is rebuilt from `zcode-runtime.lock.json`; no scheduled
upstream update or npm publishing workflow runs here.

## Publish

Update `package.json` to the desired `<app-version>-<build>` version, commit,
then push a matching tag:

```bash
git tag v3.10.2-22
git push origin v3.10.2-22
```

Pushes to `master` build downloadable artifacts without publishing. You can
also run **Release** manually from the Actions page. Only a tag push creates a GitHub Release.
Use a new package version for each release.

A tag matching the locked Desktop version (for example `v3.10.2`) is also
accepted. The CLI package and asset filenames retain their build number
(for example `3.10.2-22`).

The workflow validates the locked runtime, runs the tests and TUI smoke suite,
then builds these assets:

- `zcode-app-cli-<version>.tgz` — npm-installable package
- `zcode-app-cli-<version>-linux-amd64.tar.gz`
- `zcode-app-cli-<version>-darwin-arm64.tar.gz`

Portable packages include a native launcher, Node.js 24.16.0, and the runtime.
Extract the whole directory and run `./zcode`; do not copy the launcher alone.
Linux builds use Ubuntu 22.04, and macOS arm64 builds use macOS 15.

## Local build

Requires Node.js 24.16.0, Bun 1.3.12, Go 1.24 or newer, and `7z` for extraction.

```bash
bun install --frozen-lockfile
bun run release:build
bun run release:pack
bun run release:portable
```

`release:portable` builds for the current host (Linux x64 or macOS arm64).
It signs macOS binaries ad hoc and smoke-tests the extracted archive.
Outputs are in `.release/`, which is excluded from Git. `release:pack` clears
that directory, so run it before `release:portable`.
