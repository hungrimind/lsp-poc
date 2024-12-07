#!/bin/bash
# Read file content as base64
FILE_CONTENT=$(base64 -i "$1")

curl -X POST https://lsp-poc.fly.dev/api/flutter/compile.json \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{\"fileContent\": \"$FILE_CONTENT\", \"path\": \"$2\"}" \
  --tlsv1.2 \
  -k \
  --trace-ascii /dev/stdout
