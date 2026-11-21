#!/bin/bash
# Custom publish script for npm OIDC trusted publishing.
# Replaces `changeset publish` to explicitly pass --provenance which
# triggers the OIDC token exchange that changesets/action doesn't support.
set -euo pipefail

# pnpm pack rewrites workspace:* dependencies to registry versions. Publishing
# package directories with npm preserves workspace:* and breaks outside installs.
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: bash scripts/publish-oidc.sh [--dry-run]" >&2
  exit 1
fi
RELEASE_PACKAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$RELEASE_PACKAGE_DIR"' EXIT

# Publish order matters: core must go first (others depend on it)
PACKAGES=("core" "recommender" "web" "wechat")

for pkg in "${PACKAGES[@]}"; do
  PKG_DIR="packages/$pkg"
  PKG_NAME=$(node -p "require('./$PKG_DIR/package.json').name")
  PKG_VERSION=$(node -p "require('./$PKG_DIR/package.json').version")

  # Skip if already published
  if [[ "$DRY_RUN" == false ]] && npm view "$PKG_NAME@$PKG_VERSION" version > /dev/null 2>&1; then
    echo "⏭️  $PKG_NAME@$PKG_VERSION already published, skipping"
    continue
  fi

  (cd "$PKG_DIR" && pnpm pack --pack-destination "$RELEASE_PACKAGE_DIR")
  TARBALL_NAME="${PKG_NAME#@}"
  TARBALL_NAME="${TARBALL_NAME//\//-}-$PKG_VERSION.tgz"
  PACKAGE_TARBALL="$RELEASE_PACKAGE_DIR/$TARBALL_NAME"
  node scripts/validate-package-tarball.mjs "$PACKAGE_TARBALL" "$PKG_NAME" "$PKG_VERSION"
  if [[ "$DRY_RUN" == true ]]; then
    echo "Validated publishable archive: $PKG_NAME@$PKG_VERSION"
    continue
  fi

  echo "📦 Publishing $PKG_NAME@$PKG_VERSION with --provenance..."
  npm publish "$PACKAGE_TARBALL" --provenance --access public
  echo "✅ Published $PKG_NAME@$PKG_VERSION"
done

if [[ "$DRY_RUN" == true ]]; then
  echo "All package archives validated; nothing published."
  exit 0
fi

# A release tag describes the complete package set, not just the first upload.
TAG="v$(node -p "require('./packages/core/package.json').version")"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "⏭️  Tag $TAG already exists, skipping"
else
  git tag "$TAG"
  git push origin "$TAG"
  echo "🏷️  Created and pushed tag $TAG"
fi

echo "🎉 All packages published."
