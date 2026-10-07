variable "aws_region" {
  description = "Region AWS. Singapore là gần Việt Nam nhất."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Tiền tố đặt tên cho mọi resource."
  type        = string
  default     = "react-crud"
}

variable "instance_type" {
  description = "Loại EC2. Phải là loại free tier của account bạn (xem infra/README.md)."
  type        = string
  default     = "t3.micro"
}

variable "root_volume_size" {
  description = "Dung lượng ổ EBS (GB). Free tier cho tối đa 30GB."
  type        = number
  default     = 20

  validation {
    condition     = var.root_volume_size <= 30
    error_message = "Quá 30GB sẽ vượt free tier."
  }
}

variable "repo_url" {
  description = "Repo Git để EC2 clone về (phải là repo public)."
  type        = string
  default     = "https://github.com/TNK-git-hub/React-CRUD-Practice.git"
}

variable "git_branch" {
  description = "Branch được deploy."
  type        = string
  default     = "restructure-frontend"
}

variable "vite_api_url" {
  description = "Base URL API cho frontend lúc build. Để trống = dummyjson, đặt \"/api\" để gọi backend trên EC2."
  type        = string
  default     = ""
}

variable "ssh_public_key" {
  description = "Nội dung public key (vd: file ~/.ssh/id_ed25519.pub). Để trống = không mở SSH, chỉ dùng SSM Session Manager."
  type        = string
  default     = ""
}

variable "ssh_allowed_cidr" {
  description = "IP được phép SSH, dạng x.x.x.x/32. Chỉ dùng khi có ssh_public_key."
  type        = string
  default     = ""
}

variable "alert_email" {
  description = "Email nhận cảnh báo khi chi phí AWS vượt ngưỡng."
  type        = string
}

variable "budget_limit_usd" {
  description = "Ngưỡng cảnh báo chi phí mỗi tháng (USD)."
  type        = number
  default     = 1
}
