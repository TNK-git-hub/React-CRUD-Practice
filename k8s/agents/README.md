# Agent chạy headless trong pod (kind)

Claude tổng (session local) giao task cho các agent chạy song song, mỗi agent một pod. Task **không viết cứng**:
mỗi lần giao là một file markdown, truyền vào lúc chạy.

```
Claude tổng: chia feature thành task (mỗi task một nhóm file riêng) → tasks/<id>.md
  → dispatch.sh <id> tasks/<id>.md|- --title "..." [--mode full|code-only] [--change NNN-<feature> [--tasks T001,...]]
                                                       (chạy song song được; --change: làm theo spec, xem "Làm theo spec")
      pod: clone level-3 → pnpm install, rồi (mode full, mỗi bước một session claude -p --agent <vai> mới):
        1. PLAN    code-planner + test-planner (chỉ đọc)            → /tmp/plan (ngoài repo)
        2. RED     test-writer → gate: chỉ đổi test/public, test mới phải FAIL → commit "test: ..."
        3. GREEN   code-writer → gate: chỉ đổi src, không dò môi trường test, pnpm ci:local (≤2 vòng sửa) → commit
        4. REVIEW  mutation score (Stryker) + code-reviewer + test-critic → cần sửa thì quay lại 2/3 (≤2 vòng)
        5. PR      push → PR vào level-3 (review không qua: PR draft + RESULT FAILED)
      (mode code-only: chỉ bước 3 rồi 5)
      → "RESULT: SUCCESS pr=<url>" | "RESULT: FAILED reason=..."
  → dispatch.sh chạy hidden test (test/private, chỉ có trên máy này) trên branch PR → "PRIVATE: PASS|FAIL|SKIPPED"
  → watch-pr.sh <pr>                                   (GitHub Actions chạy ci.yml trên runner ARC)
      → "CHECKS: PASS" | "CHECKS: FAIL" (+ log step lỗi) | "CHECKS: TIMEOUT"
  → fail thì viết task sửa kèm log, giao lại; pass thì tổng hợp cho người dùng
```

## Chống reward hacking: ai chặn cái gì
| Rủi ro | Chặn bởi |
|---|---|
| code-writer sửa test / test-writer sửa code | `guard.mjs` (theo `agent_type`), `--allowedTools` theo vai, và **gate trong `run.sh`**: sau mỗi bước, mọi file đổi so với SHA của commit trước bước đó phải nằm trong vùng của vai (allow-list). Gate chạy sau khi agent thoát nên không lách được bằng Bash hay chạy code |
| Viết lại lịch sử git để xoá commit test | Gate kiểm tra commit trước bước vẫn là tổ tiên của `HEAD` |
| Code dò môi trường test (`VITEST`, `NODE_ENV === 'test'`) | Gate grep diff `src` |
| Test viết sau, khớp theo code | Bước RED: test mới phải fail trên code cũ trước khi code-writer chạy; PR có 2 commit test → code |
| Test yếu | Mutation score ≥ `MUTATION_MIN` trên file src đã đổi + test-critic |
| Xoá test có sẵn cho dễ pass | test-writer không tự xoá được file; nó ghi `DELETE: <path>` và `run.sh` chỉ xoá file trong `test/public` do chính branch tạo ra (không có ở `BASE_SHA`) |
| Test viết sai, code-writer bị kẹt (hoặc kêu "test sai" để né) | code-writer ghi `TEST_WRONG: <file>:<line> <lý do>`; test-critic làm trọng tài theo spec, tối đa 1 lần/task. `TESTS_WRONG` → code hiện tại được commit (`wip`), test-writer chỉ sửa các assert bị phán sai; `CODE_WRONG` → code-writer sửa tiếp kèm lập luận. Gate vùng ghi của từng vai không đổi |
| Critic đổi ý giữa các vòng | Từ vòng 2, critic nhận review vòng trước + trả lời của test-writer, chỉ được chặn bằng mục cũ chưa xử lý hoặc lỗi mới đáng kể |
| Code học tủ test public | Hidden test `test/private` chạy trên máy local sau khi có PR; chỉ in số lượng, không đưa nội dung cho agent |
| Prompt injection reviewer | VERDICT chỉ có thể làm luồng dừng lại hoặc quay lại sửa; các gate trên vẫn quyết định |
| Agent sửa spec cho khớp code/test (`--change`) | Checksum toàn bộ `specs/` lấy trước bước PLAN; mọi gate `assert_only` fail nếu có file trong `specs/` đổi (kể cả file spec chưa commit được gửi qua ConfigMap) |
| Bỏ sót scenario của spec (`--change`) | Gate scenario ở REVIEW: mỗi scenario ID của các task được giao phải có `describe`/`it`/`test` trong `test/public` mà tên bắt đầu bằng ID đó, thiếu thì không duyệt và test-writer phải viết thêm |

Quy trình cho Claude tổng nằm trong skill `.claude/skills/dispatch-agents/SKILL.md`.

| File | Làm gì |
|---|---|
| `run.sh` | Script chạy trong pod (ConfigMap `agent-script`, `dispatch.sh` tự cập nhật) |
| `job-template.yaml` | Template một Job; `dispatch.sh` điền `JOB_ID`, `BASE_BRANCH`, `MODE`, deadline. Chỉnh `REVIEW_ROUNDS`, `MUTATION_MIN` ở đây |
| `dispatch.sh` | Tạo ConfigMap task + Job, theo dõi log vào `logs/`, chạy hidden test, in `PRIVATE` và `RESULT` |
| `watch-pr.sh` | Đợi check của PR, in log step lỗi nếu fail |
| `tasks/EXAMPLE.md` | Mẫu file task |

## Vì sao mỗi bước chạy `--agent <vai>`
Pod clone repo nên có cả `.claude/` (guard, hook). Chạy `claude -p` thường thì bị coi là session chính và bị chặn sửa
`src/`, `test/`. Với `--agent <vai>`, hook nhận `agent_type` tương ứng: `test-writer` chỉ sửa được `test/public`,
`code-writer` chỉ sửa được `src/`, planner/reviewer không ghi được gì. Sau mỗi bước, `run.sh` còn kiểm tra lại bằng
allow-list theo vai (so với SHA của commit trước bước đó) trước khi đi tiếp, để agent không lách được.
Mỗi bước là một session mới: các vai chỉ chia sẻ file (plan, commit), không chung ngữ cảnh hội thoại.

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

### Làm theo spec (`--change`)
Spec do spec harness (nhánh `new-project`) viết, đặt ở `specs/changes/NNN-<feature>/` (cấu trúc: `specs/changes/.gitkeep`).
```bash
# task sinh từ spec ("-"), chỉ làm T002 và T003 của tasks.md
bash k8s/agents/dispatch.sh price-range-be - --title "Add price range filter" \
  --change 001-products-price-range --tasks T002,T003 --base refine-test-code-ci-cd --dry-run
# hoặc file task viết tay + mục "## Spec" do run.sh nối thêm
bash k8s/agents/dispatch.sh price-range-be k8s/agents/tasks/price-range-be.md --title "..." --change 001-products-price-range
```
- `dispatch.sh` nén cả `specs/` ở máy này (trừ `archive/`) vào ConfigMap `task-<id>`: spec **chưa commit vẫn dùng được**.
  Trong pod, file nào đã có trên base branch thì giữ bản trên branch; file chưa commit được thêm vào `.git/info/exclude`
  nên không lọt vào PR.
- `run.sh` nối vào task mục `## Spec`: đường dẫn change, các dòng task được giao, danh sách scenario ID, file nào vai CODE
  đọc (`spec.md` requirement + ADR + Data Model, `plan.md`, `tasks.md`) và vai TEST đọc (scenario, Edge Cases, NFR
  Verification, `checklists/edge-cases.md`, `## Test Strategy`). Mọi agent, cả trọng tài, đều nhận mục này.
- Agent gặp spec sai/thiếu ghi `SPEC_PROBLEM: ...`; các dòng này được gom vào mục "Spec" của PR để quay lại spec harness.

## Ghi chú
- Mỗi lần chạy (và mỗi vòng sửa CI) tính vào giới hạn gói Claude subscription.
- Đừng đặt `ANTHROPIC_API_KEY` trong pod: nếu có, Claude Code dùng nó thay vì token subscription.
- Proxy công ty (MWG) ký lại HTTPS, nên cần ConfigMap `mwg-ca` và `NODE_EXTRA_CA_CERTS`.
- Pod được giữ 10 phút sau khi xong (`ttlSecondsAfterFinished: 600`); log đầy đủ nằm ở `k8s/agents/logs/` (gitignore).
- Hai task không được sửa cùng file, nếu không các PR sẽ conflict nhau.
