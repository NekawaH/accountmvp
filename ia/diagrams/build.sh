#!/usr/bin/env bash
# Renders every .mmd in this directory to PNG (via Kroki, high DPI) and SVG.
#
# Why PNG instead of PDF/SVG-then-convert:
#   - Mermaid flowcharts and ER diagrams put their labels inside SVG
#     <foreignObject> HTML. rsvg-convert / cairosvg cannot render those —
#     you get empty boxes.
#   - Kroki rasterises server-side using a real headless browser, so every
#     label renders correctly.
#   - LaTeX's \includegraphics handles PNG natively. No local converter,
#     no font installs.
#
# SVGs are still produced for browser-side inspection of the source diagram.

set -euo pipefail
cd "$(dirname "$0")"

KROKI="${KROKI_URL:-https://kroki.io}"

# Kroki accepts diagram-options via either header or per-request JSON.
# scale=3 gives ~3× the default raster resolution — sharp at print sizes.
SCALE="${KROKI_SCALE:-3}"

fetch() {
  local src="$1" out="$2" fmt="$3"
  local code
  if [[ "$fmt" == "png" ]]; then
    code=$(curl -s -o "$out" -w '%{http_code}' \
                -X POST "$KROKI/mermaid/$fmt" \
                -H 'Content-Type: text/plain' \
                -H "Kroki-Diagram-Options: scale=$SCALE" \
                --data-binary "@$src")
  else
    code=$(curl -s -o "$out" -w '%{http_code}' \
                -X POST "$KROKI/mermaid/$fmt" \
                -H 'Content-Type: text/plain' \
                --data-binary "@$src")
  fi
  if [[ "$code" != "200" ]]; then
    echo "  ✗ $fmt failed (HTTP $code):"
    cat "$out"; echo
    rm -f "$out"
    return 1
  fi
  echo "  ✓ $out ($(wc -c < "$out") bytes)"
}

for mmd in *.mmd; do
  base="${mmd%.mmd}"
  echo "→ $mmd"
  fetch "$mmd" "${base}.png" png || true
  fetch "$mmd" "${base}.svg" svg || true
done

# Clean stale PDFs from the previous broken pipeline so LaTeX picks up the PNGs.
rm -f ./*.pdf

echo "done."
