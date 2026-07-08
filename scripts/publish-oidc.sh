#!/bin/bash
# Custom publish script for npm OIDC trusted publishing.
# Replaces `changeset publish` to explicitly pass --provenance which
# triggers the OIDC token exchange that changesets/action doesn't support.
set -e

# Publish order matters: core must go first (others depend on it)
PACKAGES=("core" "recommender" "web" "wechat")

for pkg in "${PACKAGES[@]}"; do
  PKG_DIR="packages/$pkg"
  PKG_NAME=$(node -p "require('./$PKG_DIR/package.json').name")
  PKG_VERSION=$(node -p "require('./$PKG_DIR/package.json').version")

  # Skip if already published
  if npm view "$PKG_NAME@$PKG_VERSION" version > /dev/null 2>&1; then
    echo "⏭️  $PKG_NAME@$PKG_VERSION already published, skipping"
    continue
  fi

  echo "📦 Publishing $PKG_NAME@$PKG_VERSION with --provenance..."
  (cd "$PKG_DIR" && npm publish --provenance --access public)
  echo "✅ Published $PKG_NAME@$PKG_VERSION"
done

echo "🎉 All packages published."
