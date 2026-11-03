#!/usr/bin/env bash
# Publishes the committed app (HEAD) to GitHub as the remote's main branch, leaving out the
# private planning folder and the comparison scripts. It builds a separate "publish" branch,
# so nothing excluded ever enters the published history, even from old commits.
#
#   bash scripts/publish.sh            # push to the remote called "origin"
#   bash scripts/publish.sh --dry-run  # build the publish branch and list what would go, no push
set -euo pipefail

REMOTE=origin
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

EXCLUDE=(
  replica                        # research, parity notes, reference screenshots: private
  scripts/capture-original.mjs   # captured the reference screenshots
  scripts/capture-compare.mjs
  scripts/parity.mjs
  scripts/imgdiff.mjs
  .claude                        # this machine's local tool settings
)

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes: commit first. Only committed work (HEAD) is published." >&2
  exit 1
fi

idx="$(mktemp)"
trap 'rm -f "$idx"' EXIT
GIT_INDEX_FILE="$idx" git read-tree HEAD
GIT_INDEX_FILE="$idx" git rm -r -q --cached --ignore-unmatch -- "${EXCLUDE[@]}"
tree="$(GIT_INDEX_FILE="$idx" git write-tree)"

# Safety net: refuse if anything excluded, or any mention of the reference app's site, slipped through.
if git ls-tree -r --name-only "$tree" | grep -qE '^replica/'; then
  echo "Refusing: replica/ is in the publish tree." >&2; exit 1
fi
REF='aura''meet' # split so this script doesn't match itself
if git grep -l -i -I "$REF" "$tree" -- . >/dev/null 2>&1; then
  echo "Refusing: these files mention the reference app:" >&2
  git grep -l -i -I "$REF" "$tree" -- . >&2; exit 1
fi

parent="$(git rev-parse -q --verify refs/heads/publish || true)"
if [ -n "$parent" ] && [ "$(git rev-parse "$parent^{tree}")" = "$tree" ]; then
  echo "Publish branch is already up to date with HEAD."
else
  msg="Publish $(git rev-parse --short HEAD): $(git log -1 --format=%s)"
  commit="$(git commit-tree "$tree" ${parent:+-p "$parent"} -m "$msg" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")"
  git update-ref refs/heads/publish "$commit"
  echo "Publish branch now at $(git rev-parse --short "$commit")"
fi

echo "$(git ls-tree -r --name-only refs/heads/publish | wc -l) files will be published."
if [ "$DRY" = 1 ]; then
  echo "Dry run: not pushing."
  exit 0
fi
git push "$REMOTE" publish:main
