---
name: dispatch-agents
description: Dùng khi người dùng muốn giao một feature/bug cho các agent chạy headless trong pod (kind) để chúng tự sửa code, chạy CI và mở PR, rồi theo dõi kết quả GitHub Actions. Chia việc thành task, gọi k8s/agents/dispatch.sh, theo dõi bằng k8s/agents/watch-pr.sh, giao lại khi fail, tổng hợp kết quả.
---
# Giao việc cho agent trong pod

Bạn là Claude tổng (điều phối). Bạn không tự sửa code hay test: các agent trong pod làm việc đó.
Mode `full` (mặc định): trong pod chạy lần lượt planner → test-writer (test phải fail trước) → code-writer → mutation + review.
Mode `code-only`: chỉ code-writer, dùng cho việc nhỏ không cần test mới (đổi style, text...).
Chi tiết hạ tầng và các gate chống reward hacking: `k8s/agents/README.md`.

## 0. Kiểm tra trước (dừng và báo người dùng nếu fail)
- `kubectl get nodes` chạy được (cluster kind đang bật).
- Branch base (dòng "Base branch" của `CLAUDE.md`, hoặc `--base`) đã push và không có commit local chưa push — pod clone từ origin.
- **Không tự truyền `--base`**: `dispatch.sh` tự đọc base branch từ dòng "Base branch" của `CLAUDE.md`. Chỉ truyền `--base`
  khi người dùng yêu cầu rõ; khi đó `dispatch.sh` in `WARNING: --base ... differs ...` nếu khác `CLAUDE.md`, báo lại dòng này cho người dùng.
- Hỏi người dùng xác nhận danh sách task trước khi dispatch: mỗi lần chạy tốn quota subscription và mở PR thật.

## 1. Chia việc
- Đọc code liên quan (có thể nhờ `code-planner`) để biết file nào cần sửa.
- Mỗi task chỉ sửa **một nhóm file riêng**. Hai task không được sửa cùng file (PR sẽ conflict). Không tách được thì gộp thành một task.
- Task phải tự đủ: agent trong pod không thấy cuộc hội thoại này.

## 1b. Có spec từ spec harness (`specs/changes/NNN-<feature>/`)
- Không viết lại spec vào file task: dùng `--change NNN-<feature>` (và `--tasks T00x,...` để chọn task trong `tasks.md`).
  `run.sh` tự nối mục `## Spec` (task được giao, scenario ID, file mỗi vai phải đọc) vào task của mọi agent.
- Chia việc theo task ID của `tasks.md`: các task `[P]` chạm file khác nhau mới được dispatch song song.
- File task có thể là `-` (sinh tự động) hoặc file viết tay chỉ thêm ràng buộc (Files you may change, Out of scope).
- Không sửa `specs/`. PR có mục "Spec problems" thì báo người dùng để quay lại spec harness, không tự sửa spec.

## 1c. Bug đã duyệt root cause (`bugs/<id>/`, skill bug-fix-flow)
- Chỉ dispatch khi `python3 .specify/scripts/approval.py verify --bug <id>` exit 0 (người dùng đã duyệt root cause và
  test tái hiện trong terminal). Không exit 0 thì dừng, báo người dùng: bạn không tự duyệt được.
- `bash k8s/agents/dispatch.sh <job-id> - --title "<PR title>" --bug <id>`: task sinh từ hồ sơ bug. Chỉ mode `full`,
  không đi cùng `--change` / `--tasks`. Pod làm bước f–g (GREEN + REVIEW), không đụng `bugs/` và test tái hiện.
- `RESULT: FAILED reason=security review found a spec problem (permissions) ...`: quyền trong spec sai/thiếu, báo người
  dùng để quay lại spec harness.

## 2. Viết file task
Tạo `k8s/agents/tasks/<job-id>.md` theo mẫu `k8s/agents/tasks/EXAMPLE.md`, gồm:
- **Goal**: hành vi cần có, nói bằng kết quả quan sát được.
- **Behaviors to test** (mode full): input → output mong đợi, mỗi dòng phải fail trên code hiện tại. Với bug: ghi đúng input gây bug và output đúng.
- **Files you may change**: đường dẫn cụ thể trong `frontend/src`, `backend/src`, `frontend/public` (test-writer tự chọn file trong `test/public`).
- **Out of scope**: những gì không được đổi.
- **Done when**: tiêu chí xong, luôn có "`pnpm ci:local` prints CI PASSED".

`<job-id>`: chữ thường, số, `-`, ngắn và mô tả được việc (vd. `example-task`). Tiêu đề PR: tiếng Anh, mệnh lệnh, ngắn.

## 3. Dispatch
- Xem trước: `bash k8s/agents/dispatch.sh <job-id> k8s/agents/tasks/<job-id>.md --title "<PR title>" [--mode code-only] --dry-run`
- Chạy thật: bỏ `--dry-run`. Nhiều task thì chạy song song (mỗi task một lệnh Bash chạy nền), rồi đợi tất cả. Mode full mất khoảng 20–60 phút mỗi task.
- Đọc dòng cuối: `RESULT: SUCCESS pr=<url>` hoặc `RESULT: FAILED reason=...`. Fail thì đọc log trong `k8s/agents/logs/<job-id>-*.log` (dòng `==> ... =====` cho biết đang ở bước nào, dòng `==>` cuối cùng cho biết bước hỏng).
- `FAILED reason=review not approved ... pr=<url>`: đã mở PR draft kèm báo cáo review (hidden test vẫn chạy trên PR draft). Báo người dùng, không tự dispatch lại.
- Dòng `PRIVATE:` (hidden test, chạy trên máy local), dạng
  `PRIVATE: PASS|FAIL (backend: files N, load errors N, tests N fail / N pass, type errors N; frontend: ...)` hoặc `PRIVATE: SKIPPED (<lý do>)`:
  - `PASS` (mọi package: load errors 0, tests 0 fail, type errors 0) → tiếp bước 4.
  - `SKIPPED` → **không coi là pass**: báo người dùng lý do trong ngoặc (chưa có hidden test, không đọc được branch PR, pnpm install lỗi...). Vẫn theo dõi bước 4, nhưng không báo task là đạt khi người dùng chưa quyết.
  - `FAIL`, kể cả khi chỉ có `type errors` > 0 → **không coi là pass**: báo người dùng kèm đường dẫn log. **Không đọc log đó, không đưa nội dung hay tên test vào task sửa**: lộ hidden test cho agent là mất tác dụng chống học tủ.

## 4. Theo dõi GitHub Actions
- Với mỗi PR: `bash k8s/agents/watch-pr.sh <pr-url>`.
- `CHECKS: PASS` → xong.
- `CHECKS: FAIL` → log step lỗi được in phía trên. Viết task sửa mới (`<job-id>-fix1`) gồm task gốc + log lỗi + "fix on top of PR <url>", rồi dispatch lại. Tối đa 2 vòng cho mỗi task.
- `CHECKS: TIMEOUT` → run bị kẹt hoặc xếp hàng lâu trên GitHub Actions (xem tab Actions). Báo người dùng, không dispatch lại.

## 5. Tổng hợp cho người dùng
Bảng: task | mode | PR | kết quả dispatch | hidden test | GitHub checks | số vòng sửa | ghi chú. Nêu rõ task nào fail và vì sao.
Không merge PR: người dùng tự review và merge.

## Không được
- Không sửa `run.sh`, `job-template.yaml`, `ci/`, `.github/` để task pass (đây là harness, guard sẽ hỏi người dùng).
- Không giao task sửa config test, và không giao task "sửa test cho khớp code" (test do test-writer trong mode full viết theo hành vi, gate chỉ cho phép `test/public`).
- Không đặt secret hay token vào file task.
