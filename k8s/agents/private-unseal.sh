#!/usr/bin/env bash
# Decrypt private-tests/tests.tar.age into <package>/test/private/ with this machine's key
# (~/.config/age/react-crud-private-tests.key, or $AGE_KEY_FILE). Prints counts and file paths, never content.
#   bash k8s/agents/private-unseal.sh           replace the local hidden tests with the sealed ones;
#                                               refuses when local tests have changes that were not sealed
#   bash k8s/agents/private-unseal.sh --merge   union: local tests + sealed tests (+ "theirs" during a git merge
#                                               conflict on the sealed file); same path with different content stops
#   bash k8s/agents/private-unseal.sh --force   replace, discarding local changes that were not sealed
#   bash k8s/agents/private-unseal.sh --auto    for git hooks: no key or nothing new = silent; local changes = warn only
source "$(dirname "$0")/private-lib.sh"

MODE=replace
case "${1:-}" in --merge) MODE=merge ;; --force) MODE=force ;; --auto) MODE=auto ;; "") ;; *) die "usage: $0 [--merge|--force|--auto]" ;; esac

if [[ "$MODE" == auto ]]; then
  command -v age >/dev/null && [[ -f "$KEY" && -f "$SEALED" ]] || exit 0
  [[ "$(blob_hash)" == "$(state_blob)" ]] && exit 0
  if local_changed; then
    echo "private-unseal: newer sealed hidden tests arrived, but local ones are not sealed: run private-unseal.sh --merge" >&2
    exit 0
  fi
  MODE=replace
fi

need_age
[[ -f "$KEY" ]] || die "no key at $KEY (age-keygen -o $KEY, then add its public key to $RECIPIENTS)"
[[ -f "$SEALED" ]] || { echo "private-unseal: no $SEALED, nothing to do"; exit 0; }

if [[ "$MODE" == replace ]] && local_changed; then
  die "local hidden tests have changes that are not sealed. Seal them (private-seal.sh), union them (--merge) or discard them (--force)"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
decrypt() { age -d -i "$KEY" | tar -xf - -C "$1"; }

if [[ "$MODE" != merge ]]; then
  mkdir "$tmp/x"
  decrypt "$tmp/x" < "$SEALED"
  for p in "${PKGS[@]}"; do
    rm -rf "$p/test/private"
    if [[ -d "$tmp/x/$p/test/private" ]]; then mkdir -p "$p/test" && cp -R "$tmp/x/$p/test/private" "$p/test/"; fi
  done
  save_state
  echo "private-unseal: $(count_files) files restored into backend/test/private, frontend/test/private"
  exit 0
fi

# --merge: sources = the sealed file in the work tree, plus stage 3 ("theirs") while git has it unmerged
mkdir "$tmp/ours"
decrypt "$tmp/ours" < "$SEALED"
srcs=("$tmp/ours")
if git cat-file -e ":3:$SEALED" 2>/dev/null; then
  mkdir "$tmp/theirs"
  git show ":3:$SEALED" | decrypt "$tmp/theirs"
  srcs+=("$tmp/theirs")
fi
added=0 same=0 conflicts=()
for src in "${srcs[@]}"; do
  while IFS= read -r f; do
    rel="${f#"$src"/}"
    if [[ ! -e "$rel" ]]; then
      mkdir -p "$(dirname "$rel")" && cp "$f" "$rel"; added=$((added + 1))
    elif cmp -s "$f" "$rel"; then
      same=$((same + 1))
    else
      conflicts+=("$rel")
    fi
  done < <(find "$src" -type f ! -name .DS_Store ! -name '._*' | LC_ALL=C sort)
done
if [[ "${#conflicts[@]}" -gt 0 ]]; then
  echo "private-unseal --merge: added $added, unchanged $same, CONFLICTS ${#conflicts[@]} (same path, different content; the local copy was kept):" >&2
  printf '  %s\n' "${conflicts[@]}" >&2
  echo "Decide by hand in a separate terminal, then: bash k8s/agents/private-seal.sh --force" >&2
  exit 1
fi
# The union now includes the sealed file in the work tree: seal it next (the state lets private-seal.sh go ahead)
printf '%s\n%s\n' "$(state_tree)" "$(blob_hash)" > "$STATE"
echo "private-unseal --merge: added $added, unchanged $same, $(count_files) files now. Next: bash k8s/agents/private-seal.sh --force && git add $SEALED"
