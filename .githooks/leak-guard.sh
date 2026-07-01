#!/usr/bin/env bash
# Re-leak guard for the public repository.
#
# Blocks staged changes that re-introduce private fleet names, internal
# hosts/IPs, or secrets that were scrubbed before open-sourcing. Scans staged
# ADDITIONS only. Bypass with `git commit --no-verify` for a confirmed false
# positive.
set -euo pipefail

added="$(git diff --cached --unified=0 --no-color -- . ':(exclude).githooks/leak-guard.sh' | grep -E '^\+' | grep -vE '^\+\+\+' || true)"
[ -z "$added" ] && exit 0

# Unique private app slugs (word-boundaried to avoid English collisions),
# internal hosts/IPs, and high-signal secret formats. aidd / aidd-web are
# legitimate names and are intentionally NOT listed.
pattern='wyrd|192\.168\.1\.20|\b(groundtruth|ottoboard|marginminder|tribewall|sketchysuspects|syndicate85|synchronosity|reportal|skedman|openplanner|veiledroad|valeholla|mundiary|aidd-squad)\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}'

hits="$(printf '%s\n' "$added" | grep -nEi "$pattern" || true)"
if [ -n "$hits" ]; then
	echo "" >&2
	echo "x re-leak guard: staged changes contain forbidden private/secret patterns:" >&2
	printf '%s\n' "$hits" | head -20 >&2
	echo "" >&2
	echo "  Scrub these before committing. If genuinely a false positive," >&2
	echo "  bypass with: git commit --no-verify" >&2
	exit 1
fi
exit 0
