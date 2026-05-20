# IA build notes

LaTeX sources for the IBDP CS Internal Assessment. Each criterion is one self-contained `.tex` file; figures are rendered from text-source diagrams under `diagrams/`.

## Diagrams (text → PDF)

All diagrams are written as [Mermaid](https://mermaid.js.org) scripts. They're plain text — versionable, reviewable in a diff, regeneratable. The build script POSTs each `.mmd` to [Kroki](https://kroki.io) and saves both PDF (for LaTeX) and SVG (for browser inspection).

```bash
cd ia/diagrams
./build.sh
```

Each diagram renders in ~2 seconds. No local install required (just `curl`, which ships with macOS). If you'd rather self-host the renderer (offline / privacy):

```bash
docker run --rm -p 8000:8000 yuzutech/kroki
KROKI_URL=http://localhost:8000 ./build.sh
```

Sources:
- `structure_chart.mmd` — sub-system decomposition (CritB)
- `erd.mmd` — Postgres schema (CritB)
- `gantt.mmd` — project timeline (CritB)

## Compiling the PDFs

Any LaTeX distribution (TeX Live, MacTeX, MikTeX, or Overleaf) works.

```bash
cd ia
pdflatex critA.tex
pdflatex critB.tex   # run after diagrams/build.sh
```
