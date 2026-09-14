#!/usr/bin/env bash
#
# Upload one deploy's browser source maps to Sentry.
#
# WHY THIS IS NOT JUST A BUILD FLAG
# ---------------------------------
# Turning on `productionBrowserSourceMaps` makes Next emit .map files next to
# the bundles — and the runner stage of apps/web/Dockerfile then DELETES them,
# because a .map served from the app hands any visitor the original TypeScript.
# So the maps exist in exactly one place: the builder stage. This script pulls
# them out of that stage's image, ships them to Sentry over an authenticated
# API call, and throws the copy away.
#
# The auth token therefore never enters `docker build`. It is a plain env var
# in the CI step that runs this script, so it cannot end up in an image layer,
# in `docker history`, or in the registry.
#
# OPTIONAL BY PRESENCE
# --------------------
# Same contract as every other integration in this repo (email, Apify,
# Sentry itself): unconfigured means "skip quietly", never "fail the deploy".
# A missing token here must not stop a release from shipping, and neither
# must a Sentry outage.
#
# Usage: scripts/upload-sentry-sourcemaps.sh <builder-image-ref> <release>
set -uo pipefail

BUILDER_IMAGE="${1:-}"
RELEASE="${2:-}"

if [ -z "$BUILDER_IMAGE" ] || [ -z "$RELEASE" ]; then
  echo "usage: $0 <builder-image-ref> <release>" >&2
  exit 2
fi

if [ -z "${SENTRY_AUTH_TOKEN:-}" ] || [ -z "${SENTRY_ORG:-}" ] || [ -z "${SENTRY_PROJECT:-}" ]; then
  echo "Source-map upload skipped — SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT not all set."
  echo "Stack traces for this release will show minified code. See docs/operations/OBSERVABILITY.md."
  exit 0
fi

# PINNED, like the Supabase CLI in the deploy workflows and for the same
# reason: an unpinned CLI makes every deploy depend on whatever shipped that
# morning. Bump deliberately, after watching a run pass.
SENTRY_CLI="@sentry/cli@2.58.6"

WORKDIR="$(mktemp -d)"
CID=""
cleanup() {
  [ -n "$CID" ] && docker rm -f "$CID" >/dev/null 2>&1
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

CID="$(docker create "$BUILDER_IMAGE" 2>/dev/null)"
if [ -z "$CID" ]; then
  echo "::warning::Could not create a container from $BUILDER_IMAGE — skipping source-map upload."
  exit 0
fi

# Path mirrors the runner stage's own COPY in apps/web/Dockerfile. If that
# COPY path ever changes, this breaks in the same commit and says so.
if ! docker cp "$CID:/app/apps/web/.next/static" "$WORKDIR/static" 2>/dev/null; then
  echo "::warning::No .next/static in $BUILDER_IMAGE — skipping source-map upload."
  exit 0
fi

MAP_COUNT="$(find "$WORKDIR/static" -name '*.map' -type f | wc -l | tr -d ' ')"
if [ "$MAP_COUNT" = "0" ]; then
  echo "::warning::No .map files in the build output. Is productionBrowserSourceMaps still on in apps/web/next.config.ts?"
  exit 0
fi

echo "Uploading $MAP_COUNT source map(s) for release $RELEASE..."

# `~` means "any host", so one upload covers the container URL and the custom
# domain both — which matters here because CI probes the azurecontainerapps.io
# origin while real users arrive on dev.influnet.io.
if npx --yes "$SENTRY_CLI" sourcemaps upload \
  --release "$RELEASE" \
  --url-prefix '~/_next/static' \
  "$WORKDIR/static"; then
  npx --yes "$SENTRY_CLI" releases finalize "$RELEASE" || true
  echo "Source maps uploaded for release $RELEASE."
else
  echo "::warning::Sentry source-map upload failed. The deploy continues; traces for $RELEASE will show minified code."
fi

exit 0
