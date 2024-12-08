#!/bin/bash
JOB_ID="$1"

curl -X POST http://localhost:4321/api/flutter/hot-restart.json \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{\"jobId\": \"$JOB_ID\"}" \
  --trace-ascii /dev/stdout