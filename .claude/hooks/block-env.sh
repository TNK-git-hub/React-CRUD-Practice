#!/bin/bash
# Block Bash commands that reference .env files (except .env.example).
cmd=$(jq -r '.tool_input.command // empty')
# Drop allowed mentions of .env.example, then look for any remaining .env reference
stripped=$(printf '%s' "$cmd" | sed -E 's/\.env\.example//g')
if printf '%s' "$stripped" | grep -Eq '\.env([^A-Za-z0-9_]|$)|\.env\.[A-Za-z0-9_]+'; then
  echo "Blocked: Claude is not allowed to access .env files (only .env.example)." >&2
  exit 2
fi
exit 0
