# IA build notes

LaTeX sources for the IBDP CS Internal Assessment. Each criterion is one self-contained `.tex` file; figures are rendered from text-source diagrams under `diagrams/`.

## Diagrams (text → PDF)

All diagrams are written as [Mermaid](https://mermaid.js.org) scripts. They're plain text — versionable, reviewable in a diff, regeneratable. The build script renders each `.mmd` to both PDF (for LaTeX) and SVG (for browser inspection) via `@mermaid-js/mermaid-cli`.

```bash
cd ia/diagrams
./build.sh
```

First run downloads ~150 MB of headless Chromium (Mermaid renders in a real browser). Subsequent runs take a few seconds.

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
