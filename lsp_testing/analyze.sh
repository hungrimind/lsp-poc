#!/bin/bash
curl -X POST http://localhost:4321/api/flutter/analyze.json \
  -F "files=@$1" \
  -F "paths=$2"
