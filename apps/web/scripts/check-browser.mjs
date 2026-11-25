import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import process from 'node:process';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import { io } from 'socket.io-client';

const require = createRequire(import.meta.url);
const packageDir = process.env.PLAYWRIGHT_PACKAGE_DIR;
const { chromium, firefox } = packageDir
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

async function fixture(
  t,
  count = 3,
  mobile = false,
  { browserType = chromium, initScript, beforeGuests } = {},
) {
  const browser = await browserType.launch(
    browserType === chromium
      ? chrome
        ? { executablePath: chrome }
        : { channel: 'chrome' }
      : {},
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
    if (initScript) await context.addInitScript(initScript);
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
  await beforeGuests?.(host);
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

async function drawLine(
  page,
  duringStroke,
  from = [0.23, 0.42],
  to = [0.77, 0.42],
) {
  const surface = page.getByRole('img', {
    name: 'Drawing canvas',
    exact: true,
  });
  await surface.waitFor(wait);
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  await page.mouse.move(
    box.x + box.width * from[0],
    box.y + box.height * from[1],
  );
  await page.mouse.down();
  try {
    if (duringStroke) await duringStroke();
    await page.mouse.move(
      box.x + box.width * to[0],
      box.y + box.height * to[1],
      { steps: 6 },
    );
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

function recordGameAudio() {
  const NativeAudioContext = globalThis.AudioContext;
  const probe = { contexts: [], cues: [] };
  globalThis.gameAudioProbe = probe;
  globalThis.AudioContext = class extends NativeAudioContext {
    constructor(...args) {
      super(...args);
      probe.contexts.push(this);
    }

    createOscillator() {
      const source = super.createOscillator();
      const cue = { notes: [] };
      const schedulePitch = source.frequency.setValueAtTime.bind(
        source.frequency,
      );
      const start = source.start.bind(source);
      const stop = source.stop.bind(source);
      source.frequency.setValueAtTime = (pitch, time) => {
        cue.notes.push(pitch);
        return schedulePitch(pitch, time);
      };
      source.start = (time) => {
        cue.start = time;
        probe.cues.push(cue);
        return start(time);
      };
      source.stop = (time = this.currentTime) => {
        cue.end = time;
        return stop(time);
      };
      return source;
    }
  };
}

const cueNotes = {
  join: [659, 784],
  start: [392, 523, 659],
  turn: [587, 698],
  wrong: [294],
  correct: [523, 659, 880],
  finish: [523, 659, 784, 1047],
};

async function expectSounds(page, expected) {
  await page.waitForFunction(
    (count) => globalThis.gameAudioProbe.cues.length >= count,
    expected.length,
    wait,
  );
  const actual = await page.evaluate(() =>
    globalThis.gameAudioProbe.cues.map(({ notes }) => notes),
  );
  assert.deepEqual(
    actual,
    expected.map((cue) => cueNotes[cue]),
  );
}

function waitForAudio(page) {
  return page.waitForFunction(
    () => globalThis.gameAudioProbe.contexts[0]?.state === 'running',
    undefined,
    wait,
  );
}

function waitForSilence(page) {
  return page.waitForFunction(
    () => {
      const { cues, contexts } = globalThis.gameAudioProbe;
      return contexts[0].currentTime > cues.at(-1).end + 0.13;
    },
    undefined,
    wait,
  );
}

test(
  'game sounds follow live events, respect mute and survive page navigation',
  { timeout: 80_000 },
  async (t) => {
    const variant = process.env.QA_SOUND_BROWSER;
    const mobile = variant === 'mobile';
    const toggle = (page) => button(page, 'Game sounds');
    const audioContexts = (page) =>
      page.evaluate(() => globalThis.gameAudioProbe.contexts.length);
    const clickToggle = (page) =>
      mobile ? toggle(page).tap() : toggle(page).click();
    const { host, guests, pages, errors, start } = await fixture(t, 2, mobile, {
      browserType: variant === 'firefox' ? firefox : chromium,
      initScript: recordGameAudio,
      beforeGuests: async (page) => {
        assert.equal(await toggle(page).getAttribute('aria-pressed'), 'false');
        assert.equal(await audioContexts(page), 0);
        if (mobile) await clickToggle(page);
        else await toggle(page).press('Space');
        await waitForAudio(page);
        assert.equal(await toggle(page).getAttribute('aria-pressed'), 'true');
      },
    });
    const [guest] = guests;
    await expectSounds(host, ['join']);
    await expectSounds(guest, []);
    assert.equal(await audioContexts(guest), 0);
    await clickToggle(guest);
    await waitForAudio(guest);

    await checkViewports(host, toggle(host));
    await host.setViewportSize(viewports[1]);
    await host.evaluate(() => {
      globalThis.document.documentElement.style.fontSize = '125%';
    });
    await toggle(host).scrollIntoViewIfNeeded();
    assert.equal(
      await host.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      true,
    );
    await host.evaluate(() => {
      globalThis.document.documentElement.style.fontSize = '';
    });
    await host.setViewportSize(mobile ? deviceViewports[0] : viewports[0]);
    await waitForSilence(host);
    await start();
    await expectSounds(host, ['join', 'start']);
    await expectSounds(guest, ['start']);
    await Promise.all(pages.map(waitForSilence));
    const firstWord = await chooseWord(host, guests);
    await expectSounds(host, ['join', 'start', 'turn']);
    await expectSounds(guest, ['start', 'turn']);
    await Promise.all(pages.map(waitForSilence));
    await submit(guest, 'A deliberately incorrect answer', true);
    await expectSounds(guest, ['start', 'turn', 'wrong']);
    await expectSounds(host, ['join', 'start', 'turn']);
    await submit(guest, firstWord, true);
    await expectSounds(guest, ['start', 'turn', 'wrong', 'correct']);
    await expectSounds(host, ['join', 'start', 'turn', 'correct']);

    await dialog(guest, 'Choose a Word').waitFor(wait);
    await clickToggle(host);
    const secondWord = await chooseWord(guest, [host]);
    await expectSounds(guest, ['start', 'turn', 'wrong', 'correct', 'turn']);
    await submit(host, secondWord, true);
    await expectSounds(guest, [
      'start',
      'turn',
      'wrong',
      'correct',
      'turn',
      'correct',
    ]);
    await expectSounds(host, ['join', 'start', 'turn', 'correct']);
    assert.equal(await audioContexts(host), 1);

    await host.reload();
    const thirdWord = await chooseWord(host, guests);
    assert.equal(await toggle(host).getAttribute('aria-pressed'), 'false');
    assert.equal(await audioContexts(host), 0);
    await clickToggle(host);
    await waitForAudio(host);
    await submit(guest, thirdWord, true);
    await expectSounds(host, ['correct']);
    const fourthWord = await chooseWord(guest, [host]);
    await expectSounds(host, ['correct', 'turn']);
    await submit(host, fourthWord, true);
    await Promise.all(
      pages.map((page) => page.waitForURL('**/results/*', wait)),
    );
    await expectSounds(host, ['correct', 'turn', 'finish']);
    await expectSounds(guest, [
      'start',
      'turn',
      'wrong',
      'correct',
      'turn',
      'correct',
      'turn',
      'correct',
      'turn',
      'finish',
    ]);
    for (const page of pages) {
      assert.equal(await audioContexts(page), 1);
      assert.equal(
        await page.evaluate(() =>
          globalThis.gameAudioProbe.cues.every(
            (cue, index, cues) =>
              index === 0 || cues[index - 1].end <= cue.start,
          ),
        ),
        true,
      );
    }

    await host.reload();
    await host.waitForFunction(
      () =>
        globalThis.document
          .querySelector('[aria-label="Game sounds"]')
          .getAttribute('aria-pressed') === 'true',
      undefined,
      wait,
    );
    assert.equal(await audioContexts(host), 0);
    await expectSounds(host, []);
    await ready(button(host, 'Play Again'));
    const heading = host.getByRole('heading').first();
    if (mobile) await heading.tap();
    else await heading.click();
    await waitForAudio(host);
    await expectSounds(host, []);
    await button(host, 'Back to Home').click();
    await host.waitForURL(new URL('/', origin).href, wait);
    await host.waitForFunction(
      () => globalThis.gameAudioProbe.contexts[0]?.state === 'closed',
      undefined,
      wait,
    );
    assert.deepEqual(errors, []);
  },
);

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

    const colors = host.getByRole('group', { name: 'Colors' });
    const quickColor = button(colors, 'Mint');
    const wheelButton = button(colors, 'Color wheel');
    await ready(wheelButton);
    const palette = [
      'Black',
      'Off-white',
      'Coral',
      'Gold',
      'Mint',
      'Cobalt',
      'Color wheel',
    ];
    assert.equal(await colors.getByRole('button').count(), palette.length);
    for (const label of palette) await button(colors, label).waitFor(wait);
    assert.equal(await button(guest, 'Color wheel').count(), 0);
    for (const viewport of [
      { width: 375, height: 540 },
      { width: 320, height: 568 },
      viewports[1],
      deviceViewports[0],
    ]) {
      await host.setViewportSize(viewport);
      await host.evaluate(() => globalThis.scrollTo(0, 0));
      const bounds = await colors.boundingBox();
      assert.ok(
        bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height,
        `The drawer's palette should be visible at ${viewport.width} × ${viewport.height}`,
      );
    }
    for (const control of [quickColor, wheelButton]) {
      const size = await control.boundingBox();
      assert.ok(
        size && size.width >= 44 && size.height >= 44,
        'Touch color controls need a 44px target',
      );
    }
    const hostCDP = await host.context().newCDPSession(host);
    await quickColor.tap();
    await colors
      .getByRole('button', { name: 'Mint', pressed: true })
      .waitFor(wait);
    await touchLine(host, hostCDP, 0.42, 'touchCancel');
    await expectPixel(guest, 0.5, [16, 185, 129, 255]);
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

    await wheelButton.tap();
    const picker = dialog(host, 'Color wheel');
    const applyColor = button(picker, 'Use color');
    await picker.getByText('#10B981', { exact: true }).waitFor(wait);
    await host.setViewportSize(viewports[1]);
    const pickerBounds = await picker.boundingBox();
    assert.ok(
      pickerBounds &&
        pickerBounds.y >= 0 &&
        pickerBounds.y + pickerBounds.height <= viewports[1].height,
    );
    await host.setViewportSize(deviceViewports[0]);
    const wheel = picker.locator('[data-slot="drawing-color-wheel"]');
    assert.match(
      await wheel.evaluate(
        (control) => globalThis.getComputedStyle(control).backgroundImage,
      ),
      /conic-gradient/,
    );
    const wheelBounds = await wheel.boundingBox();
    assert.ok(wheelBounds);
    await wheel.tap({
      position: { x: wheelBounds.width / 2, y: wheelBounds.height / 6 },
    });
    const hue = Number(
      await picker
        .getByRole('slider', { name: 'Hue' })
        .getAttribute('aria-valuenow'),
    );
    assert.ok(
      hue > 250 && hue < 290,
      `Expected an upper-wheel hue, received ${hue}`,
    );
    const brightness = picker.getByRole('slider', { name: 'Brightness' });
    await brightness.press('Home');
    await picker.getByText('#000000', { exact: true }).waitFor(wait);
    await brightness.press('End');
    const hex = await picker
      .locator('[data-slot="drawing-color-preview"]')
      .textContent();
    assert.match(hex, /^#[\dA-F]{6}$/);
    assert.notEqual(hex, '#000000');
    const ink = [
      ...[1, 3, 5].map((offset) =>
        Number.parseInt(hex.slice(offset, offset + 2), 16),
      ),
      255,
    ];
    await applyColor.tap();
    await picker.waitFor({ ...wait, state: 'hidden' });
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
  'undo restores erased pixels and stays in sync across browser sessions and refresh',
  { timeout: 65_000 },
  async (t) => {
    const { host, guests, errors, start } = await fixture(t, 2);
    const [guest] = guests;
    await guest.setViewportSize(deviceViewports[2]);
    await start();
    const word = await chooseWord(host, guests);
    const undo = button(host, 'Undo last stroke');
    const guestUndo = button(guest, 'Undo last stroke');
    const pencil = button(host, 'Pencil');
    const eraser = button(host, 'Eraser');
    await ready(pencil);
    assert.equal(await undo.isDisabled(), true);
    assert.equal(await guestUndo.isDisabled(), true);

    await checkViewports(host, undo);
    await host.setViewportSize(viewports[1]);
    await host.evaluate(() => {
      globalThis.document.documentElement.style.fontSize = '125%';
    });
    await undo.scrollIntoViewIfNeeded();
    assert.equal(await undo.isVisible(), true);
    assert.equal(
      await host.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth,
      ),
      true,
    );
    await host.evaluate(() => {
      globalThis.document.documentElement.style.fontSize = '';
    });
    await host.setViewportSize(viewports[0]);

    const coral = [244, 63, 94, 255];
    await button(host, 'Coral').click();
    await host.getByRole('slider', { name: 'Brush size' }).press('End');
    const surface = host.getByRole('img', {
      name: 'Drawing canvas',
      exact: true,
    });
    await surface.scrollIntoViewIfNeeded();
    const box = await surface.boundingBox();
    // Keep the first replay cached and cross below the cache threshold on the next undo.
    for (let i = 0; i < 15; i++) {
      await host.mouse.click(
        box.x + box.width * 0.15,
        box.y + box.height * 0.2,
      );
      await ready(undo);
    }
    await drawLine(host);
    await expectPixel(guest, 0.5, coral);
    await ready(undo);
    await eraser.click();
    await drawLine(host, async () => {
      assert.equal(await undo.isDisabled(), true);
    });
    await Promise.all(
      [host, guest].map((page) => expectPixel(page, 0.5, null)),
    );
    await ready(undo);
    assert.equal(await guestUndo.isDisabled(), true);

    await eraser.focus();
    await host.keyboard.press('Tab');
    assert.equal(
      await undo.evaluate((control) => control.matches(':focus-visible')),
      true,
    );
    await host.getByRole('tooltip', { name: 'Undo last stroke' }).waitFor(wait);
    await host.keyboard.press('Enter');
    await Promise.all(
      [host, guest].map((page) => expectPixel(page, 0.5, coral)),
    );
    await host.reload();
    await expectPixel(host, 0.5, coral);
    await undo.click();
    await Promise.all(
      [host, guest].map((page) => expectPixel(page, 0.5, null)),
    );
    await expectPixel(guest, 0.15, coral, 0.2);

    await button(host, 'Clear canvas').click();
    await Promise.all(
      [host, guest].map((page) => expectPixel(page, 0.15, null, 0.2)),
    );
    await ready(pencil);
    assert.equal(await undo.isDisabled(), true);
    await drawLine(host);
    await ready(undo);
    await submit(guest, word);
    await dialog(host, 'Turn Complete').waitFor(wait);
    assert.equal(
      await host.locator('button[aria-label="Undo last stroke"]').isDisabled(),
      true,
    );
    assert.deepEqual(errors, []);
  },
);

async function downloadPng(page, control, mobile) {
  const started = page.waitForEvent('download', wait);
  if (mobile) await control.tap();
  else await control.click();
  const download = await started;
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return {
    filename: download.suggestedFilename(),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    base64: bytes.toString('base64'),
  };
}

function exportedPixels(page, png, coordinates) {
  return page.evaluate(
    async ({ base64, coordinates }) => {
      const bytes = Uint8Array.from(globalThis.atob(base64), (character) =>
        character.charCodeAt(0),
      );
      const image = await globalThis.createImageBitmap(
        new globalThis.Blob([bytes], { type: 'image/png' }),
      );
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      image.close();
      return coordinates.map(([x, y]) =>
        Array.from(
          context.getImageData(
            Math.round(x * canvas.width),
            Math.round(y * canvas.height),
            1,
            1,
          ).data,
        ),
      );
    },
    { base64: png.base64, coordinates },
  );
}

test(
  'completed drawings download as opaque PNGs from the summary and refreshed results',
  { timeout: 80_000 },
  async (t) => {
    const variant = process.env.QA_PNG_BROWSER;
    const mobile = variant === 'mobile';
    const { host, guests, pages, start, errors } = await fixture(t, 2, mobile, {
      browserType: variant === 'firefox' ? firefox : chromium,
    });
    const [guest] = guests;
    await start();
    const word = await chooseWord(host, guests);
    const undo = button(host, 'Undo last stroke');
    const slider = host.getByRole('slider', { name: 'Brush size' });
    await button(host, 'Coral').click();
    await slider.press('End');
    await drawLine(host, undefined, [0.23, 0.35], [0.77, 0.35]);
    await button(host, 'Cobalt').click();
    await slider.press('Home');
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    await slider.press('ArrowRight');
    await drawLine(host, undefined, [0.23, 0.65], [0.77, 0.65]);
    await drawLine(host, undefined, [0.18, 0.65], [0.18, 0.65]);
    await button(host, 'Eraser').click();
    await slider.press('End');
    await drawLine(host, undefined, [0.5, 0.29], [0.5, 0.41]);
    await button(host, 'Mint').click();
    await drawLine(host, undefined, [0.23, 0.8], [0.77, 0.8]);
    await ready(undo);
    await undo.click();
    await ready(undo);

    await submit(guest, word);
    const summary = dialog(guest, 'Turn Complete');
    await summary.waitFor(wait);
    const download = button(summary, 'Download Drawing');
    await guest.setViewportSize(viewports[1]);
    await guest.evaluate(() => {
      globalThis.document.documentElement.style.fontSize = '125%';
    });
    const first = await downloadPng(guest, download, mobile);
    assert.equal(first.filename, 'draw-and-guess-round-1-hammad.png');
    assert.deepEqual([first.width, first.height], [1800, 1200]);
    const white = [255, 255, 255, 255];
    const coral = [244, 63, 94, 255];
    const cobalt = [29, 78, 216, 255];
    const probes = [
      [0.01, 0.01],
      [0.35, 0.35],
      [0.35, 0.365],
      [0.35, 0.38],
      [0.5, 0.35],
      [0.35, 0.65],
      [0.35, 0.665],
      [0.18, 0.65],
      [0.5, 0.8],
    ];
    const expectedPixels = [
      white,
      coral,
      coral,
      white,
      white,
      cobalt,
      white,
      cobalt,
      white,
    ];
    assert.deepEqual(
      await exportedPixels(guest, first, probes),
      expectedPixels,
    );
    await guest.evaluate(() => {
      globalThis.document.documentElement.style.fontSize = '';
    });
    await guest.setViewportSize(mobile ? deviceViewports[0] : viewports[1]);
    await guest.reload();

    for (let turn = 1; turn < 4; turn++) {
      const [drawer, guesser] = turn % 2 ? [guest, host] : [host, guest];
      const answer = await chooseWord(drawer, [guesser]);
      if (turn === 3) {
        await button(drawer, 'Cobalt').click();
        await drawer.getByRole('slider', { name: 'Brush size' }).press('End');
        await drawLine(drawer);
        await ready(button(drawer, 'Undo last stroke'));
      }
      await submit(guesser, answer);
    }

    await Promise.all(
      pages.map((page) => page.waitForURL('**/results/*', wait)),
    );
    await guest.reload();
    await button(guest, 'Completed drawings').click();
    const picker = dialog(guest, 'Completed drawings');
    const select = picker.getByRole('combobox', { name: 'Completed drawing' });
    assert.equal(await select.locator('option').count(), 4);
    const resultDownload = button(picker, 'Download Drawing');
    const restored = await downloadPng(guest, resultDownload, mobile);
    assert.equal(restored.filename, first.filename);
    assert.deepEqual(
      await exportedPixels(guest, restored, probes),
      expectedPixels,
    );

    await select.selectOption({ index: 3 });
    await guest.evaluate(() => {
      const prototype = globalThis.HTMLCanvasElement.prototype;
      const toBlob = prototype.toBlob;
      prototype.toBlob = function (callback, ...options) {
        if (this.width > 900) callback(null);
        else toBlob.call(this, callback, ...options);
      };
    });
    const final = await downloadPng(guest, resultDownload, mobile);
    assert.equal(
      final.filename,
      mobile
        ? 'draw-and-guess-round-2-b-ali-b.png'
        : 'draw-and-guess-round-2-ali.png',
    );
    assert.deepEqual([final.width, final.height], [900, 600]);
    assert.deepEqual(
      await exportedPixels(guest, final, [
        [0.5, 0.42],
        [0.01, 0.01],
      ]),
      [cobalt, white],
    );

    await guest.evaluate(() => {
      globalThis.HTMLCanvasElement.prototype.toBlob = (callback) =>
        callback(null);
    });
    await resultDownload.click();
    await guest
      .getByText('Could not create the PNG. Try again.', { exact: true })
      .waitFor(wait);
    assert.deepEqual(errors, []);
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
        await button(drawer, 'Coral').click();
        const slider = drawer.getByRole('slider', { name: 'Brush size' });
        await slider.press('End');
        assert.equal(await slider.getAttribute('aria-valuenow'), '30');
        const coral = [244, 63, 94, 255];
        await drawLine(drawer, () => expectPixel(first, 0.23, coral));
        await Promise.all(
          guessers.map((page) => expectPixel(page, 0.5, coral)),
        );
        await expectPixel(first, 0.5, coral, 0.435);
        await button(drawer, 'Eraser').click();
        await drawLine(drawer);
        await Promise.all(guessers.map((page) => expectPixel(page, 0.5, null)));
        await button(drawer, 'Cobalt').click();
        assert.equal(
          await button(drawer, 'Pencil').getAttribute('aria-pressed'),
          'true',
        );
        await drawLine(drawer);
        await expectPixel(second, 0.5, [29, 78, 216, 255]);
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
    const ink = [0, 0, 0, 255];
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
