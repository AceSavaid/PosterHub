// Smoke test for the real desktop app (Linux). Drives the built binary over
// WebDriver through WebKitWebDriver, the same way tauri-driver does, and
// checks posters really land in ~/Documents/PosterHub on disk.
//
// Usage (see .github/workflows/desktop.yml):
//   TAURI_WEBVIEW_AUTOMATION=true HOME=<tmp> xvfb-run WebKitWebDriver --port=4445 &
//   HOME=<tmp> node tests/desktop/smoke.mjs src-tauri/target/release/posterhub
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const binary = path.resolve(process.argv[2] ?? 'src-tauri/target/release/posterhub');
const folder = path.join(os.homedir(), 'Documents', 'PosterHub');
const base = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4445';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, url, body) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json();
  if (j.value?.error) throw new Error(`${url}: ${j.value.error} ${j.value.message}`);
  return j.value;
}

async function launch() {
  const { sessionId } = await req('POST', '/session', { capabilities: { alwaysMatch: { 'webkitgtk:browserOptions': { binary, args: [] } } } });
  const run = (code) =>
    req('POST', `/session/${sessionId}/execute/async`, {
      script: `const done = arguments[0]; (async () => { ${code} })().then(done, (e) => done('ERROR ' + e));`,
      args: [],
    });
  const until = async (what, code, ms = 15000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (await run(code)) return;
    throw new Error('Timed out waiting for ' + what);
  };
  const click = (text, scope = 'document') =>
    run(`const b = [...${scope}.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('no button ${text}'); b.click();`);
  return { run, until, click, quit: () => req('DELETE', `/session/${sessionId}`) };
}

const files = () => (fs.existsSync(folder) ? fs.readdirSync(folder).sort() : []);
// React tracks input values itself, so set them through the native setter.
const typeInto = (selector, value) => `const i = document.querySelector(${JSON.stringify(selector)});
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)});
  i.dispatchEvent(new Event('input', { bubbles: true }));`;

let app = await launch();
try {
  await app.until('the library', `return document.body.innerText.includes('My posters')`);
  assert.equal(await app.run(`return '__TAURI_INTERNALS__' in window`), true, 'runs inside the desktop shell');
  assert.match(await app.run(`return document.querySelector('.lib-location')?.textContent ?? ''`), /Saved as files in .*PosterHub/);

  // New poster -> file on disk.
  await app.click('+ New poster');
  await app.until('the new poster dialog', `return !!document.querySelector('.modal')`);
  await app.run(typeInto('.modal input', 'Smoke test poster'));
  await app.click('Create poster');
  await app.until('the editor', `return !!document.querySelector('.poster')`);
  for (let i = 0; i < 40 && !files().includes('Smoke-test-poster.poster.json'); i++) await sleep(250);
  assert.deepEqual(files(), ['Smoke-test-poster.poster.json']);
  const saved = JSON.parse(fs.readFileSync(path.join(folder, 'Smoke-test-poster.poster.json'), 'utf8'));
  assert.equal(saved.app, 'posterhub');
  assert.equal(saved.name, 'Smoke test poster');
  await app.quit();

  // Restart: the poster is found on disk; rename and delete change the files.
  app = await launch();
  await app.until('the saved poster', `return document.body.innerText.includes('Smoke test poster')`);
  await app.click('Rename', `document.querySelector('.poster-card')`);
  await app.until('the rename dialog', `return !!document.querySelector('.app-dialog input')`);
  await app.run(typeInto('.app-dialog input', 'Renamed poster'));
  await app.click('Rename', `document.querySelector('.app-dialog')`);
  for (let i = 0; i < 40 && !files().includes('Renamed-poster.poster.json'); i++) await sleep(250);
  assert.deepEqual(files(), ['Renamed-poster.poster.json']);

  await app.click('Delete', `document.querySelector('.poster-card')`);
  await app.until('the delete dialog', `return !!document.querySelector('.app-dialog')`);
  await app.click('Delete', `document.querySelector('.app-dialog')`);
  for (let i = 0; i < 40 && files().length; i++) await sleep(250);
  assert.deepEqual(files(), []);
  console.log('Desktop smoke test passed');
} finally {
  await app.quit().catch(() => {});
}
