import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

const WORKSPACE = path.resolve('.');
const DIST_DIR = path.join(WORKSPACE, 'dist');
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE_DIR = path.join(WORKSPACE, 'node_modules/.cache/e2e-chrome');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || '/').split('?')[0];
      let relPath = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
      let filePath = path.join(DIST_DIR, relPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

async function launchChrome(port = 9231) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const proc = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
    ],
    { stdio: 'ignore' }
  );
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) {
        return { proc, cdp: new CDPClient(page.webSocketDebuggerUrl) };
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  proc.kill();
  throw new Error('Chrome failed to start');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evalJs(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res.result?.value;
}

async function main() {
  const { server, port } = await startStaticServer();
  const { proc, cdp } = await launchChrome(9231);

  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 412,
      height: 892,
      deviceScaleFactor: 2,
      mobile: true,
    });

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
    await sleep(120);

    // 1. Verify loading screen appears initially
    const loaderSeen = await evalJs(cdp, `Boolean(document.getElementById('app-loader'))`);
    assert.equal(loaderSeen, true, 'Boot loader #app-loader should be present on initial paint');

    // Wait for loader dismissal & menu hydration
    for (let i = 0; i < 30; i++) {
      const playExists = await evalJs(cdp, `Boolean(document.getElementById('play-btn'))`);
      const loaderGone = await evalJs(cdp, `!document.getElementById('app-loader')`);
      if (playExists && loaderGone) break;
      await sleep(150);
    }

    // 2. Verify Dark Theme is default & colors are genuinely dark
    const themeState = await evalJs(
      cdp,
      `(() => {
        const card = document.querySelector('.card');
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const cardBg = card ? getComputedStyle(card).backgroundColor : '';
        return {
          theme: document.documentElement.dataset.theme,
          bodyBg,
          cardBg,
          hasPlay: Boolean(document.getElementById('play-btn')),
          hasDaily: Boolean(document.getElementById('claim-daily-btn')),
        };
      })()`
    );
    assert.equal(themeState.theme, 'dark');
    assert.equal(themeState.bodyBg, 'rgb(9, 14, 30)');
    assert.equal(themeState.cardBg, 'rgb(20, 30, 59)');
    assert.equal(themeState.hasPlay, true);
    assert.equal(themeState.hasDaily, true);

    // 3. Claim Daily Bonus & verify Goal Pill appears
    await evalJs(cdp, `document.getElementById('claim-daily-btn').click()`);
    await sleep(100);
    const goalVisible = await evalJs(cdp, `Boolean(document.querySelector('.goal-pill'))`);
    assert.equal(goalVisible, true, 'Goal gradient pill should render after claiming daily bonus');

    // 4. Verify Light Theme toggle & persistence across reload, then restore Dark Theme
    await evalJs(cdp, `document.getElementById('menu-theme-btn').click()`);
    await sleep(100);
    assert.equal(await evalJs(cdp, `document.documentElement.dataset.theme`), 'light');
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(900);
    assert.equal(await evalJs(cdp, `document.documentElement.dataset.theme`), 'light');
    await evalJs(cdp, `document.getElementById('menu-theme-btn').click()`);
    await sleep(100);
    assert.equal(await evalJs(cdp, `document.documentElement.dataset.theme`), 'dark');

    // 5. Verify gameplay flow: Play -> HUD -> Pause -> Resume -> Menu
    await evalJs(cdp, `document.getElementById('play-btn').click()`);
    await sleep(250);
    assert.equal(await evalJs(cdp, `Boolean(document.getElementById('hud-score'))`), true);
    await evalJs(cdp, `document.getElementById('hud-pause-btn').click()`);
    await sleep(150);
    assert.equal(await evalJs(cdp, `Boolean(document.getElementById('resume-btn'))`), true);
    await evalJs(cdp, `document.getElementById('pause-menu-btn').click()`);
    await sleep(150);
    assert.equal(await evalJs(cdp, `Boolean(document.getElementById('play-btn'))`), true);

    // 6. Verify Desktop (1280x800) fresh session defaults to Light theme & topbar toggle works
    await evalJs(cdp, `localStorage.clear()`);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(950);
    const desktopState = await evalJs(
      cdp,
      `(() => ({
        theme: document.documentElement.dataset.theme,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        topBtnText: document.getElementById('desktop-theme-btn')?.textContent?.trim(),
        cardBg: getComputedStyle(document.querySelector('.card')).backgroundColor,
      }))()`
    );
    assert.equal(desktopState.theme, 'light');
    assert.equal(desktopState.bodyBg, 'rgb(246, 243, 234)');
    assert.equal(desktopState.cardBg, 'rgb(255, 253, 248)');
    assert.equal(desktopState.topBtnText, 'Dark');

    await evalJs(cdp, `document.getElementById('desktop-theme-btn').click()`);
    await sleep(100);
    assert.equal(await evalJs(cdp, `document.documentElement.dataset.theme`), 'dark');
    assert.equal(
      await evalJs(cdp, `document.getElementById('desktop-theme-btn').textContent.trim()`),
      'Light'
    );

    // 7. Verify no uncaught runtime exceptions occurred
    const exceptions = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown');
    assert.equal(exceptions.length, 0, `Unexpected runtime exceptions: ${JSON.stringify(exceptions)}`);

    console.log('E2E UI, loading screen, mobile dark + desktop light theme, and gameplay flow checks passed!');
  } finally {
    cdp.close();
    proc.kill();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
