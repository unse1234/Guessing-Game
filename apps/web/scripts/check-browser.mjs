import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import process from 'node:process';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
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
const deviceViewports = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
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

async function fixture(t, count = 3, mobile = false) {
  const browser = await chromium.launch(
    chrome ? { executablePath: chrome } : { channel: 'chrome' },
  );
  t.after(() => browser.close());
  const errors = [];
  const connections = Array(count).fill(0);
  const pages = [];
  for (const [i, viewport] of viewports.slice(0, count).entries()) {
    const context = await browser.newContext(
      mobile
        ? {
            viewport: deviceViewports[0],
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 2,
          }
        : { viewport },
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('websocket', (socket) => {
      if (socket.url().includes('/socket.io/')) connections[i]++;
    });
    pages.push(page);
  }
  const [host, ...guests] = pages;
  const nicknames = mobile ? [names[0], '<b>Ali</b>'] : names;
  const response = await host.goto(origin);
  if (mobile) {
    const headers = response.headers();
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
    await checkViewports(host, button(host, 'Create Room'));
  }
  await host.getByLabel('Nickname').fill(names[0]);
  await button(host, 'Create Room').click();
  await host.waitForURL('**/room/*', wait);
  const code = new URL(host.url()).pathname.split('/').at(-1);
  for (const [i, guest] of guests.entries()) {
    await guest.goto(origin);
    await button(guest, 'Join Room').click();
    const join = dialog(guest, 'Join Room');
    await join.getByLabel('Nickname').fill(nicknames[i + 1]);
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
    for (const nickname of nicknames.slice(0, count)) {
      await page
        .getByRole('listitem')
        .filter({ hasText: nickname })
        .waitFor(wait);
    }
    if (mobile) assert.equal(await page.locator('li b').count(), 0);
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

async function checkViewports(page, control) {
  for (const viewport of deviceViewports) {
    await page.setViewportSize(viewport);
    await control.waitFor(wait);
    const { width, content } = await page.evaluate(() => ({
      width: globalThis.innerWidth,
      content: globalThis.document.documentElement.scrollWidth,
    }));
    assert.equal(width, viewport.width);
    assert.ok(
      content <= width,
      `Horizontal overflow at ${viewport.width}px: ${content}px`,
    );
  }
  await page.setViewportSize(deviceViewports[0]);
}

async function touchLine(page, session, yFraction, finish = 'touchEnd') {
  const surface = page.getByRole('img', {
    name: 'Drawing canvas',
    exact: true,
  });
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  const scroll = await page.evaluate(() => globalThis.scrollY);
  const send = (type, touchPoints) =>
    session.send('Input.dispatchTouchEvent', { type, touchPoints });
  const y = box.y + box.height * yFraction;
  await send('touchStart', [{ x: box.x + box.width * 0.2, y }]);
  for (const fraction of [0.35, 0.5, 0.65, 0.8]) {
    await delay(25);
    await send('touchMove', [{ x: box.x + box.width * fraction, y }]);
  }
  // Let the finger come to rest before lifting so Chromium does not infer a fling.
  if (finish === 'touchEnd') await delay(120);
  await send(finish, []);
  assert.equal(await page.evaluate(() => globalThis.scrollY), scroll);
}

test(
  'mobile sessions cover every screen, touch cancellation, and a shortened keyboard viewport',
  { timeout: 95_000 },
  async (t) => {
    const { host, guests, code, start, errors } = await fixture(t, 2, true);
    const [guest] = guests;
    await checkViewports(host, button(host, 'Start Game'));
    await start();
    const word = await chooseWord(host, guests);
    await checkViewports(
      host,
      host.getByRole('img', { name: 'Drawing canvas', exact: true }),
    );
    await checkViewports(guest, guest.getByRole('timer'));

    const purple = button(host, 'Purple');
    const ink = [147, 51, 234, 255];
    assert.equal(
      await host
        .getByRole('group', { name: 'Colors' })
        .getByRole('button')
        .count(),
      12,
    );
    const size = await purple.boundingBox();
    assert.ok(
      size && size.width >= 44 && size.height >= 44,
      'Touch color swatches need a 44px target',
    );
    const hostCDP = await host.context().newCDPSession(host);
    await purple.tap();
    await host
      .getByRole('button', { name: 'Purple', pressed: true })
      .waitFor(wait);
    await touchLine(host, hostCDP, 0.42, 'touchCancel');
    await expectPixel(guest, 0.5, ink);
    await button(host, 'Eraser').tap();
    await host
      .getByRole('button', { name: 'Eraser', pressed: true })
      .waitFor(wait);
    const slider = host.getByRole('slider', { name: 'Brush size' });
    const brushTrack = host.locator('[data-slot="slider"]');
    await brushTrack.scrollIntoViewIfNeeded();
    const track = await brushTrack.boundingBox();
    const previousSize = await slider.getAttribute('aria-valuenow');
    await host.touchscreen.tap(
      track.x + track.width * 0.85,
      track.y + track.height / 2,
    );
    assert.notEqual(await slider.getAttribute('aria-valuenow'), previousSize);
    await touchLine(host, hostCDP, 0.42);
    await expectPixel(guest, 0.5, null);
    await button(host, 'Pencil').tap();
    await host
      .getByRole('button', { name: 'Pencil', pressed: true })
      .waitFor(wait);
    await touchLine(host, hostCDP, 0.62);
    await expectPixel(guest, 0.5, ink, 0.62);
    await host.setViewportSize(deviceViewports[1]);
    await expectPixel(host, 0.5, ink, 0.62);
    await button(host, 'Clear canvas').tap();
    await expectPixel(guest, 0.5, null, 0.62);

    await input(guest).tap();
    await guest.setViewportSize({ width: 375, height: 340 });
    await guest.waitForFunction(
      () => {
        const field = globalThis.document.getElementById('game-guess');
        const form = field?.form?.getBoundingClientRect();
        const viewport = globalThis.visualViewport;
        return (
          field === globalThis.document.activeElement &&
          form &&
          viewport &&
          form.top >= viewport.offsetTop - 1 &&
          form.bottom <= viewport.offsetTop + viewport.height + 1
        );
      },
      undefined,
      wait,
    );
    const literalGuess = '<b>Some text</b>';
    await submit(guest, literalGuess, true);
    const chat = guest.getByRole('log');
    await chat.getByText(literalGuess, { exact: true }).waitFor(wait);
    assert.equal(await chat.locator('b').count(), 0);
    for (const repetitions of [3, 4]) {
      const message = 'Please try again. '.repeat(repetitions).trim();
      await submit(guest, message, true);
      await chat.getByText(message, { exact: true }).waitFor(wait);
    }
    assert.ok(
      await chat.evaluate(
        (log) => log.scrollHeight > log.clientHeight && log.scrollTop > 0,
      ),
      'Chat should scroll and follow recent messages',
    );
    await chat.evaluate((log) => {
      log.scrollTop = 0;
    });
    assert.equal(await chat.evaluate((log) => log.scrollTop), 0);
    await guest.setViewportSize(deviceViewports[0]);
    await guest
      .getByRole('region', { name: 'Players' })
      .scrollIntoViewIfNeeded();
    await submit(guest, word, true);
    await dialog(host, 'Turn Complete').waitFor(wait);
    for (let turn = 1; turn < 4; turn++) {
      const [drawer, guesser] = turn % 2 ? [guest, host] : [host, guest];
      const choices = dialog(drawer, 'Choose a Word');
      await choices.waitFor(wait);
      const box = await choices.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= 667);
      await choices.getByRole('timer').waitFor(wait);
      await submit(guesser, await chooseWord(drawer, [guesser]), true);
      if (turn < 3) await dialog(drawer, 'Turn Complete').waitFor(wait);
    }
    await host.waitForURL('**/results/' + code, wait);
    await guest.waitForURL('**/results/' + code, wait);
    await checkViewports(host, button(host, 'Play Again'));
    assert.deepEqual(errors, []);
  },
);

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
        await button(drawer, 'Red').click();
        const slider = drawer.getByRole('slider', { name: 'Brush size' });
        await slider.press('End');
        assert.equal(await slider.getAttribute('aria-valuenow'), '30');
        const red = [220, 38, 38, 255];
        await drawLine(drawer, () => expectPixel(first, 0.23, red));
        await Promise.all(guessers.map((page) => expectPixel(page, 0.5, red)));
        await expectPixel(first, 0.5, red, 0.435);
        await button(drawer, 'Eraser').click();
        await drawLine(drawer);
        await Promise.all(guessers.map((page) => expectPixel(page, 0.5, null)));
        await button(drawer, 'Blue').click();
        assert.equal(
          await button(drawer, 'Pencil').getAttribute('aria-pressed'),
          'true',
        );
        await drawLine(drawer);
        await expectPixel(second, 0.5, [37, 99, 235, 255]);
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
      if (turn === 5) {
        await submit(second, word, true);
        break;
      }
      await Promise.all([
        ...pages.map(async (page) => {
          const summary = dialog(page, 'Turn Complete');
          assert.equal(await summary.locator('strong').textContent(wait), word);
          assert.equal(await summary.getByRole('row').count(), 4);
        }),
        submit(second, word, true),
      ]);
      const awards = await dialog(host, 'Turn Complete')
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
      pages.map(async (page) => {
        const destination = await Promise.race([
          page.waitForURL('**/results/' + code, wait).then(() => 'results'),
          dialog(page, 'Turn Complete')
            .waitFor(wait)
            .then(() => 'summary'),
        ]);
        assert.equal(destination, 'results');
      }),
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
      const best = Math.max(...rows.map(([, , score]) => Number(score)));
      for (const [index, [rank, nickname, score]] of rows.entries()) {
        const earned = Number(score) - totals.get(nickname);
        if (nickname === names[2]) assert.equal(earned, 100);
        else assert.ok(earned >= 100 && earned <= 400 && earned % 5 === 0);
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
    const ink = [32, 32, 32, 255];
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
