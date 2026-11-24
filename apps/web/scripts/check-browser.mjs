import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import process from 'node:process';
import test from 'node:test';
import { URL } from 'node:url';
import { io } from 'socket.io-client';

const require = createRequire(import.meta.url);
const packageDir = process.env.PLAYWRIGHT_PACKAGE_DIR;
const { chromium } = packageDir
  ? require(require.resolve('playwright-core', { paths: [packageDir] }))
  : require('playwright-core');
const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const api = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';
const chrome = process.env.QA_CHROME_PATH;
const names = ['Hammad', 'Ali', 'Usman'];
const viewports = [
  { width: 1280, height: 680 },
  { width: 844, height: 390 },
  { width: 390, height: 844 },
];
const wait = { timeout: 12_000 };

function button(page, name) {
  return page.getByRole('button', { name, exact: true });
}

function dialog(page, name) {
  return page.getByRole('dialog', { name, exact: true });
}

function input(page) {
  return page.getByRole('textbox', { name: 'Your guess' });
}

async function ready(locator) {
  const control = await locator.elementHandle(wait);
  try {
    await locator
      .page()
      .waitForFunction((element) => !element.disabled, control, wait);
  } finally {
    await control.dispose();
  }
}

async function fixture(t, count = 3) {
  const browser = await chromium.launch(
    chrome ? { executablePath: chrome } : { channel: 'chrome' },
  );
  t.after(() => browser.close());
  const errors = [];
  const connections = Array(count).fill(0);
  const pages = [];
  for (const [i, viewport] of viewports.slice(0, count).entries()) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('websocket', (socket) => {
      if (socket.url().includes('/socket.io/')) connections[i]++;
    });
    pages.push(page);
  }
  const [host, ...guests] = pages;
  await host.goto(origin);
  await host.getByLabel('Nickname').fill(names[0]);
  await button(host, 'Create Room').click();
  await host.waitForURL('**/room/*', wait);
  const code = new URL(host.url()).pathname.split('/').at(-1);
  for (const [i, guest] of guests.entries()) {
    await guest.goto(origin);
    await button(guest, 'Join Room').click();
    const join = dialog(guest, 'Join Room');
    await join.getByLabel('Nickname').fill(names[i + 1]);
    const codeField = join.getByLabel('Room code');
    if (i === 0) {
      await codeField.fill('123');
      await button(join, 'Join Room').click();
      await guest
        .getByText('Enter a six-character room code.', { exact: true })
        .waitFor(wait);
    }
    await codeField.fill(code);
    await button(join, 'Join Room').click();
    await guest.waitForURL('**/room/' + code, wait);
  }
  for (const page of pages) {
    await page
      .getByRole('heading', { name: `Players (${count}/8)` })
      .waitFor(wait);
    for (const nickname of names.slice(0, count)) {
      await page
        .getByRole('listitem')
        .filter({ hasText: nickname })
        .waitFor(wait);
    }
  }
  assert.equal(await button(guests[0], 'Start Game').isDisabled(), true);
  const start = async () => {
    await button(host, 'Start Game').click();
    await Promise.all(
      pages.map((page) => page.waitForURL('**/game/' + code, wait)),
    );
  };
  return { pages, host, guests, code, errors, connections, start };
}

async function chooseWord(drawer, guessers) {
  const selection = dialog(drawer, 'Choose a Word');
  await selection.waitFor(wait);
  assert.equal(await selection.getByRole('button').count(), 3);
  for (const peer of guessers) {
    assert.equal(await dialog(peer, 'Choose a Word').count(), 0);
    assert.equal(await input(peer).isDisabled(), true);
  }
  const option = selection.getByRole('button').first();
  const word = (await option.textContent()).trim();
  await option.click();
  await Promise.all(guessers.map((page) => ready(input(page))));
  for (const peer of guessers) {
    const timer = peer.getByRole('region', { name: 'Word and turn timer' });
    assert.equal(await timer.getByText(word, { exact: true }).count(), 0);
  }
  return word;
}

async function drawLine(page, duringStroke) {
  const surface = page.getByRole('img', {
    name: 'Drawing canvas',
    exact: true,
  });
  await surface.waitFor(wait);
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  const y = box.y + box.height * 0.42;
  await page.mouse.move(box.x + box.width * 0.23, y);
  await page.mouse.down();
  try {
    if (duringStroke) await duringStroke();
    await page.mouse.move(box.x + box.width * 0.77, y, { steps: 6 });
  } finally {
    await page.mouse.up();
  }
}

function expectPixel(page, x, color, y = 0.42) {
  return page.waitForFunction(
    ({ x, color, y }) => {
      const canvas = globalThis.document.querySelector(
        '[aria-label$="drawing canvas" i] canvas',
      );
      if (!canvas) return false;
      const pixel = canvas
        .getContext('2d')
        .getImageData(
          Math.round(canvas.width * x),
          Math.round(canvas.height * y),
          1,
          1,
        ).data;
      return color === null
        ? pixel[3] === 0
        : color.every((value, i) => Math.abs(value - pixel[i]) <= 2);
    },
    { x, color, y },
    wait,
  );
}

async function submit(page, value, mouse = false) {
  await input(page).fill(value);
  const send = button(page, 'Send guess');
  if (mouse) await send.click();
  else {
    await ready(send);
    await input(page).press('Enter');
  }
}

test(
  'a full short-landscape lobby keeps primary actions visible',
  { timeout: 30_000 },
  async (t) => {
    const { host, code } = await fixture(t, 2);
    await host.setViewportSize(viewports[1]);
    await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const socket = io(api, {
          autoConnect: false,
          reconnection: false,
          transports: ['websocket'],
          extraHeaders: { Origin: origin },
        });
        t.after(() => socket.disconnect());
        const connected = once(socket, 'connect', {
          signal: globalThis.AbortSignal.timeout(5_000),
        });
        socket.connect();
        await connected;
        const joined = await socket
          .timeout(5_000)
          .emitWithAck('room:join', { code, nickname: `Extra ${i + 1}` });
        assert.equal(joined.ok, true, JSON.stringify(joined.error));
      }),
    );
    await host.getByRole('heading', { name: 'Players (8/8)' }).waitFor(wait);
    for (const name of ['Start Game', 'Leave Room']) {
      const bounds = await button(host, name).boundingBox();
      assert.ok(
        bounds &&
          bounds.y >= 0 &&
          bounds.y + bounds.height <= viewports[1].height,
        `${name} is outside the 844 × 390 viewport: ${JSON.stringify(bounds)}`,
      );
    }
    await host.getByRole('listitem').last().scrollIntoViewIfNeeded();
    assert.ok(
      await host.getByRole('list').evaluate((list) => list.scrollTop > 0),
    );
    assert.equal(await host.evaluate(() => globalThis.scrollY), 0);
    await host.evaluate(() => {
      globalThis.document.documentElement.style.fontSize = '125%';
    });
    const leave = button(host, 'Leave Room');
    await leave.scrollIntoViewIfNeeded();
    const enlarged = await leave.boundingBox();
    assert.ok(
      enlarged &&
        enlarged.y >= 0 &&
        enlarged.y + enlarged.height <= viewports[1].height,
    );
    assert.equal(
      await host.evaluate(
        () => globalThis.document.documentElement.scrollWidth,
      ),
      viewports[1].width,
    );
  },
);

test(
  'three browsers play two rounds, use every drawing tool, and replay from Results',
  { timeout: 110_000 },
  async (t) => {
    const { pages, host, code, errors, connections, start } = await fixture(t);
    const totals = new Map();
    await start();
    for (let turn = 0; turn < 6; turn++) {
      const drawer = pages[turn % 3];
      const guessers = pages.filter((page) => page !== drawer);
      const header = `Round ${Math.floor(turn / 3) + 1}/2 · Turn ${turn + 1}/6`;
      await drawer.getByText(header, { exact: true }).waitFor(wait);
      const word = await chooseWord(drawer, guessers);
      const [first, second] = guessers;
      if (turn === 0) {
        await button(drawer, 'Teal').click();
        const slider = drawer.getByRole('slider', { name: 'Brush size' });
        await slider.press('End');
        assert.equal(await slider.getAttribute('aria-valuenow'), '30');
        const teal = [113, 201, 206, 255];
        await drawLine(drawer, () => expectPixel(first, 0.23, teal));
        await Promise.all(guessers.map((page) => expectPixel(page, 0.5, teal)));
        await expectPixel(first, 0.5, teal, 0.435);
        await button(drawer, 'Eraser').click();
        await drawLine(drawer);
        await Promise.all(guessers.map((page) => expectPixel(page, 0.5, null)));
        await button(drawer, 'Pencil').click();
        await drawLine(drawer);
        await expectPixel(second, 0.5, teal);
        await button(drawer, 'Clear canvas').click();
        await Promise.all(pages.map((page) => expectPixel(page, 0.5, null)));
        await submit(first, 'A wrong answer');
        await second
          .getByRole('log')
          .getByText('A wrong answer', { exact: true })
          .waitFor(wait);
      }
      if (turn === 1) {
        assert.equal(
          await first
            .getByRole('log')
            .getByText('A wrong answer', { exact: true })
            .count(),
          0,
        );
        await expectPixel(first, 0.5, null);
      }

      await submit(first, word);
      await first
        .getByRole('region', { name: 'Guesses' })
        .getByRole('status')
        .filter({ hasText: 'Correct!' })
        .waitFor(wait);
      assert.equal(await input(first).isDisabled(), true);
      assert.equal(await second.getByText(/Correct! \+\d+ points/).count(), 0);
      await submit(second, word, true);
      for (const page of pages) {
        const summary = dialog(page, 'Round Complete');
        await summary.getByText(word, { exact: true }).waitFor(wait);
        assert.equal(await summary.getByRole('row').count(), 4);
      }
      const awards = await dialog(host, 'Round Complete')
        .locator('tbody tr')
        .evaluateAll((rows) =>
          rows.map((row) =>
            Array.from(row.children).map((cell) => cell.textContent),
          ),
        );
      for (const [nickname, earned, score] of awards) {
        assert.equal(
          Number(score),
          (totals.get(nickname) ?? 0) + Number(earned),
        );
        totals.set(nickname, Number(score));
      }
    }
    await Promise.all(
      pages.map((page) => page.waitForURL('**/results/' + code, wait)),
    );
    for (const page of pages) {
      const results = page.getByRole('table', { name: /Final scores/ });
      await results.getByText(names[0], { exact: true }).waitFor(wait);
      const rows = await results
        .locator('tbody tr')
        .evaluateAll((rows) =>
          rows.map((row) =>
            Array.from(row.children).map((cell) => cell.textContent),
          ),
        );
      assert.equal(rows.length, 3);
      const best = Math.max(...totals.values());
      for (const [index, [rank, nickname, score]] of rows.entries()) {
        assert.equal(Number(score), totals.get(nickname));
        assert.equal(rank === '1', Number(score) === best);
        if (index > 0) assert.ok(Number(rows[index - 1][2]) >= Number(score));
      }
      const fitted = await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth ===
            globalThis.innerWidth &&
          globalThis.document.documentElement.scrollHeight ===
            globalThis.innerHeight,
      );
      assert.equal(fitted, true);
    }
    assert.equal(
      await button(pages[1], 'Waiting for host to restart…').isDisabled(),
      true,
    );
    await button(host, 'Play Again').click();
    await Promise.all(
      pages.map((page) => page.waitForURL('**/room/' + code, wait)),
    );
    for (const page of pages)
      await page.getByRole('heading', { name: 'Players (3/8)' }).waitFor(wait);
    await start();
    await pages[1]
      .getByRole('region', { name: 'Players' })
      .getByLabel('0 points')
      .first()
      .waitFor(wait);
    assert.equal(await pages[1].getByLabel('0 points').count(), 3);
    assert.deepEqual(connections, [1, 1, 1]);
    assert.deepEqual(errors, []);
  },
);

test(
  'selection refresh keeps choices private and the drawer restores canvas and deadline',
  { timeout: 55_000 },
  async (t) => {
    const { host, guests, errors, start } = await fixture(t, 2);
    const [guest] = guests;
    await start();
    const menu = dialog(host, 'Choose a Word');
    await menu.waitFor(wait);
    const options = await menu.getByRole('button').allTextContents();
    await Promise.all([host.reload(), guest.reload()]);
    await menu.getByRole('button').first().waitFor(wait);
    assert.deepEqual(await menu.getByRole('button').allTextContents(), options);
    const word = await chooseWord(host, guests);
    const ink = [18, 76, 83, 255];
    await drawLine(host);
    await expectPixel(guest, 0.5, ink);
    const timerLabel = host.getByRole('timer');
    await host.waitForFunction(
      () =>
        Number(
          globalThis.document
            .querySelector('[role="timer"]')
            .getAttribute('aria-label')
            .split(' ')[0],
        ) < 60,
      undefined,
      wait,
    );
    const secondsBefore = Number(
      (await timerLabel.getAttribute('aria-label')).split(' ')[0],
    );
    await host.reload();
    await host
      .getByRole('img', { name: 'Drawing canvas', exact: true })
      .waitFor(wait);
    await expectPixel(host, 0.5, ink);
    const secondsAfter = Number(
      (await timerLabel.getAttribute('aria-label')).split(' ')[0],
    );
    assert.ok(secondsAfter <= secondsBefore && secondsAfter > 0);
    await host
      .getByRole('region', { name: 'Word and turn timer' })
      .getByText(word, { exact: true })
      .waitFor(wait);
    assert.deepEqual(errors, []);
  },
);
