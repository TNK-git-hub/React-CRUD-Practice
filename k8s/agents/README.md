# Agent chạy headless trong pod (kind)

Claude tổng (session local) giao task cho các agent chạy song song, mỗi agent một pod. Task **không viết cứng**:
mỗi lần giao là một file markdown, truyền vào lúc chạy.

```
Claude tổng: chia feature thành task (mỗi task một nhóm file riêng) → tasks/<id>.md
  → dispatch.sh <id> tasks/<id>.md|- --title "..." [--mode full|code-only] [--change NNN-<feature> [--tasks T001,...] | --bug <id>]
                                                       (chạy song song được; --change: làm theo spec, xem "Làm theo spec";
                                                        --bug: bước f-g của luồng bug, xem "Sửa bug")
      pod: clone base branch (CLAUDE.md, mục Branches) → pnpm install, rồi (mode full, mỗi bước một session claude -p --agent <vai> mới):
        1. PLAN    code-planner + test-planner (chỉ đọc)            → /tmp/plan (ngoài repo)
        2. RED     test-writer → gate: chỉ đổi test/public, test mới phải FAIL → commit "test: ..."
        3. GREEN   code-writer → gate: chỉ đổi src, không dò môi trường test, pnpm ci:local (≤2 vòng sửa) → commit
        4. REVIEW  mutation score (Stryker) + code-reviewer + test-critic + security-reviewer → cần sửa thì quay lại 2/3 (≤2 vòng)
                   security CHANGES: test-writer viết test chứng minh từng lỗ hổng HIGH/MEDIUM, code-writer sửa;
                   security có SPEC_PROBLEM (quyền trong spec sai/thiếu) → dừng review, PR draft, quay lại spec harness
        5. EXPORT  pod không có token ghi GitHub: in branch ra log (git bundle + meta + PR body, giữa hai dòng ARTIFACT)
      (mode code-only: chỉ bước 3 rồi 5)
      → pod: "RESULT: SUCCESS artifact=ready" | "RESULT: FAILED reason=...[ artifact=ready]"
  → collect.sh (dispatch.sh tự gọi) trên máy này: kiểm artifact, push branch, mở PR (FAILED sau commit đầu: PR draft)
      → "RESULT: SUCCESS pr=<url>" | "RESULT: FAILED reason=... pr=<url>"
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
| Lỗ hổng bảo mật / thiếu kiểm quyền ở backend | security-reviewer (chỉ đọc, constitution Principle II) trong mỗi vòng REVIEW; cần cả `security=APPROVE` mới duyệt. Finding HIGH/MEDIUM → test chứng minh lỗ hổng (test-writer) rồi sửa code (code-writer); `SPEC_PROBLEM` về quyền → dừng, PR draft |
| Agent sửa spec cho khớp code/test (`--change`) | Checksum toàn bộ `specs/` lấy trước bước PLAN; mọi gate `assert_only` fail nếu có file trong `specs/` đổi (kể cả file spec chưa commit được gửi qua ConfigMap) |
| Agent sửa hồ sơ bug hay test tái hiện cho dễ pass (`--bug`) | Test tái hiện nằm trong gate root-cause người dùng đã duyệt (`approval.py`, hash). Pod chạy `approval.py verify --bug` lúc đầu và trước khi mở PR; checksum `bugs/<id>/` + test tái hiện trong mọi gate `assert_only`; `DELETE:` không xoá được test tái hiện |
| Secret trong pod bị agent đọc hay dùng | Pod chỉ có token Claude (`CLAUDE_CODE_OAUTH_TOKEN`), không có token ghi GitHub (có `GH_TOKEN` thì `run.sh` FAIL): clone ẩn danh (repo public) hoặc `GH_READ_TOKEN` chỉ đọc qua credential helper, không nằm trong URL hay `.git/config` (`run.sh` kiểm). Push và mở PR làm ở máy này (`collect.sh`, chỉ coi artifact là dữ liệu, marker cuối của job quyết định — `ARTIFACT NONE` thì không PR —, mọi file đổi phải nằm trong vùng của agent, không force push). Lệnh do script chạy (pnpm install / ci:local, vitest, stryker, `node -e`, `approval.py`) chạy không có token Claude (`noenv`) |
| Giới hạn còn lại về secret | Lệnh agent tự chạy qua Bash vẫn thừa hưởng token Claude (`claude` cần nó). Mạng đi ra từ pod chưa bị lọc (agent có thể gửi dữ liệu ra ngoài) |
| Bỏ sót scenario của spec (`--change`) | Gate scenario ở REVIEW: mỗi scenario ID của các task được giao phải có `describe`/`it`/`test` trong `test/public` mà tên bắt đầu bằng ID đó, thiếu thì không duyệt và test-writer phải viết thêm |

Quy trình cho Claude tổng nằm trong skill `.claude/skills/dispatch-agents/SKILL.md`.

**Vùng của agent** (code, test public / e2e / private, tên package, mẫu tên file test) định nghĩa một lần trong
`.claude/harness.json`. `run.sh` đọc nó ngay sau khi clone (`SRC_RE` = `pod.codeWritable`, `TEST_RE` =
`pod.testWritable`; lỗi thì FAIL), `collect.sh` kiểm lại branch theo `pod.agentAreas`, `dispatch.sh` lấy vùng test
private và regex test tái hiện từ đó (`python3 .specify/scripts/harness_config.py get <key> --regex|--list`).
Đổi cấu trúc thư mục = sửa file đó + phần văn xuôi trong `CLAUDE.md` và prompt agent.

| File | Làm gì |
|---|---|
| `run.sh` | Script chạy trong pod (ConfigMap `agent-script`, `dispatch.sh` tự cập nhật) |
| `job-template.yaml` | Template một Job; `dispatch.sh` điền `JOB_ID`, `BASE_BRANCH`, `MODE`, deadline. Chỉnh `REVIEW_ROUNDS`, `MUTATION_MIN` ở đây |
| `dispatch.sh` | Tạo ConfigMap task + Job, theo dõi log vào `logs/`, gọi `collect.sh`, chạy hidden test, in `PRIVATE` và `RESULT` |
| `collect.sh` | Trên máy này: lấy artifact của job từ log, kiểm (chỉ coi là dữ liệu), push branch (không force), mở PR bằng `gh` |
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
# Chỉ token Claude: pod không push, không mở PR (collect.sh làm việc đó trên máy này, bằng gh của bạn)
kubectl create secret generic agent-secrets \
  --from-literal=CLAUDE_CODE_OAUTH_TOKEN='<sk-ant-oat...>'
# Repo này đang PUBLIC: KHÔNG đặt GH_READ_TOKEN (pod clone ẩn danh). Chỉ khi repo chuyển sang private mới thêm:
#   --from-literal=GH_READ_TOKEN='<github_pat_...>'
# Token đó cũng nằm trong /proc/1/environ của container (agent đọc được), nên chỉ dùng token fine-grained, CHỈ repo này,
# CHỈ quyền "Contents: Read-only", không quyền nào khác.
security find-certificate -c MWG -p /Library/Keychains/System.keychain > mwg-ca.pem
kubectl create configmap mwg-ca --from-file=mwg-ca.crt=mwg-ca.pem
```
CI của PR chạy trên runner cloud của GitHub (`.github/workflows/ci.yml`), không cần cài runner trong kind.

**Đã tạo `agent-secrets` có `GH_TOKEN` từ trước: xoá nó khỏi Secret** (`envFrom` nạp mọi key, agent sẽ thấy token ghi).
Pod có `GH_TOKEN` thì `run.sh` FAIL ngay đầu (không chỉ cảnh báo: `unset` không xoá được biến khỏi `/proc/1/environ`):
```bash
kubectl patch secret agent-secrets --type=json -p='[{"op": "remove", "path": "/data/GH_TOKEN"}]'
```
Máy này cần `gh` đã đăng nhập (`gh auth login`) cho `collect.sh`, hidden test và `watch-pr.sh`.

## Dùng
```bash
# xem trước manifest, không tạo gì trong cluster
bash k8s/agents/dispatch.sh example-task k8s/agents/tasks/EXAMPLE.md --title "<PR title>" --dry-run

# chạy thật — base branch phải đã push: pod clone từ origin. dispatch.sh đợi pod xong rồi gọi collect.sh (mở PR)
bash k8s/agents/dispatch.sh example-task k8s/agents/tasks/EXAMPLE.md --title "<PR title>"
bash k8s/agents/watch-pr.sh <pr-number>

# --no-wait: tự mở PR sau khi job xong (log lấy bằng kubectl logs job/agent-<id>); --dry-run: không push, không mở PR
bash k8s/agents/collect.sh example-task [--dry-run]
```

### Làm theo spec (`--change`)
Spec do spec harness (`.claude/CLAUDE.md`) viết, đặt ở `specs/changes/NNN-<feature>/` (cấu trúc: `specs/changes/.gitkeep`).
```bash
# task sinh từ spec ("-"), chỉ làm T002 và T003 của tasks.md
bash k8s/agents/dispatch.sh example-be - --title "<PR title>" \
  --change 001-example-feature --tasks T002,T003 --dry-run
# hoặc file task viết tay + mục "## Spec" do run.sh nối thêm
bash k8s/agents/dispatch.sh example-be k8s/agents/tasks/example-be.md --title "..." --change 001-example-feature
```
- `dispatch.sh` nén cả `specs/` ở máy này (trừ `archive/`) vào ConfigMap `task-<id>`: spec **chưa commit vẫn dùng được**.
  Trong pod, file nào đã có trên base branch thì giữ bản trên branch; file chưa commit được thêm vào `.git/info/exclude`
  nên không lọt vào PR.
- `run.sh` nối vào task mục `## Spec`: đường dẫn change, các dòng task được giao, danh sách scenario ID, file nào vai CODE
  đọc (`spec.md` requirement + ADR + Data Model, `plan.md`, `tasks.md`) và vai TEST đọc (scenario, Edge Cases, NFR
  Verification, `checklists/edge-cases.md`, `## Test Strategy`). Mọi agent, cả trọng tài, đều nhận mục này.
- Agent gặp spec sai/thiếu ghi `SPEC_PROBLEM: ...`; các dòng này được gom vào mục "Spec" của PR để quay lại spec harness.

### Sửa bug (`--bug`)
Bước a–e của luồng bug (skill `bug-fix-flow`: phân loại, `report.md`, test tái hiện, điều tra, duyệt root cause) vẫn
làm tương tác ở máy local. Sau khi người dùng duyệt root cause trong terminal (`approval.py` gate `root-cause`, gồm cả
test tái hiện ghi ở mục "Reproduction test" của `report.md`), bước f–g giao cho pod:
```bash
python3 .specify/scripts/approval.py verify --bug 20261125-example-bug     # phải exit 0
bash k8s/agents/dispatch.sh example-bug - --title "<PR title>" --bug 20261125-example-bug --dry-run
```
- `dispatch.sh` kiểm `verify --bug`, đọc Path / Name / scenario từ `report.md`, nén `bugs/<id>/` + test tái hiện vào
  `bug.tgz` (ConfigMap `task-<id>`, kèm `bug.txt`, `repro.txt`, `scenario.txt`). Chỉ mode `full`, không đi cùng `--change`.
- Pod: `verify --bug` lại → commit `docs: bug record <id>` → bỏ PLAN (code plan = mục Root cause đã duyệt) → RED: test
  tái hiện phải FAIL, gate scenario theo ID của bug → commit `test: reproduce bug <id>` → GREEN → REVIEW (gồm
  security-reviewer) → `verify --bug` lần nữa → PR có mục "## Bug".

## Ghi chú
- Mỗi lần chạy (và mỗi vòng sửa CI) tính vào giới hạn gói Claude subscription.
- Đừng đặt `ANTHROPIC_API_KEY` trong pod: nếu có, Claude Code dùng nó thay vì token subscription.
- Proxy công ty (MWG) ký lại HTTPS, nên cần ConfigMap `mwg-ca` và `NODE_EXTRA_CA_CERTS`.
- Pod được giữ 10 phút sau khi xong (`ttlSecondsAfterFinished: 600`); log đầy đủ nằm ở `k8s/agents/logs/` (gitignore).
- Hai task không được sửa cùng file, nếu không các PR sẽ conflict nhau.
