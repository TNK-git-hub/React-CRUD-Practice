# README Test

File thử nghiệm để kiểm tra quyền push lên repository.

# Set up quyền test của khánh
- thư mục tests mới được tạo
tests/
├── public/    # agent được đọc + chạy, KHÔNG được sửa (đã commit vào repo)
└── private/   # agent chỉ được chạy, KHÔNG được đọc/sửa; file test thật chỉ xuất hiện trong CI

| Thư mục | Đọc | Sửa/Tạo/Xoá | Chạy test |
|---|---|---|---|
| `tests/public/` | ✅ | ❌ | ✅ |
| `tests/private/` | ❌ | ❌ | ✅ |

- thư mục settings json: `.claude/settings.json` (commit vào repo, áp dụng cho cả team)

```json
{
  "enabledPlugins": {
    "commit-commands@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true
  },
  "permissions": {
    "allow": [
      "Read(./tests/public/**)",
      "Bash(pnpm test tests/public:*)",
      "Bash(pnpm test tests/private:*)"
    ],
    "deny": [
      "Edit(./tests/**)",
      "Write(./tests/**)",
      "Read(./tests/private/**)",
      "Bash(cat tests/private:*)",
      "Bash(head tests/private:*)",
      "Bash(tail tests/private:*)",
      "Bash(less tests/private:*)",
      "Bash(ls tests/private:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Glob",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-tests.mjs\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "pnpm lint" }
        ]
      }
    ]
  }
}
```

## Giải thích

### 1. `permissions` – lớp chặn thứ nhất
- `allow`: không cần hỏi lại khi đọc `tests/public` và khi chạy `pnpm test tests/public...` / `pnpm test tests/private...`.
- `deny`:
  - `Edit/Write(./tests/**)` → không sửa/tạo file ở **cả 2** thư mục.
  - `Read(./tests/private/**)` + `cat/head/tail/less/ls tests/private` → không đọc test ẩn.
- `deny` luôn **ưu tiên cao hơn `allow`** (thứ tự: `deny` > `ask` > `allow`), kể cả khi người dùng bấm đồng ý.

### 2. `hooks` – lớp chặn thứ hai
`deny` chỉ khớp theo tiền tố lệnh, nên agent có thể lách bằng lệnh khác (`grep -r`, `sed -i`, `echo > ...`). Vì vậy thêm hook:

- **`PreToolUse`** → `.claude/hooks/guard-tests.mjs` chạy *trước* mỗi tool call (Bash, Read, Edit, Write, Grep, Glob...). Script đọc JSON từ stdin:
  - Lệnh đúng mẫu `pnpm test tests/(public|private)... [--flag]` và không nối lệnh (`;`, `&&`, `|`, `>`) → **cho qua**.
  - Lệnh Bash đụng `tests/` mà có dấu hiệu ghi file (`>`, `sed -i`, `rm`, `mv`, `cp`, `tee`, `touch`...) → **chặn**.
  - Lệnh Bash nhắc tới `tests/private` mà không phải lệnh chạy test → **chặn**.
  - Edit/Write vào `tests/**` → **chặn**; Read/Grep/Glob vào `tests/private` → **chặn**.
  - Chặn = `exit 2`, lý do (stderr) được gửi lại cho agent.
  - Viết bằng Node (thay vì bash) để parse JSON mà không cần cài `jq`.
- **`PostToolUse`** → `pnpm lint` chạy *sau* mỗi lần agent sửa/tạo file.

### 3. Hạn chế cần biết
- **Output test có thể lộ nội dung `tests/private`**: khi fail, assert/stack trace in ra một phần code. Nên chạy với reporter gọn (vd. `--reporter=dot`).
- **Hook lọc theo chuỗi lệnh nên không kín 100%** (vd. agent tự viết script ở chỗ khác để đọc file). Muốn chặn ở cấp hệ thống file thì bật thêm `sandbox` của Claude Code.
- **Hook cũng có thể chặn nhầm**: lệnh nào vừa có chữ `tests/` vừa có dấu `>` (kể cả khi không ghi vào `tests/`) đều bị chặn.
- **Local chỉ có README trong `tests/private`**, quyền "chạy" chủ yếu có ý nghĩa trên CI.
- **Repo chưa có script `test`** trong `package.json` → cần thêm thì các rule `pnpm test ...` mới dùng được.

### 4. Các file settings khác (để phân biệt)
| File | Phạm vi | Commit? |
|---|---|---|
| `.claude/settings.json` | cả team trong project | ✅ |
| `.claude/settings.local.json` | chỉ máy mình trong project | ❌ (gitignore) |
| `~/.claude/settings.json` | mọi project trên máy | ❌ |

### 5. Kiểm tra
- Gõ `/permissions` để xem rule đang áp dụng, `/hooks` để xem hook đã load chưa.
- Thử nhờ agent:
  - `cat tests/private/README.md` → bị từ chối.
  - sửa 1 file trong `tests/public` → bị từ chối.
  - `pnpm test tests/private` → được chạy.
