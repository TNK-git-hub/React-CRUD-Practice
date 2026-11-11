<!--
Sync Impact Report
- Version change: 1.0.0 → 1.0.0 (sửa trước lần merge đầu; chưa từng có hiệu lực nên giữ
  version và ngày ratified)
- Modified principles:
  - III. Chỉ Soft-delete, không xoá cứng → III. Chính sách xoá dữ liệu rõ ràng
  - IV. TypeScript Strict → IV. Kiểm tra kiểu chặt
  - I. Ví dụ ID đổi từ `PROD-003` sang `ABC-003` (minh hoạ, không phải mã domain thật);
    bỏ cú pháp test riêng của JS
- Added sections: không có
- Removed sections: không có
- Other changes:
  - Ràng buộc kỹ thuật & dữ liệu: bỏ mã domain `AUTH`/`PROD`/`USER`; mã domain do
    `/spec-bootstrap` đăng ký trong `.claude/CLAUDE.md`
  - Cổng chất lượng: bỏ kiểm tra "không xoá cứng"; thêm kiểm tra chính sách xoá; kiểm tra
    kiểu = chế độ strict của stack; bộ test của stack thay cho `npm test`
- Templates: không sửa (lệnh constitution chỉ ghi file này; template đọc constitution lúc chạy)
- Follow-up TODOs: không còn (đã bỏ TODO(GLOSSARY_SOFT_DELETE) và TODO(TSCONFIG))
- Đồng bộ cần làm ngoài file này:
  - `.claude/CLAUDE.md` vẫn liệt kê `AUTH`/`PROD`/`USER`, luật "xoá là soft-delete" và
    `npm test` → mâu thuẫn với constitution, cần sửa.
  - Skill `/spec-bootstrap` chưa tồn tại.
-->

# AI-native-practice Constitution

## Core Principles

### I. Truy vết Requirement → Test qua Scenario ID (NON-NEGOTIABLE)

- Mọi requirement (`<MÃ>-<NNN>`, vd `ABC-003`) MUST có ít nhất một scenario
  `<MÃ>-<NNN>-S<n>` dạng Given / When / Then trong spec.
- Mọi scenario MUST có ít nhất một test tự động có tên bắt đầu bằng đúng scenario ID
  (vd test tên `ABC-003-S2 ...`), đặt trong `tests/<domain>/`.
- Requirement hoặc scenario không có test tương ứng thì change MUST NOT được merge.
- Test đỏ thì sửa code, MUST NOT sửa test cho xanh. Nếu spec sai, dừng lại và sửa spec
  qua quy trình change, không chỉnh test/spec cho khớp code.
- ID đã bỏ MUST NOT được cấp lại.

**Lý do**: spec là nguồn sự thật; scenario ID là sợi dây duy nhất nối spec → test → code,
cho phép kiểm tra máy móc rằng mọi hành vi đã hứa đều được kiểm chứng.

### II. Phân quyền kiểm tra ở Backend

- Mọi thao tác đọc/ghi dữ liệu cần quyền MUST được kiểm tra quyền ở backend (server),
  trước khi truy cập dữ liệu.
- Kiểm tra ở frontend (ẩn nút, chặn route) chỉ phục vụ trải nghiệm, MUST NOT được coi là
  cơ chế bảo mật.
- Backend MUST NOT tin vào danh tính, vai trò hay quyền do client tự khai trong body/query;
  danh tính lấy từ phiên/token đã xác thực.
- Mỗi requirement có ràng buộc quyền MUST có ít nhất một scenario cho trường hợp bị từ chối,
  và test của scenario đó gọi thẳng backend.
- Quyền chưa được spec nêu rõ MUST được ghi `[NEEDS CLARIFICATION]`, không tự suy đoán.

**Lý do**: client có thể bị bỏ qua hoặc giả mạo; chỉ kiểm tra ở backend mới thực sự bảo vệ
dữ liệu.

### III. Chính sách xoá dữ liệu rõ ràng

- Mỗi app MUST ghi chính sách xoá dữ liệu trong `specs/_system/nfr.md` trước change đầu tiên
  có thao tác xoá dữ liệu. Chính sách MUST nêu ít nhất:
  - xoá mềm (soft-delete) hay xoá cứng (hard-delete), theo từng loại dữ liệu nếu khác nhau;
  - thời gian lưu giữ (retention) dữ liệu đã xoá;
  - ai được khôi phục dữ liệu đã xoá (nếu có khôi phục).
- Change có thao tác xoá dữ liệu MUST NOT được merge khi chính sách chưa có trong `nfr.md`.
- Code MUST tuân theo đúng chính sách đã ghi; muốn làm khác thì sửa chính sách trước.
- Mọi requirement về xoá dữ liệu MUST có scenario thể hiện chính sách (kiểu xoá, khôi phục,
  quyền khôi phục) và test tương ứng theo Nguyên tắc I.
- Chỗ chính sách chưa rõ MUST ghi `[NEEDS CLARIFICATION]`, không tự chọn mặc định.

**Lý do**: mỗi app có nhu cầu khác nhau (khôi phục, pháp lý, dung lượng); điều cần cố định
là chính sách được quyết định có chủ đích, ghi thành văn và được kiểm chứng bằng test.

### IV. Kiểm tra kiểu chặt

- Stack (ngôn ngữ, framework) được chọn cho từng app trong `plan.md` của change đầu tiên.
- Dù dùng ngôn ngữ nào, chế độ kiểm tra kiểu/kiểm tra tĩnh chặt nhất của ngôn ngữ đó MUST
  được bật cho cả code ứng dụng và test, và `plan.md` MUST ghi rõ công cụ và cấu hình.
- MUST NOT tắt kiểm tra đó cho cả một file (vd `// @ts-nocheck`, `# mypy: ignore-errors`).
- Kiểm tra kiểu MUST chạy trong CI và MUST xanh trước khi merge.

**Lý do**: kiểu chặt bắt lỗi null/undefined và sai hợp đồng dữ liệu trước khi chạy, nhất là
khi phần lớn code do agent sinh.

### V. Mọi thay đổi đi qua PR vào `new-project`

- Branch chính là `new-project`; `main` không dùng cho phát triển.
- Mọi thay đổi (code, spec, harness, constitution) MUST đi qua Pull Request vào
  `new-project`. MUST NOT push thẳng vào `new-project`.
- Branch đặt tên: `NNN-<tên>` cho change tính năng (do `/speckit-specify` tạo),
  `harness/<việc>` cho setup harness.
- PR MUST có CI xanh và được review trước khi merge.
- Agent MUST NOT tự `git push` thay người dùng.

**Lý do**: một cửa vào duy nhất giúp mọi thay đổi được review, chạy CI và truy vết được.

## Ràng buộc kỹ thuật & dữ liệu

- Spec là nguồn sự thật. Spec sống nằm ở `specs/capabilities/<domain>/`; change đang làm ở
  `specs/changes/NNN-<tên>/` (spec delta có `kind: delta`); change đã gộp ở `specs/archive/`.
- Chỉ bước archive (`spec-archive`) được sửa `specs/capabilities/`.
- Mã domain do `/spec-bootstrap` đăng ký trong `.claude/CLAUDE.md`. Mã domain MUST được đăng
  ký ở đó trước khi dùng trong bất kỳ ID nào.
- Không tự bịa giới hạn, con số hay quyền: chỗ chưa rõ ghi `[NEEDS CLARIFICATION]`.
- Ngôn ngữ: spec, plan, tasks viết tiếng Việt; ID, tên file, tên biến, code và commit message
  viết tiếng Anh.

## Quy trình phát triển & cổng chất lượng

- Luồng một change: specify → clarify → edge cases → checklist → **người dùng duyệt spec** →
  plan → tasks → **người dùng duyệt plan & tasks** → implement → converge → archive → PR.
- Cổng trước khi mở PR (tất cả MUST đạt):
  1. Mọi scenario trong spec delta có test mang đúng scenario ID (Nguyên tắc I).
  2. Bộ test của stack xanh.
  3. Kiểm tra kiểu ở chế độ chặt nhất của stack xanh (Nguyên tắc IV).
  4. Change có thao tác xoá dữ liệu: chính sách xoá đã có trong `specs/_system/nfr.md`, code
     tuân theo, và mỗi requirement xoá có scenario và test (Nguyên tắc III).
  5. Mọi endpoint/thao tác mới cần quyền có kiểm tra ở backend và test bị từ chối
     (Nguyên tắc II).
- Mỗi change gồm hai commit (code; spec) trước khi push và mở PR vào `new-project`.

## Governance

- Constitution này đứng trên mọi hướng dẫn khác trong repo. Khi `.claude/CLAUDE.md` hay
  template mâu thuẫn với constitution, constitution thắng và tài liệu kia phải được sửa.
- Sửa constitution: chạy `/speckit-constitution`, mở PR vào `new-project` nêu rõ thay đổi,
  lý do và tác động; chỉ có hiệu lực sau khi PR được merge.
- Phiên bản theo semantic versioning:
  - MAJOR: bỏ hoặc định nghĩa lại một nguyên tắc theo cách không tương thích.
  - MINOR: thêm nguyên tắc/mục mới hoặc mở rộng đáng kể hướng dẫn.
  - PATCH: làm rõ câu chữ, sửa lỗi chính tả, không đổi ý nghĩa.
- Mọi review PR MUST kiểm tra tuân thủ năm nguyên tắc; vi phạm phải được sửa hoặc ghi lý do
  và được người review chấp thuận rõ ràng trong PR.
- Hướng dẫn vận hành hằng ngày cho agent: `.claude/CLAUDE.md`.

**Version**: 1.0.0 | **Ratified**: 2026-11-11 | **Last Amended**: 2026-11-11
