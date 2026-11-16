#!/usr/bin/env bash
# Install / remove the git hooks for the hidden tests in this clone (.git/hooks, never committed):
#   post-merge  (git pull)  unseal newer hidden tests (private-unseal.sh --auto; never overwrites unsealed work)
#   pre-push                warn when local hidden tests changed and were not sealed
# Usage: bash k8s/agents/private-hooks.sh install|uninstall
source "$(dirname "$0")/private-lib.sh"

[[ -z "$(git config core.hooksPath || true)" ]] || die "core.hooksPath is set; add the hooks there by hand"
HOOKS="$(git rev-parse --git-path hooks)"
MARK="# managed by k8s/agents/private-hooks.sh"

write_hook() { # name body
  local f="$HOOKS/$1"
  if [[ -f "$f" ]] && ! grep -qF "$MARK" "$f"; then die "$f exists and is not ours; merge it by hand"; fi
  printf '#!/usr/bin/env bash\n%s\n%s\n' "$MARK" "$2" > "$f"
  chmod +x "$f"
  echo "installed $f"
}

case "${1:-}" in
  install)
    mkdir -p "$HOOKS"
    write_hook post-merge 'bash "$(git rev-parse --show-toplevel)/k8s/agents/private-unseal.sh" --auto || true'
    write_hook pre-push '. "$(git rev-parse --show-toplevel)/k8s/agents/private-lib.sh"
if local_changed; then
  echo "pre-push: hidden tests changed but are not sealed (other machines and CI will not get them):" >&2
  echo "  bash k8s/agents/private-seal.sh && git add $SEALED && git commit" >&2
fi
exit 0'
    ;;
  uninstall)
    for h in post-merge pre-push; do
      if [[ -f "$HOOKS/$h" ]] && grep -qF "$MARK" "$HOOKS/$h"; then rm "$HOOKS/$h" && echo "removed $HOOKS/$h"; fi
    done
    ;;
  *) die "usage: $0 install|uninstall" ;;
esac
