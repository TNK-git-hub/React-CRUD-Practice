# README Test

File thử nghiệm để kiểm tra quyền push lên repository.

# Set up quyền code của khánh
Test nằm trong từng package (theo harness test của `chore/test-setup`):

```
backend/test/   frontend/test/
├── public/     # agent được đọc + chạy, KHÔNG được sửa (đã commit vào repo)
└── private/    # agent chỉ được chạy, KHÔNG được đọc/sửa; bị gitignore, file test thật chỉ có trên CI
```

| Thư mục | Đọc | Sửa/Tạo/Xoá | Chạy test |
|---|---|---|---|
| `<package>/test/public/` | ✅ | ❌ | ✅ `pnpm test` |
| `<package>/test/private/` | ❌ | ❌ | ✅ `pnpm test:private` |

Cấu hình nằm ở `.claude/settings.json` (commit vào repo, áp dụng cho cả team). File này gộp quyền code (của khánh) và harness test (`chore/test-setup`).

## Giải thích

### 1. `permissions` – lớp chặn thứ nhất
- `allow`: không cần hỏi lại khi chạy `pnpm test`, `pnpm --filter <pkg> test`, `pnpm lint`, Stryker, `.venv/bin/python`, `git status/diff`.
- `deny`:
  - `Edit/Write(./**/test/**)` → không sửa/tạo file trong `test/` của bất kỳ package nào.
  - `Read(./**/test/private/**)` + `cat/head/tail/less/ls */test/private` → không đọc test ẩn.
  - `Read(./.env)`, `Read(./**/.env)` → không đọc secret.
- `deny` luôn **ưu tiên cao hơn `allow`** (thứ tự: `deny` > `ask` > `allow`), kể cả khi người dùng bấm đồng ý.

### 2. `hooks` – lớp chặn thứ hai
`deny` chỉ khớp theo tiền tố lệnh, nên agent có thể lách bằng lệnh khác (`grep -r`, `sed -i`, `echo > ...`). Vì vậy thêm hook:

- **`PreToolUse`** → `.claude/hooks/guard-tests.mjs` chạy *trước* mỗi tool call (Bash, Read, Edit, Write, Grep, Glob...). Script đọc JSON từ stdin:
  - Lệnh chạy test đúng mẫu `pnpm [--filter backend|frontend] test|test:private [<pkg>/test/...] [--flag]` và không nối lệnh (`;`, `&&`, `|`, `>`) → **cho qua**.
  - Lệnh Bash đụng `test/` mà có dấu hiệu ghi file (`>`, `sed -i`, `rm`, `mv`, `cp`, `tee`, `touch`...) → **chặn**.
  - Lệnh Bash nhắc tới `test/private` mà không phải lệnh chạy test → **chặn**.
  - Edit/Write vào `**/test/**` → **chặn**; Read/Grep/Glob vào `**/test/private` → **chặn**.
  - Chặn = `exit 2`, lý do (stderr) được gửi lại cho agent.
  - Viết bằng Node (thay vì bash) để parse JSON mà không cần cài `jq`.
- **`PostToolUse`** → `pnpm lint` chạy *sau* mỗi lần agent sửa/tạo file.
- **`Stop`** → `.claude/hooks/stop-gate.sh` (từ `chore/test-setup`): nếu có file thay đổi thì chạy `pnpm test`, fail thì không cho agent báo xong.

### 3. Hạn chế cần biết
- **Guard chặn cả subagent `test-writer`**: hook áp dụng cho mọi agent, nên `test-writer` (được giao viết vào `test/public/`) cũng bị chặn. Cần quyết định cách cho phép riêng agent test.
- **Output test có thể lộ nội dung `test/private`**: khi fail, assert/stack trace in ra một phần code. Nên chạy với reporter gọn (vd. `--reporter=dot`).
- **Hook lọc theo chuỗi lệnh nên không kín 100%** (vd. agent tự viết script ở chỗ khác để đọc file). Muốn chặn ở cấp hệ thống file thì bật thêm `sandbox` của Claude Code.
- **Hook cũng có thể chặn nhầm**: lệnh nào vừa có `test/` vừa có dấu `>` (kể cả khi không ghi vào `test/`) đều bị chặn.
- **`PostToolUse` lint fail không báo lại cho agent**: `pnpm lint` fail trả exit 1, agent không thấy lỗi. Muốn agent tự sửa thì script phải `exit 2`.
- **`test/private` bị gitignore**, quyền "chạy" chủ yếu có ý nghĩa trên CI (chưa có workflow).

### 4. Các file settings khác (để phân biệt)
| File | Phạm vi | Commit? |
|---|---|---|
| `.claude/settings.json` | cả team trong project | ✅ |
| `.claude/settings.local.json` | chỉ máy mình trong project | ❌ (gitignore) |
| `~/.claude/settings.json` | mọi project trên máy | ❌ |

### 5. Kiểm tra
- Gõ `/permissions` để xem rule đang áp dụng, `/hooks` để xem hook đã load chưa.
- Thử nhờ agent:
  - `cat backend/test/private/x.test.ts` → bị từ chối.
  - sửa 1 file trong `frontend/test/public` → bị từ chối.
  - `pnpm test` / `pnpm test:private` → được chạy.
