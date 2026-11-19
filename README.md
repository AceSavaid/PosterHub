# PosterHub

Make research and academic posters in your browser. No account, no install: everything runs on your computer and your posters stay in your browser until you export them.

## What it does

- **Any size, either way round**: A0–A4, common US sizes (36 × 48 in, 24 × 36 in, …) or any custom size in mm, cm or inches; portrait or landscape.
- **Layouts and columns**: start from a layout (classic columns, central figure, key-finding banner, blank) with 1–6 columns. Elements snap to the column guides.
- **Colour palettes**: ten ready-made palettes or your own colours. Elements linked to a palette colour update when you switch palettes.
- **Titles, headers, text, images, shapes and graphs**: double-click to type, paste text or images straight onto the poster, drag image files in.
- **Graphs from CSV**: load a CSV (or paste cells from Excel / Sheets), pick the columns and rows to plot, and choose bar, line, scatter, pie or doughnut.
- **Fonts**: popular Google Fonts built in, add any other Google font by name, or upload your own `.ttf` / `.otf` / `.woff` file.
- **PowerPoint templates**: import a `.pptx` or `.potx` template; its size, colours, fonts, background, shapes, text and pictures come across.
- **My posters**: every poster autosaves to a library in your browser, with thumbnails, rename, duplicate and delete.
- **Export**: PDF for printing, PowerPoint (editable text, shapes and native charts), PNG, or a `.poster.json` project file you can back up or open on another computer.
- **Share and present**: copy the poster as an image to paste anywhere, or open View mode to present it full screen.

## Development

```bash
npm install
npm run dev          # start the app at http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # browser tests (Playwright; run `npx playwright install chromium` once)
npm run build        # production build in dist/
```

The app is a static site (Vite + React + TypeScript). `vite.config.ts` uses relative asset paths so the same build works on GitHub Pages and inside a desktop wrapper (Tauri or Electron) later.

### Project layout

| Path | What lives there |
| --- | --- |
| `src/types.ts` | The poster document model (sizes in mm, fonts in pt) |
| `src/model.ts` | Size presets, palettes, layouts, element defaults |
| `src/lib/` | Storage (IndexedDB), fonts, charts, exporters, PowerPoint import, undo history |
| `src/components/` | Library, editor, canvas, panels and dialogs |
| `tests/unit/` | Vitest unit tests |
| `tests/e2e/` | Playwright end-to-end tests |

## Publishing on GitHub Pages

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes the site. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once.

## Licences

The test font `tests/fixtures/Italiana-Regular.ttf` is under the SIL Open Font License (see `tests/fixtures/Italiana-OFL.txt`).
