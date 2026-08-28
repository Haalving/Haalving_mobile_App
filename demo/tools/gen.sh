#!/bin/sh
# gen.sh <name> <pillar> "<subject clause>" [size] — generate, download, key + grade
SP="$(cd "$(dirname "$0")" && pwd)/work"
NAME="$1"; PILLAR="$2"; SUBJECT="$3"; SIZE="${4:-192}"
mkdir -p "$SP/raw" "$SP/out"

STYLE="Museum specimen photograph of $SUBJECT sculpted in matte unglazed stoneware clay, powdery dry surface, soft diffuse studio light from above, gentle soft shadows inside the object only, monochromatic muted desaturated clay, centered and floating on a pure white background, nothing else in frame, no gloss, no reflections, no text, subject fills 70 percent of the frame"

higgsfield generate create gpt_image_2 --prompt "$STYLE" \
  --aspect_ratio 1:1 --quality high --resolution 1k --wait --json \
  > "$SP/raw/$NAME.json" 2> "$SP/raw/$NAME.err"

URL=$(python3 - "$SP/raw/$NAME.json" <<'EOF'
import json, re, sys
s = open(sys.argv[1]).read()
m = re.findall(r'https://[^"\s\\]+?\.(?:png|jpe?g|webp)[^"\s\\]*', s)
print(m[0] if m else '')
EOF
)
if [ -z "$URL" ]; then echo "FAIL $NAME: no result url"; exit 1; fi
curl -sL "$URL" -o "$SP/raw/$NAME.png"
python3 "$(cd "$(dirname "$0")" && pwd)/process.py" "$SP/raw/$NAME.png" "$SP/out/$NAME.webp" "$PILLAR" "$SIZE"
