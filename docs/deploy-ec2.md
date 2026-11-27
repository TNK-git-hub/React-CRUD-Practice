# Deploy lên AWS EC2 (làm tay)

Toàn bộ app chạy bằng `docker-compose.prod.yml` trên **1 instance EC2**:

```
Internet ──:80──▶ web (nginx) ──/api/*──▶ backend (NestJS :3000) ──▶ postgres, redis
                      └──── còn lại ────▶ frontend (Next.js :3000)
```

Chỉ nginx mở cổng 80 ra ngoài. Postgres, Redis, backend, frontend chỉ nằm trong network nội bộ của compose.

## 1. Tạo EC2 trên AWS Console

- **AMI**: Amazon Linux 2023.
- **Instance type**: `t3.micro` (hoặc loại free-tier account bạn được dùng, kiểm tra bằng
  `aws ec2 describe-instance-types --filters Name=free-tier-eligible,Values=true --query 'InstanceTypes[].InstanceType'`).
- **Storage**: 20GB gp3.
- **Security group**: inbound `80/tcp` từ `0.0.0.0/0`, `22/tcp` chỉ từ IP của bạn (`x.x.x.x/32`).
- **Key pair**: tạo hoặc chọn một key để SSH.
- Không dùng NAT Gateway, Load Balancer, Elastic IP, RDS vì tốn tiền. Public IP sẽ đổi mỗi lần stop/start.
- Vào **AWS Budgets** tạo budget cảnh báo (vd. $1/tháng) để không bị bất ngờ về chi phí.

## 2. Cài đặt máy (1 lần)

```bash
ssh -i <key>.pem ec2-user@<public-ip>

# Swap 2GB: t3.micro chỉ có 1GB RAM, không đủ để build Next.js
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab

# Docker + git
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user   # thoát SSH rồi vào lại để có hiệu lực

# Plugin docker compose + buildx
ARCH=$(uname -m)
case "$ARCH" in x86_64) GOARCH=amd64 ;; aarch64) GOARCH=arm64 ;; esac
PLUGINS=/usr/local/lib/docker/cli-plugins
sudo mkdir -p "$PLUGINS"
sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$ARCH" \
  -o "$PLUGINS/docker-compose"
BUILDX_TAG=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/docker/buildx/releases/latest | sed 's#.*/##')
sudo curl -fsSL "https://github.com/docker/buildx/releases/download/$BUILDX_TAG/buildx-$BUILDX_TAG.linux-$GOARCH" \
  -o "$PLUGINS/docker-buildx"
sudo chmod +x "$PLUGINS"/*
```

## 3. Lấy code và tạo `.env`

```bash
git clone --branch <branch> https://github.com/TNK-git-hub/React-CRUD-Practice.git ~/app
cd ~/app

cat > .env <<EOF
DB_USER=postgres
DB_PASSWORD=$(openssl rand -hex 16)
DB_NAME=crud_practice
NEXT_PUBLIC_API_URL=/api
EOF
chmod 600 .env
```

- `DB_PASSWORD` bắt buộc, compose sẽ báo lỗi nếu thiếu.
- `NEXT_PUBLIC_API_URL=/api` để frontend gọi backend qua nginx. Bỏ trống thì frontend gọi dummyjson.
- Không commit file `.env`.

## 4. Chạy app

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Lần đầu build mất vài phút. Xong thì mở `http://<public-ip>`.

## Cập nhật code

```bash
cd ~/app && git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Dữ liệu Postgres và ảnh upload nằm trong volume (`pgdata`, `uploads`) nên không mất khi build lại.
`NEXT_PUBLIC_API_URL` được nhúng lúc build, đổi giá trị trong `.env` thì phải build lại frontend.

## Gỡ

- `docker compose -f docker-compose.prod.yml down -v` xoá container và cả dữ liệu.
- Terminate instance trên Console, xoá security group, key pair và budget nếu không dùng nữa.
