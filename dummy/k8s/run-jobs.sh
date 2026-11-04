#!/usr/bin/env bash
# Start agent Jobs from agent-jobs.yaml and save each Job's full log to dummy/k8s/logs/,
# because the pods are deleted as soon as they finish (ttlSecondsAfterFinished: 0).
#
# Usage:  bash dummy/k8s/run-jobs.sh agent-title-product                  # one job
#         bash dummy/k8s/run-jobs.sh agent-add-red agent-search-yellow    # several, in parallel
#         bash dummy/k8s/run-jobs.sh all
# Returns when every Job has finished. Each log ends with a "RESULT:" line.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs

ALL_JOBS=(agent-search-yellow agent-add-red agent-title-product)
if [[ $# -eq 0 ]]; then echo "usage: $0 <job-name>... | all"; exit 2; fi
if [[ "$1" == all ]]; then JOBS=("${ALL_JOBS[@]}"); else JOBS=("$@"); fi
TS="$(date +%Y-%m-%dT%H-%M-%S)"

# Apply the shared script ConfigMap + only the chosen Jobs.
NAMES_JSON="$(printf '%s\n' "${JOBS[@]}" | jq -R . | jq -s .)"
MANIFEST="$(kubectl create --dry-run=client -f agent-jobs.yaml -o json \
  | jq -s --argjson names "$NAMES_JSON" '{apiVersion:"v1",kind:"List",items:[.[] | select(.kind=="ConfigMap" or (.metadata.name as $n | $names | index($n)))]}')"
FOUND="$(jq -r '[.items[] | select(.kind=="Job")] | length' <<<"$MANIFEST")"
if [[ "$FOUND" != "${#JOBS[@]}" ]]; then echo "Unknown job name in: ${JOBS[*]} (known: ${ALL_JOBS[*]})"; exit 2; fi

for job in "${JOBS[@]}"; do kubectl delete job "$job" --ignore-not-found >/dev/null; done
kubectl apply -f - <<<"$MANIFEST"

# Follow one Job's pod and write its log to a file.
follow() {
  local job="$1" file="logs/$1-$TS.log" pod="" phase=""
  for _ in $(seq 1 300); do   # wait up to 10 min for the pod to start (image pull)
    pod="$(kubectl get pods -l job-name="$job" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
    phase="$(kubectl get pod "$pod" -o jsonpath='{.status.phase}' 2>/dev/null || true)"
    [[ "$phase" == Running || "$phase" == Succeeded || "$phase" == Failed ]] && break
    sleep 2
  done
  echo "[$job] pod=$pod phase=$phase -> $file"
  { echo "# job=$job pod=$pod started=$TS"; kubectl logs -f "pod/$pod" 2>&1 || true; } > "$file"
  if grep -q "^==> \[$job\] Done$" "$file"; then
    echo "RESULT: SUCCESS (PR opened)" >> "$file"
  else
    echo "RESULT: FAILED (no PR; see the last ==> step above)" >> "$file"
  fi
  echo "[$job] $(tail -n 1 "$file")"
}

for job in "${JOBS[@]}"; do follow "$job" & done
wait
echo "All done. Logs:"; ls -1 logs/*-"$TS".log
