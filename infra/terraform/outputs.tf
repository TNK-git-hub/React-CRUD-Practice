output "app_url" {
  description = "Mở link này sau khoảng 5-10 phút (lần đầu phải build image)."
  value       = "http://${aws_instance.app.public_dns}"
}

output "public_ip" {
  value = aws_instance.app.public_ip
}

output "instance_id" {
  value = aws_instance.app.id
}

output "connect_ssm" {
  description = "Vào shell của EC2 (cần cài session-manager-plugin). Hoặc vào EC2 Console > Connect > Session Manager."
  value       = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.app.id}"
}

output "connect_ssh" {
  value = local.enable_ssh ? "ssh ec2-user@${aws_instance.app.public_ip}" : "SSH đang tắt (chưa đặt ssh_public_key)"
}

output "redeploy_command" {
  description = "Kéo code mới nhất của branch và build lại, không cần SSH."
  value       = "aws ssm send-command --region ${var.aws_region} --instance-ids ${aws_instance.app.id} --document-name AWS-RunShellScript --parameters 'commands=[\"cd /opt/app && git pull && docker compose -f docker-compose.prod.yml up -d --build\"]'"
}
