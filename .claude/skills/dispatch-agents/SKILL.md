---
name: dispatch-agents
description: Dùng khi người dùng muốn giao một feature/bug cho các agent chạy headless trong pod (kind) để chúng tự sửa code, chạy CI và mở PR, rồi theo dõi kết quả GitHub Actions. Chia việc thành task, gọi k8s/agents/dispatch.sh, theo dõi bằng k8s/agents/watch-pr.sh, giao lại khi fail, tổng hợp kết quả.
---
# Giao việc cho agent trong pod

Bạn là Claude tổng (điều phối). Bạn không tự sửa code: agent trong pod (`--agent code-writer`) làm việc đó.
Chi tiết hạ tầng: `k8s/agents/README.md`.

## 0. Kiểm tra trước (dừng và báo người dùng nếu fail)
- `kubectl get nodes` chạy được (cluster kind đang bật).
- Branch base (mặc định `level-3`) đã push và không có commit local chưa push — pod clone từ origin.
- Hỏi người dùng xác nhận danh sách task trước khi dispatch: mỗi lần chạy tốn quota subscription và mở PR thật.

## 1. Chia việc
- Đọc code liên quan (có thể nhờ `code-planner`) để biết file nào cần sửa.
- Mỗi task chỉ sửa **một nhóm file riêng**. Hai task không được sửa cùng file (PR sẽ conflict). Không tách được thì gộp thành một task.
- Task phải tự đủ: agent trong pod không thấy cuộc hội thoại này.

## 2. Viết file task
Tạo `k8s/agents/tasks/<job-id>.md` theo mẫu `k8s/agents/tasks/EXAMPLE.md`, gồm:
- **Goal**: hành vi cần có, nói bằng kết quả quan sát được.
- **Files you may change**: đường dẫn cụ thể trong `frontend/src`, `backend/src`, `frontend/public`.
- **Out of scope**: những gì không được đổi.
- **Done when**: tiêu chí xong, luôn có "`pnpm ci:local` prints CI PASSED".

`<job-id>`: chữ thường, số, `-`, ngắn và mô tả được việc (vd. `search-btn-yellow`). Tiêu đề PR: tiếng Anh, mệnh lệnh, ngắn.

## 3. Dispatch
- Xem trước: `bash k8s/agents/dispatch.sh <job-id> k8s/agents/tasks/<job-id>.md --title "<PR title>" --dry-run`
- Chạy thật: bỏ `--dry-run`. Nhiều task thì chạy song song (mỗi task một lệnh Bash chạy nền), rồi đợi tất cả.
- Đọc dòng cuối: `RESULT: SUCCESS pr=<url>` hoặc `RESULT: FAILED reason=...`. Fail thì đọc log trong `k8s/agents/logs/<job-id>-*.log` (dòng `==>` cuối cùng cho biết bước hỏng).

## 4. Theo dõi GitHub Actions
- Với mỗi PR: `bash k8s/agents/watch-pr.sh <pr-url>`.
- `CHECKS: PASS` → xong.
- `CHECKS: FAIL` → log step lỗi được in phía trên. Viết task sửa mới (`<job-id>-fix1`) gồm task gốc + log lỗi + "fix on top of PR <url>", rồi dispatch lại. Tối đa 2 vòng cho mỗi task.
- `CHECKS: TIMEOUT` → thường do runner ARC tắt (`k8s/runner/RUNNER.md`). Báo người dùng, không dispatch lại.

## 5. Tổng hợp cho người dùng
Bảng: task | PR | kết quả dispatch | GitHub checks | số vòng sửa | ghi chú. Nêu rõ task nào fail và vì sao.
Không merge PR: người dùng tự review và merge.

## Không được
- Không sửa `run.sh`, `job-template.yaml`, `ci/`, `.github/` để task pass (đây là harness, guard sẽ hỏi người dùng).
- Không giao task sửa test hay config test cho agent trong pod (`run.sh` sẽ chặn và không mở PR).
- Không đặt secret hay token vào file task.
