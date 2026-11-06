# README Test

File thử nghiệm để kiểm tra quyền push lên repository.

# Set up quyền code của khánh
Harness gồm 2 phần: **agent test** (`chore/test-setup`) và **agent code** (của khánh). Test nằm trong từng package:

```
backend/test/   frontend/test/
├── public/     # đọc + chạy được; chỉ test-writer được sửa
├── private/    # chỉ chạy được (pnpm test:private); không ai đọc/sửa; bị gitignore, file thật chỉ có trên CI
└── e2e/        # (frontend) script Playwright; chỉ test-writer được sửa
```

## Các agent
| Agent | Việc | Tools |
|---|---|---|
| Session chính | Điều phối, giao việc, tổng hợp | tất cả, nhưng bị guard giới hạn quyền ghi |
| `code-planner` | Lập kế hoạch code, không viết code | Read, Grep, Glob |
| `code-writer` | Viết code production đến khi lint/typecheck/test pass | Read, Grep, Glob, Write, Edit, Bash |
| `code-reviewer` | Review diff, không sửa | Read, Grep, Glob, Bash |
| `test-planner` | Lập kế hoạch test | Read, Grep, Glob |
| `test-writer` | Viết test vào `test/public`, `test/e2e` | Read, Grep, Glob, Write, Edit, Bash |
| `test-critic` | Soi chất lượng test, chạy Stryker | Read, Grep, Glob, Bash |

Quy trình: `code-planner` + `test-planner` → `test-writer` → `code-writer` → `code-reviewer` + `test-critic`.

## Quyền ghi (Edit/Write) theo agent
Do `.claude/hooks/guard.mjs` quyết định, dựa trên trường `agent_type` mà Claude Code gửi vào hook khi tool được gọi trong subagent (session chính không có trường này).

| Đường dẫn | Session chính | `code-writer` | `test-writer` | agent khác |
|---|---|---|---|---|
| `backend/src`, `frontend/src`, `frontend/public` | ❌ | ✅ | ❌ | ❌ |
| `<package>/test/public`, `frontend/test/e2e` | ❌ | ❌ | ✅ | ❌ |
| `<package>/test/private` | ❌ | ❌ | ❌ | ❌ |
| Harness: `.claude/`, `CLAUDE.md`, `package.json`, `pnpm-*.yaml`, `vitest/stryker.config.*` | ❓ hỏi | ❓ hỏi | ❌ | ❌ |
| `.env*` | ❌ | ❌ | ❌ | ❌ |
| Còn lại (`docs/`, `README.md`, `infra/`…) | ✅ | ❌ | ❌ | ❌ |

Đọc: mọi agent đọc được hết, trừ `test/private` và `.env`.

## Cấu hình (`.claude/settings.json`)
### 1. `permissions`
- `allow`: không cần hỏi khi chạy `pnpm test`, `pnpm --filter <pkg> test`, `pnpm lint`, Stryker, `.venv/bin/python`, `git status/diff`.
- `deny` (áp dụng cho **mọi** agent, không agent nào được miễn): đọc `.env`, đọc `**/test/private/**`, `cat/head/tail/less/ls */test/private`.
- Quyền ghi theo agent **không** để ở `deny`, vì `deny` không phân biệt được agent → chuyển hết sang hook.

### 2. `hooks`
| Hook | Script | Làm gì |
|---|---|---|
| `PreToolUse` | `guard.mjs` | Phân quyền ghi theo bảng trên; chặn đọc `test/private`; với Bash: chặn ghi vào `test/`, `src/` (trừ `code-writer`), hỏi khi đụng harness. Chặn = `exit 2`, hỏi = `permissionDecision: "ask"`. |
| `PostToolUse` | `lint-changed.mjs` | Chạy `eslint --quiet` trên đúng file frontend vừa sửa; có lỗi thì `exit 2` để agent nhận lỗi và tự sửa. |
| `Stop` (session chính) | `stop-gate.sh` | Có file thay đổi thì chạy `pnpm test`; fail thì không cho báo xong. |
| `Stop` trong frontmatter `code-writer` (chạy như `SubagentStop`) | `code-gate.sh` | Chạy `pnpm lint` → typecheck frontend → `pnpm test`; fail thì `code-writer` không được báo xong. |

## Hạn chế cần biết
- **Session chính có thể nhờ writer làm hộ** (vd. bảo `test-writer` sửa test cho khớp code sai). Hook không chặn được, chỉ có quy tắc trong `CLAUDE.md`.
- **`agent_type` chỉ là tên**: subagent nào tên `code-writer`/`test-writer` cũng có quyền tương ứng. Agent không tự tạo được vì `.claude/` là harness (phải hỏi).
- **Hook lọc Bash theo chuỗi lệnh nên không kín 100%** (vd. `node -e "fs.writeFileSync(...)"`). Muốn chặn ở cấp hệ thống file thì bật `sandbox` của Claude Code.
- **Output test có thể lộ nội dung `test/private`** khi fail. Nên chạy với reporter gọn (vd. `--reporter=dot`).
- **Chưa có workflow CI**, nên `test/private` hiện chưa được chạy ở đâu.
- **Sửa agent/settings phải khởi động lại Claude Code** (hoặc mở `/agents`, `/hooks`) mới có hiệu lực.

## Các file settings khác (để phân biệt)
| File | Phạm vi | Commit? |
|---|---|---|
| `.claude/settings.json` | cả team trong project | ✅ |
| `.claude/settings.local.json` | chỉ máy mình trong project | ❌ (gitignore) |
| `~/.claude/settings.json` | mọi project trên máy | ❌ |

## Kiểm tra
- `/permissions` xem rule, `/hooks` xem hook, `/agents` xem subagent đã load.
- Thử:
  - Session chính sửa `frontend/src/...` → bị chặn; giao cho `code-writer` → được.
  - `code-writer` sửa `frontend/test/public/...` → bị chặn.
  - `test-writer` sửa `frontend/test/public/...` → được; sửa `frontend/src/...` → bị chặn.
  - Bất kỳ ai `cat backend/test/private/x.test.ts` → bị chặn.
  - Session chính sửa `CLAUDE.md` → hiện hộp hỏi.
