#!/usr/bin/env bash
# Renders every .mmd in this directory to PDF (and SVG) using mermaid-cli.
#
# Why mermaid-cli: diagrams live as plain text (versionable, diff-friendly,
# regeneratable) and render via a single CLI. PDF is consumed by critB.tex
# through \includegraphics; SVG is kept for inspection in a browser.
#
# Requires Node.js. mermaid-cli is invoked via npx (-y auto-confirms install).
# First run downloads ~150 MB of Chromium via Puppeteer; later runs are fast.

set -euo pipefail
cd "$(dirname "$0")"

MMDC="npx -y @mermaid-js/mermaid-cli"
CONFIG="$(mktemp -t mmdcfg.XXXX).json"
trap 'rm -f "$CONFIG"' EXIT

# Bigger render canvas so wide structure charts + tall Gantt don't get cramped.
cat > "$CONFIG" <<'JSON'
{
  "maxTextSize": 90000,
  "flowchart": { "useMaxWidth": false, "htmlLabels": true },
  "gantt":     { "useMaxWidth": false, "fontSize": 11, "barHeight": 14 },
  "er":        { "useMaxWidth": false }
}
JSON

for mmd in *.mmd; do
  base="${mmd%.mmd}"
  echo "→ $mmd"
  $MMDC -i "$mmd" -o "${base}.pdf" -c "$CONFIG" -b white -t neutral --pdfFit
  $MMDC -i "$mmd" -o "${base}.svg" -c "$CONFIG" -b white -t neutral
done

echo "done. outputs: $(ls *.pdf *.svg 2>/dev/null | tr '\n' ' ')"
