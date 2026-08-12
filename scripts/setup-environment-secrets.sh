#!/usr/bin/env bash
# Populates the three GitHub Environments (dev / staging / production) with
# per-environment secrets and variables, replacing the DEV_-prefixed /
# unprefixed-means-staging naming that made these hard to reason about.
#
# Run this yourself, in your own terminal. It reads apps/web/.env.local for
# dev's values (already verified against the live dev deployment) and prompts
# you for staging's, which nobody but you has ever had.
#
# Requires: gh CLI, authenticated as an account with admin on this repo
#   (`gh auth switch --hostname github.com --user vimalsrinivasan1825-ui`
#   if a different account is active — `gh auth status` shows which is).

set -euo pipefail
cd "$(dirname "$0")/.."

R="vimalsrinivasan1825-ui/Influnet"
ENVFILE="apps/web/.env.local"

if [ "$(gh api repos/$R --jq '.permissions.admin' 2>/dev/null)" != "true" ]; then
  echo "The active gh account lacks admin on $R. Run:"
  echo "  gh auth switch --hostname github.com --user vimalsrinivasan1825-ui"
  exit 1
fi

val() { grep -m1 "^$1=" "$ENVFILE" | cut -d= -f2- | tr -d '\r'; }

# An environment secret/variable, once it exists, shadows a same-named repo
# secret for any job that declares that environment — even if its value is
# empty. So an accidental blank here isn't "unset", it's a silent break, the
# same failure this whole reorg exists to stop. Refuse to set one blank.
prompt_required() {
  local label="$1" out=""
  while [ -z "$out" ]; do
    read -r -s -p "$label: " out; echo
    [ -z "$out" ] && echo "  (required — can't be blank, it would shadow the working repo secret with nothing)"
  done
  printf '%s' "$out"
}

echo "== dev environment — from $ENVFILE (verified against the live deploy) =="
gh variable set SUPABASE_URL        --env dev -R "$R" --body "$(val NEXT_PUBLIC_SUPABASE_URL)"
gh variable set SUPABASE_ANON_KEY   --env dev -R "$R" --body "$(val NEXT_PUBLIC_SUPABASE_ANON_KEY)"
gh variable set STREAM_API_KEY      --env dev -R "$R" --body "$(val NEXT_PUBLIC_STREAM_API_KEY)"
gh secret   set SUPABASE_SERVICE_ROLE_KEY --env dev -R "$R" --body "$(val SUPABASE_SERVICE_ROLE_KEY)"
gh secret   set STREAM_API_SECRET   --env dev -R "$R" --body "$(val STREAM_API_SECRET)"
echo "dev populated."
echo

echo "== dev DB migration password =="
echo "Leave blank to keep the existing SUPABASE_DEV_DB_PASSWORD repo secret"
echo "(deploy-dev.yml still reads that name — this is the one value the"
echo "reorg intentionally did not rename, since I have no way to read it"
echo "back out to move it, and it's not part of the app-runtime confusion)."
read -r -s -p "New value for dev SUPABASE_DB_PASSWORD (or Enter to skip): " DEV_DB_PW; echo
if [ -n "$DEV_DB_PW" ]; then
  gh secret set SUPABASE_DB_PASSWORD --env dev -R "$R" --body "$DEV_DB_PW"
  echo "dev SUPABASE_DB_PASSWORD set — you'll need to update deploy-dev.yml's"
  echo "migrate job to read it under the new name (SUPABASE_DB_PASSWORD"
  echo "instead of SUPABASE_DEV_DB_PASSWORD) once this exists."
fi
echo

echo "== staging environment =="
echo "Project is aokdansyqxracuwsosji — that part I know for certain."
echo "The rest, paste from the Supabase dashboard (Settings -> API) and"
echo "wherever you already have staging's Stream / DB credentials. These"
echo "never pass through anything but this terminal."
echo
gh variable set SUPABASE_URL --env staging -R "$R" --body "https://aokdansyqxracuwsosji.supabase.co"

STG_ANON="$(prompt_required "Staging SUPABASE_ANON_KEY (publishable key, starts sb_publishable_)")"
gh variable set SUPABASE_ANON_KEY --env staging -R "$R" --body "$STG_ANON"

STG_STREAM_KEY="$(prompt_required "Staging STREAM_API_KEY (Stream app key, public)")"
gh variable set STREAM_API_KEY --env staging -R "$R" --body "$STG_STREAM_KEY"

STG_SERVICE_KEY="$(prompt_required "Staging SUPABASE_SERVICE_ROLE_KEY (starts eyJ)")"
gh secret set SUPABASE_SERVICE_ROLE_KEY --env staging -R "$R" --body "$STG_SERVICE_KEY"

STG_STREAM_SECRET="$(prompt_required "Staging STREAM_API_SECRET")"
gh secret set STREAM_API_SECRET --env staging -R "$R" --body "$STG_STREAM_SECRET"

echo
echo "Staging DB password: leave the existing SUPABASE_STAGING_DB_PASSWORD"
echo "repo secret as-is (deploy-staging.yml keeps reading that name), unless"
echo "you want to rotate it now."
read -r -s -p "New value for staging SUPABASE_DB_PASSWORD (or Enter to skip): " STG_DB_PW; echo
if [ -n "$STG_DB_PW" ]; then
  gh secret set SUPABASE_DB_PASSWORD --env staging -R "$R" --body "$STG_DB_PW"
fi

echo
echo "== production environment =="
echo "Nothing to set yet — there is no production Supabase project or"
echo "container app (see docs/operations/HANDOVER.md P0.2/P0.3). The"
echo "environment and its branch restriction (main only) already exist;"
echo "populate SUPABASE_URL / SUPABASE_ANON_KEY / STREAM_API_KEY (variables)"
echo "and SUPABASE_SERVICE_ROLE_KEY / STREAM_API_SECRET / SUPABASE_DB_PASSWORD"
echo "(secrets) the same way, once those exist."
echo
echo "Done. Verify names only (gh never shows values back):"
echo "  gh variable list --env dev -R $R"
echo "  gh secret list   --env dev -R $R"
echo "  gh variable list --env staging -R $R"
echo "  gh secret list   --env staging -R $R"
