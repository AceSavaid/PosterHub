# PosterHub

Make research and academic posters in your browser. No account, no install: everything runs on your computer and your posters stay in your browser until you export them.

## What it does

- **Any size, either way round**: A0–A4, common US sizes (36 × 48 in, 24 × 36 in, …) or any custom size in mm, cm or inches; portrait or landscape.
- **Starter templates**: a gallery of ten designed layouts (classic columns, boxed sections, heading bars, clean minimal, sidebar, big takeaway, results showcase, framed panels, central figure, key-finding banner) plus blank. Each one adapts to any size, portrait or landscape, and 1–6 columns, and includes labelled spots for logos, figures and a QR code. Previews update with your size, columns and colours. Switching layout later (Layout → Rebuild layout) moves your title, authors, section text, figures, graphs, logos and QR codes into the matching places in the new layout. Elements snap to the column guides.
- **Colour palettes**: ten ready-made palettes or your own colours. Elements linked to a palette colour update when you switch palettes.
- **Titles, headers, text, images, shapes and graphs**: double-click to type, paste text or images straight onto the poster, drag image files in.
- **QR codes**: insert a QR code (or use a template's QR spot), paste a link to your paper, data or lab page and the code is made on your computer, even offline. Bare DOIs and web addresses get `https://` added so phones open them.
- **Graphs from CSV**: load a CSV (or paste cells from Excel / Sheets), pick the columns and rows to plot, and choose bar, line, scatter, pie or doughnut.
- **Fonts**: popular Google Fonts built in, add any other Google font by name, or upload your own `.ttf` / `.otf` / `.woff` file.
- **PowerPoint templates**: import a `.pptx` or `.potx` template; its size, colours, fonts, background, shapes, text and pictures come across.
- **My posters**: every poster autosaves to a library in your browser, with thumbnails, rename, duplicate and delete.
- **Export**: print-quality vector PDF (real, selectable text with embedded fonts, vector shapes and charts, full-resolution photos, so it stays sharp at A0 and beyond), PowerPoint (editable text, shapes and native charts), PNG, or a `.poster.json` project file you can back up or open on another computer.
- **Share and present**: copy the poster as an image to paste anywhere, or open View mode to present it full screen.

## Desktop app

PosterHub also comes as a desktop app for Windows, macOS and Linux (built with [Tauri](https://tauri.app)). It is the same app in its own window, with two differences:

- **My posters are files.** Each poster is saved as a `.poster.json` file in **Documents/PosterHub**, so you can back them up, sync them with OneDrive/Dropbox/iCloud, or email them like any other file. The library has a **Show folder** link. Files you copy into that folder show up in the library.
- **Exports ask where to save** (PDF, PowerPoint, PNG, project file) instead of going to Downloads.

Download the installers from the repository's **Releases** page. The apps are not code-signed yet, so the first launch shows a warning: on Windows click **More info → Run anyway**; on macOS open **System Settings → Privacy & Security** and click **Open Anyway**.

## Development

```bash
npm install
npm run dev          # start the app at http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # browser tests (Playwright; run `npx playwright install chromium` once)
npm run build        # production build in dist/
npm run desktop:dev  # run the desktop app (needs Rust; see tauri.app/start/prerequisites)
npm run desktop:build  # build a desktop installer for this computer
```

### Releasing the desktop apps

1. Bump `version` in `package.json` (the desktop app reads its version from there).
2. Push a tag: `git tag v0.2.0 && git push origin v0.2.0` (or run the **Desktop apps** workflow by hand from the Actions tab).
3. `.github/workflows/desktop.yml` builds Windows, macOS (Apple silicon and Intel) and Linux installers and attaches them to a **draft** release. Check it and click **Publish**.

Pull requests that touch the desktop code also build the Linux app and run `tests/desktop/smoke.mjs`, which drives the real app and checks posters are created, renamed and deleted on disk.

### Where posters are stored

`src/lib/storage.ts` is the only module the UI uses. It picks a `PosterStore` (`src/lib/store/`): `browserStore` (IndexedDB) on the web, or `FolderStore` (one `.poster.json` per poster in Documents/PosterHub) in the desktop app. Desktop file access is limited to that folder and to files you pick in a Save dialog (`src-tauri/capabilities/default.json`).

The desktop window also enforces a Content Security Policy (`app.security.csp` in `src-tauri/tauri.conf.json`): only the app's own scripts run, and the only outside servers allowed are Google Fonts and the Fontsource CDN. Keep it in step with the web policy. `dangerousDisableAssetCspModification` is set for `style-src` because Tauri would otherwise add nonces there, which makes browsers ignore `'unsafe-inline'` and breaks the editor's inline styles.

The app is a static site (Vite + React + TypeScript). `vite.config.ts` uses relative asset paths so the same build works on GitHub Pages and inside a desktop wrapper (Tauri or Electron) later.

### Project layout

| Path | What lives there |
| --- | --- |
| `src/types.ts` | The poster document model (sizes in mm, fonts in pt) |
| `src/model.ts` | Size presets, palettes, element defaults |
| `src/templates.ts` | Starter templates: header, section, body and footer recipes |
| `src/lib/relayout.ts` | Switching layouts: moves existing content into the new layout |
| `src/lib/` | Storage, fonts, charts, exporters, PowerPoint import, undo history, in-app dialogs |
| `src/lib/store/` | Where the poster library lives: browser storage or a folder on disk |
| `src-tauri/` | Desktop app shell (Tauri): window, permissions, icons |
| `src/components/` | Library, editor, canvas, panels and dialogs |
| `tests/unit/` | Vitest unit tests |
| `tests/e2e/` | Playwright end-to-end tests |
| `tests/desktop/` | Smoke test that drives the real desktop app |

## Publishing on GitHub Pages

Pushing to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes the site. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once.

## Licences

The test font `tests/fixtures/Italiana-Regular.ttf` is under the SIL Open Font License (see `tests/fixtures/Italiana-OFL.txt`).
