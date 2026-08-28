#!/bin/sh
# genphoto.sh <name> <pillar> "<subject clause>" [size] [grade|natural]
# The photographic sibling of gen.sh: a clean studio subject on pure white,
# keyed to alpha. 'natural' keeps the photo's own colours (a dressed figure
# whose garment wears the pillar colour); 'grade' (default) tone-maps into
# the pillar token family like the clay art.
SP="$(cd "$(dirname "$0")" && pwd)/work"
NAME="$1"; PILLAR="$2"; SUBJECT="$3"; SIZE="${4:-640}"; MODE="${5:-grade}"
mkdir -p "$SP/raw" "$SP/out"

STYLE="Professional studio photograph of $SUBJECT, soft even diffuse lighting, gentle shadows inside the subject only, centered and isolated on a pure seamless white background, nothing else in frame, no props, no text, subject fills 75 percent of the frame"

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
python3 "$(cd "$(dirname "$0")" && pwd)/process.py" "$SP/raw/$NAME.png" "$SP/out/$NAME.webp" "$PILLAR" "$SIZE" "$MODE"
