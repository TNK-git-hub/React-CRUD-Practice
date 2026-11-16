#!/usr/bin/env bash
# Encrypt the hidden tests (<package>/test/private/) into private-tests/tests.tar.age for every key in
# private-tests/recipients.txt. Then commit that file. Prints counts only.
#   bash k8s/agents/private-seal.sh           seal if the plaintext changed since the last seal / unseal
#   bash k8s/agents/private-seal.sh --force   seal anyway (after editing recipients.txt)
# Refuses when the sealed file was changed by someone else since this machine last sealed / unsealed it
# (a pull brought newer tests): run private-unseal.sh --merge first, so their tests are not dropped.
source "$(dirname "$0")/private-lib.sh"

FORCE=0
case "${1:-}" in --force) FORCE=1 ;; "") ;; *) die "usage: $0 [--force]" ;; esac
need_age

n="$(count_files)"
[[ "$n" -gt 0 ]] || die "no hidden tests in backend/test/private or frontend/test/private"
keys="$(grep -cE '^age1[0-9a-z]+$' "$RECIPIENTS" || true)"
[[ "$keys" -gt 0 ]] || die "no public key in $RECIPIENTS"

if [[ -f "$SEALED" && "$(blob_hash)" != "$(state_blob)" ]]; then
  die "$SEALED changed since this machine last sealed/unsealed it (newer tests from another machine). Run: bash k8s/agents/private-unseal.sh --merge"
fi
if [[ "$FORCE" == 0 && -f "$SEALED" ]] && ! local_changed; then
  echo "private-seal: unchanged ($n files), nothing to do"
  exit 0
fi

dirs=()
for p in "${PKGS[@]}"; do [[ -d "$p/test/private" ]] && dirs+=("$p/test/private"); done
tmp="$SEALED.tmp"
# COPYFILE_DISABLE: no macOS ._ files in the archive
COPYFILE_DISABLE=1 tar -cf - --exclude .DS_Store --exclude '._*' "${dirs[@]}" | age -R "$RECIPIENTS" -o "$tmp"
mv "$tmp" "$SEALED"
save_state
echo "private-seal: $n files -> $SEALED ($keys recipients). Commit it: git add $SEALED"
