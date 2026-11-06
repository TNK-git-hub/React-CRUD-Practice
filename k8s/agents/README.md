# Agent chạy headless trong pod (kind)

Claude tổng (session local) giao task cho các agent chạy song song, mỗi agent một pod. Task **không viết cứng**:
mỗi lần giao là một file markdown, truyền vào lúc chạy.

```
Claude tổng: chia feature thành task (mỗi task một nhóm file riêng) → tasks/<id>.md
  → dispatch.sh <id> tasks/<id>.md --title "..."      (chạy song song được)
      pod: clone level-3 → pnpm install → claude -p --agent code-writer "<task>"
           → CI gate (file cấm sửa + pnpm ci:local, tối đa 2 vòng sửa) → push → PR vào level-3
      → "RESULT: SUCCESS pr=<url>" | "RESULT: FAILED reason=..."
  → watch-pr.sh <pr>                                   (GitHub Actions chạy ci.yml trên runner ARC)
      → "CHECKS: PASS" | "CHECKS: FAIL" (+ log step lỗi) | "CHECKS: TIMEOUT"
  → fail thì viết task sửa kèm log, giao lại; pass thì tổng hợp cho người dùng
```

Quy trình cho Claude tổng nằm trong skill `.claude/skills/dispatch-agents/SKILL.md`.

| File | Làm gì |
|---|---|
| `run.sh` | Script chạy trong pod (ConfigMap `agent-script`, `dispatch.sh` tự cập nhật) |
| `job-template.yaml` | Template một Job; `dispatch.sh` điền `JOB_ID`, `BASE_BRANCH` |
| `dispatch.sh` | Tạo ConfigMap task + Job, theo dõi log vào `logs/`, in `RESULT` |
| `watch-pr.sh` | Đợi check của PR, in log step lỗi nếu fail |
| `tasks/EXAMPLE.md` | Mẫu file task |

## Vì sao `--agent code-writer`
Pod clone repo nên có cả `.claude/` (guard, hook). Guard chỉ cho `code-writer` sửa `src/`; chạy `claude -p` thường
thì bị coi là session chính và bị chặn. Với `--agent code-writer`, hook nhận `agent_type=code-writer`, nên agent sửa
được `src/` nhưng vẫn không sửa được `test/`, `.claude/`. `run.sh` còn kiểm tra lại danh sách file cấm (`PROTECTED`)
trước khi mở PR, để agent không lách được.

## Cài đặt một lần
```bash
claude setup-token                       # copy giá trị sk-ant-oat...
kind create cluster --name claude-demo
kubectl create secret generic agent-secrets \
  --from-literal=CLAUDE_CODE_OAUTH_TOKEN='<sk-ant-oat...>' \
  --from-literal=GH_TOKEN="$(gh auth token)"
security find-certificate -c MWG -p /Library/Keychains/System.keychain > mwg-ca.pem
kubectl create configmap mwg-ca --from-file=mwg-ca.crt=mwg-ca.pem
```
Runner cho GitHub Actions (ARC): xem [`../runner/RUNNER.md`](../runner/RUNNER.md).

## Dùng
```bash
# xem trước manifest, không tạo gì trong cluster
bash k8s/agents/dispatch.sh search-btn-yellow k8s/agents/tasks/EXAMPLE.md --title "Make the Search button yellow" --dry-run

# chạy thật — base branch phải đã push: pod clone từ origin
bash k8s/agents/dispatch.sh search-btn-yellow k8s/agents/tasks/EXAMPLE.md --title "Make the Search button yellow"
bash k8s/agents/watch-pr.sh <pr-number>
```

## Ghi chú
- Mỗi lần chạy (và mỗi vòng sửa CI) tính vào giới hạn gói Claude subscription.
- Đừng đặt `ANTHROPIC_API_KEY` trong pod: nếu có, Claude Code dùng nó thay vì token subscription.
- Proxy công ty (MWG) ký lại HTTPS, nên cần ConfigMap `mwg-ca` và `NODE_EXTRA_CA_CERTS`.
- Pod được giữ 10 phút sau khi xong (`ttlSecondsAfterFinished: 600`); log đầy đủ nằm ở `k8s/agents/logs/` (gitignore).
- Hai task không được sửa cùng file, nếu không các PR sẽ conflict nhau.
