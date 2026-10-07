# ---------- AMI: Amazon Linux 2023, tự chọn x86_64/arm64 theo instance_type ----------
data "aws_ec2_instance_type" "selected" {
  instance_type = var.instance_type
}

locals {
  arch         = contains(data.aws_ec2_instance_type.selected.supported_architectures, "arm64") ? "arm64" : "x86_64"
  is_burstable = startswith(var.instance_type, "t")
  enable_ssh   = var.ssh_public_key != ""
}

data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${local.arch}"
}

# ---------- Network: dùng default VPC (không tạo NAT Gateway vì tốn tiền) ----------
data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "app" {
  name        = "${var.project_name}-sg"
  description = "HTTP public, SSH chi tu IP cua minh"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.app.id
  description       = "HTTP"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  count = local.enable_ssh ? 1 : 0

  security_group_id = aws_security_group.app.id
  description       = "SSH"
  cidr_ipv4         = var.ssh_allowed_cidr
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22

  lifecycle {
    precondition {
      condition     = can(cidrhost(var.ssh_allowed_cidr, 0))
      error_message = "Có ssh_public_key thì phải đặt ssh_allowed_cidr (vd: 1.2.3.4/32)."
    }
  }
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_key_pair" "this" {
  count = local.enable_ssh ? 1 : 0

  key_name   = "${var.project_name}-key"
  public_key = var.ssh_public_key
}

# ---------- IAM: cho phép vào máy qua SSM Session Manager (free, không cần mở port 22) ----------
resource "aws_iam_role" "ec2" {
  name = "${var.project_name}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2.name
}

# ---------- EC2 ----------
resource "random_password" "db" {
  length  = 24
  special = false
}

resource "aws_instance" "app" {
  ami                         = data.aws_ssm_parameter.al2023.insecure_value
  instance_type               = var.instance_type
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  vpc_security_group_ids      = [aws_security_group.app.id]
  key_name                    = local.enable_ssh ? aws_key_pair.this[0].key_name : null
  associate_public_ip_address = true

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_size
    encrypted   = true
  }

  # Dòng t mặc định là "unlimited" -> có thể bị tính phí khi dùng CPU quá mức. "standard" thì không.
  dynamic "credit_specification" {
    for_each = local.is_burstable ? [1] : []
    content {
      cpu_credits = "standard"
    }
  }

  metadata_options {
    http_tokens = "required" # IMDSv2
  }

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    repo_url     = var.repo_url
    git_branch   = var.git_branch
    db_password  = random_password.db.result
    vite_api_url = var.vite_api_url
  })
  # Đổi user_data (branch, mật khẩu...) sẽ TẠO LẠI instance -> mất dữ liệu DB
  user_data_replace_on_change = true

  tags = {
    Name = "${var.project_name}-app"
  }

  lifecycle {
    # AMI mới ra thì không tự tạo lại máy
    ignore_changes = [ami]
  }
}

# ---------- Cảnh báo chi phí (2 budget đầu tiên miễn phí) ----------
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project_name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Không trừ credit, để biết ngay khi bắt đầu tiêu credit của Free plan
  cost_types {
    include_credit = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
