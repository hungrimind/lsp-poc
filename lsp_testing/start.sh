#!/bin/bash
FILE_CONTENT=$(base64 -i "$1")

curl -X POST http://localhost:4321/api/flutter/start.json \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{\"fileContent\": \"$FILE_CONTENT\", \"path\": \"$2\"}" \
  --trace-ascii /dev/stdout