# Business rules: products

## Rules

| ID | Rule | Source |
| --- | --- | --- |
| BR-PROD-01 | Khoảng giá tính cả hai đầu: sản phẩm có giá bằng đúng giá tối thiểu hoặc giá tối đa vẫn được hiện | docs/requirements/price-range.md#Yêu cầu |
| BR-PROD-02 | Bỏ trống giá tối thiểu thì không giới hạn phía dưới; bỏ trống giá tối đa thì không giới hạn phía trên | docs/requirements/price-range.md#Yêu cầu |
| BR-PROD-03 | Giá tối thiểu và giá tối đa không âm; giá 0 hợp lệ | docs/requirements/price-range.md#Yêu cầu; quyết định người dùng, 2026-11-12 |
| BR-PROD-04 | Giá tối thiểu và giá tối đa có tối đa 2 chữ số thập phân (cột giá là `numeric(10,2)`) | docs/requirements/price-range.md#Yêu cầu |
| BR-PROD-05 | Giá tối thiểu không được lớn hơn giá tối đa: UI chặn và báo "Giá tối thiểu không được lớn hơn giá tối đa"; backend trả 400 | quyết định người dùng, 2026-11-12 |
| BR-PROD-06 | Giá tối thiểu và giá tối đa không vượt quá 99999999.99 (giới hạn của cột `numeric(10,2)`) | quyết định người dùng, 2026-11-12 |
| BR-PROD-07 | Giá trị lọc âm, có hơn 2 chữ số thập phân hoặc không phải số: UI chặn trước khi gửi và báo lỗi cụ thể cho từng trường hợp; backend vẫn trả 400 | quyết định người dùng, 2026-11-12 |

## Decision tables

### BR-PROD-02: Khoảng giá khi bỏ trống một đầu

Áp dụng khi các giá trị đã nhập đều hợp lệ (BR-PROD-03, BR-PROD-04, BR-PROD-06, BR-PROD-07).

| Có giá tối thiểu | Có giá tối đa | Result |
| --- | --- | --- |
| yes | yes | Giá tối thiểu ≤ giá tối đa: hiện sản phẩm có giá tối thiểu ≤ giá ≤ giá tối đa. Giá tối thiểu > giá tối đa: bị chặn theo BR-PROD-05 |
| yes | no | Hiện sản phẩm có giá ≥ giá tối thiểu |
| no | yes | Hiện sản phẩm có giá ≤ giá tối đa |
| no | no | Không lọc theo giá (như hiện nay) |

## Open questions

- _(không có)_ — nội dung từng thông báo lỗi của BR-PROD-07 chưa chốt câu chữ; chốt ở bước `/speckit-clarify` của 001.
