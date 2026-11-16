# Shared by private-seal.sh / private-unseal.sh / private-hooks.sh. Sourced, not run.
# Hidden tests: plaintext only in <package>/test/private/ (gitignored), the repo holds private-tests/tests.tar.age,
# encrypted with age for every public key in private-tests/recipients.txt.
# These scripts never print test content: only counts and file paths.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
PKGS=(backend frontend)
SEALED="private-tests/tests.tar.age"
RECIPIENTS="private-tests/recipients.txt"
KEY="${AGE_KEY_FILE:-$HOME/.config/age/react-crud-private-tests.key}"
# State of this checkout (never committed): line 1 = hash of the plaintext tree, line 2 = sha256 of the sealed file,
# both as of the last seal / unseal on this machine.
STATE="$(git rev-parse --git-path private-tests-state)"

die() { echo "$(basename "$0"): $*" >&2; exit 1; }
sha() { shasum -a 256 | cut -d' ' -f1; }

# Plaintext test files, relative to ROOT, sorted (macOS metadata files ignored).
plain_files() {
  local p
  for p in "${PKGS[@]}"; do
    if [[ -d "$p/test/private" ]]; then find "$p/test/private" -type f ! -name .DS_Store ! -name '._*'; fi
  done | LC_ALL=C sort
}
tree_hash() {
  local f
  plain_files | while IFS= read -r f; do printf '%s\n' "$f"; sha < "$f"; done | sha
}
blob_hash() { if [[ -f "$SEALED" ]]; then sha < "$SEALED"; else echo none; fi; }
state_tree() { [[ -f "$STATE" ]] && sed -n 1p "$STATE" || true; }
state_blob() { [[ -f "$STATE" ]] && sed -n 2p "$STATE" || true; }
save_state() { printf '%s\n%s\n' "$(tree_hash)" "$(blob_hash)" > "$STATE"; }
count_files() { plain_files | grep -c . || true; }
need_age() { command -v age >/dev/null || die "age not installed (macOS: brew install age; Windows: winget install FiloSottile.age)"; }
# Local plaintext differs from what was last sealed / unsealed here.
# No state yet: changed when any plaintext exists (it was never sealed from this checkout).
local_changed() {
  if [[ -f "$STATE" ]]; then [[ "$(tree_hash)" != "$(state_tree)" ]]; else [[ "$(count_files)" -gt 0 ]]; fi
}
