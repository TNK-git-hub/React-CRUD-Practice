# Deploy lên AWS EC2 bằng Terraform

Toàn bộ app (nginx + frontend, backend NestJS, Postgres) chạy bằng docker compose trên **1 instance EC2**:

```
Internet ──:80──▶ web (nginx: serve frontend, proxy /api → backend:3000)
                    └─▶ backend (NestJS) ──▶ postgres (không mở port ra ngoài)
```

Terraform tạo: security group (trong default VPC), IAM role cho SSM, EC2 + EBS gp3, budget cảnh báo chi phí.

## Về "free"

- **Account tạo trước 15/07/2025**: 12 tháng free 750 giờ/tháng `t2.micro` hoặc `t3.micro`, 30GB EBS, 750 giờ public IPv4.
- **Account tạo từ 15/07/2025**: Free plan có $100–200 credit trong 6 tháng, chỉ một số loại instance được dùng.
- Kiểm tra loại instance account bạn được free:
  ```bash
  aws ec2 describe-instance-types --region ap-southeast-1 \
    --filters Name=free-tier-eligible,Values=true --query 'InstanceTypes[].InstanceType'
  ```
  Nếu không có `t3.micro` thì đặt `instance_type` trong `terraform.tfvars` (vd: `t2.micro`, `t4g.micro`).
- Những thứ cố ý **không** dùng vì tốn tiền: NAT Gateway, Load Balancer, Elastic IP, RDS.
- CPU credit đặt `standard`: khi hết credit thì máy chậm lại, không bị tính thêm tiền.
- Có budget gửi email khi chi phí vượt $1/tháng. **Nhớ bấm xác nhận** email AWS gửi tới.
- Chỉ chạy **1 instance**. 750 giờ/tháng là đủ cho 1 máy chạy 24/7.

## Chuẩn bị (1 lần)

```bash
brew install terraform awscli
brew install --cask session-manager-plugin   # để vào shell EC2 qua SSM
```

1. Vào AWS Console → IAM → Users → tạo user (vd: `terraform`) → gắn policy `AdministratorAccess` → tạo **Access key** (loại CLI).
2. `aws configure` → nhập access key, secret, region `ap-southeast-1`.
3. Repo phải để **public** để EC2 `git clone` được.
4. Push branch cần deploy lên GitHub (mặc định `restructure-frontend`).

## Deploy

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # sửa alert_email
terraform init
terraform plan
terraform apply
```

Chờ khoảng 5–10 phút (lần đầu EC2 phải cài docker và build image), sau đó mở `app_url` trong output.

Xem tiến trình:

```bash
$(terraform output -raw connect_ssm)
sudo tail -f /var/log/user-data.log
sudo docker compose -f /opt/app/docker-compose.prod.yml ps
```

## Cập nhật code

Push code lên branch rồi chạy:

```bash
eval "$(terraform output -raw redeploy_command)"
```

Lệnh này chỉ `git pull` và build lại, **không** xoá DB.

Khi backend đã có API: đặt `vite_api_url = "/api"` trong `terraform.tfvars`. Lưu ý: thay đổi này làm Terraform **tạo lại EC2** và mất DB. Nếu không muốn mất DB thì vào máy, sửa `VITE_API_URL=/api` trong `/opt/app/.env`, rồi chạy lại lệnh redeploy.

> Hiện `apiFetch` nối `${BASE_URL}/${path}` mà path đã có `/` ở đầu, nên URL thành `/api//products`. Express không gộp `//`, nên khi chuyển sang `/api` nhớ bỏ bớt 1 dấu `/`.

## Xoá hết

```bash
terraform destroy
```

## Lưu ý

- `terraform.tfstate` chứa mật khẩu DB → **không commit** (đã có trong `.gitignore`).
- Public IP **đổi** mỗi lần stop/start instance (vì không dùng Elastic IP), chạy `terraform refresh && terraform output` để lấy IP mới.
- Đổi `git_branch`, `vite_api_url` hoặc `repo_url` sẽ tạo lại EC2 (dữ liệu Postgres mất theo).
