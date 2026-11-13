# Checkpoint: bắt đầu gộp full luồng harness

- Ngày: 2026-11-13
- Nhánh: `full-s-t-c` (spec → test → code)
- Tạo từ: `level-3` @ `25ce181` ("Arbitrate when the code-writer says a test is wrong")

Từ commit này trở đi bắt đầu gộp harness spec (nhánh `new-project`: `planner`, `spec-writer`, skill `speckit-*`, `spec-*`) vào harness code + test của `level-3` (`code-planner`, `code-writer`, `code-reviewer`, `test-planner`, `test-writer`, `test-critic`, `dispatch-agents`).

Mục tiêu luồng sau khi gộp: spec → plan → test-writer (test fail trước) → code-writer → code-reviewer + test-critic.

Muốn quay lại trạng thái trước khi gộp: `git checkout 25ce181`.
