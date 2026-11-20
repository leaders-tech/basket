/*
This file checks the game in a real browser: the menu starts a match, two players meet in an online room,
and four players play a party room with uneven teams.
Edit this file when the menu buttons, the online panels, or the /ws/game messages change.
Copy a test pattern here when you add another game flow.
*/

import { expect, test, type Page } from "@playwright/test";

// Menu buttons are drawn on the canvas, so we click them by their place in canvas pixels (the canvas is 190 px tall).
async function clickMenu(page: Page, button: "1 PLAYER" | "ONLINE") {
  const canvas = page.getByLabel("Wobble Hoops game");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("The game canvas is not visible.");
  const y = button === "1 PLAYER" ? 69 : 121;
  await canvas.click({ position: { x: box.width / 2, y: (y / 190) * box.height } });
}

async function openGame(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Wobble Hoops game")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test("1 player button starts a match with an English hint", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openGame(page);
  await clickMenu(page, "1 PLAYER");
  await expect(page.getByText("Hold W, ↑, Space or click, then let go to shoot · Esc: menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Hold W, ↑, Space or click", { exact: false })).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("two players meet in an online room", async ({ page, context }) => {
  const hostFrames: string[] = [];
  page.on("websocket", (socket) => socket.on("framereceived", (frame) => hostFrames.push(String(frame.payload))));
  await openGame(page);
  await clickMenu(page, "ONLINE");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { name: "Room is ready" })).toBeVisible();
  const code = (await page.locator("#room-code").textContent()) ?? "";
  expect(code).toMatch(/^[A-Z2-9]{4}$/);

  const guest = await context.newPage();
  const guestFrames: string[] = [];
  guest.on("websocket", (socket) => socket.on("framereceived", (frame) => guestFrames.push(String(frame.payload))));
  await openGame(guest);
  await clickMenu(guest, "ONLINE");
  await guest.getByRole("textbox", { name: "Room code" }).fill("ZZZZ");
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest.getByRole("alert")).toHaveText("Room ZZZZ was not found.");

  await guest.getByRole("textbox", { name: "Room code" }).fill(code.toLowerCase());
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest.getByText(`Room ${code} · you are PURPLE (right)`, { exact: false })).toBeVisible();
  await expect(page.getByText(`Room ${code} · you are GREEN (left)`, { exact: false })).toBeVisible();

  // Cheats are locked at first: Z + U sends nothing.
  await guest.keyboard.down("z");
  await guest.keyboard.press("u");
  await guest.keyboard.up("z");
  // Pressing 1 four times in the first 5 seconds of the match unlocks them.
  for (let i = 0; i < 4; i++) await guest.keyboard.press("1");
  await expect(guest.getByText("Cheats unlocked!")).toBeVisible();
  expect(hostFrames.some((frame) => frame.replace(/\s/g, "") === '{"t":"u"}')).toBe(false);

  // Z + U on the guest plays the uwu sound for both players: the host gets a "u" message.
  await guest.keyboard.down("z");
  await guest.keyboard.press("u");
  await guest.keyboard.up("z");
  await expect.poll(() => hostFrames.includes('{"t": "u"}') || hostFrames.includes('{"t":"u"}')).toBe(true);

  // Z + W on the guest starts chaos on the host, and the host's snapshots tell the guest about it.
  await guest.keyboard.down("z");
  await guest.keyboard.press("w");
  await guest.keyboard.up("z");
  await expect.poll(() => guestFrames.some((frame) => frame.includes('"x":['))).toBe(true);

  await guest.close();
  await expect(page.getByText("Your opponent left the game.")).toBeVisible();
});

test("party room: the admin puts four players into teams 1 against 3 and starts", async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const hostFrames: string[] = [];
  page.on("websocket", (socket) => socket.on("framereceived", (frame) => hostFrames.push(String(frame.payload))));

  await openGame(page);
  await clickMenu(page, "ONLINE");
  await page.getByRole("button", { name: "Create party room" }).click();
  await expect(page.getByRole("alert")).toHaveText("Type your name first.");
  await page.getByLabel("Your name").fill("Admin");
  await page.getByRole("button", { name: "Create party room" }).click();
  await expect(page.getByRole("heading", { name: "Party room" })).toBeVisible();
  const code = (await page.locator("#party-code").textContent()) ?? "";
  expect(code).toMatch(/^[A-Z2-9]{4}$/);
  await expect(page.getByRole("button", { name: "Start game" })).toBeDisabled();

  const guests: Page[] = [];
  for (const name of ["Ann", "Bob", "Cid"]) {
    const guest = await context.newPage();
    guest.on("pageerror", (error) => pageErrors.push(error.message));
    await openGame(guest);
    await clickMenu(guest, "ONLINE");
    await guest.getByLabel("Your name").fill(name);
    await guest.getByRole("textbox", { name: "Room code" }).fill(code);
    await guest.getByRole("button", { name: "Join" }).click();
    await expect(guest.getByRole("heading", { name: "Party room" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Players" }).getByText(name)).toBeVisible();
    guests.push(guest);
  }
  // new players go to the smaller team: Admin GREEN, Ann PURPLE, Bob GREEN, Cid PURPLE
  await expect(page.getByText("4 / 8 players · GREEN 2 · PURPLE 2")).toBeVisible();
  await expect(guests[2].getByText("Waiting for the admin to start the game.")).toBeVisible();

  // the admin moves Bob to PURPLE: 1 against 3, and the guests see it too
  await page.getByRole("button", { name: "Put Bob in PURPLE" }).click();
  await expect(page.getByText("4 / 8 players · GREEN 1 · PURPLE 3")).toBeVisible();
  await expect(guests[0].getByText("4 / 8 players · GREEN 1 · PURPLE 3")).toBeVisible();

  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByText(`Room ${code} · you are GREEN (left)`, { exact: false })).toBeVisible();
  for (const guest of guests) {
    await expect(guest.getByText(`Room ${code} · you are PURPLE (right)`, { exact: false })).toBeVisible();
  }

  // Bob's button press reaches the admin with Bob's id (player 2)
  await guests[1].keyboard.down("Space");
  await expect.poll(() => hostFrames.some((f) => f.replace(/\s/g, "") === '{"t":"i","d":1,"from":2}')).toBe(true);
  await guests[1].keyboard.up("Space");

  // nobody can join after the start
  const late = await context.newPage();
  await openGame(late);
  await clickMenu(late, "ONLINE");
  await late.getByLabel("Your name").fill("Late");
  await late.getByRole("textbox", { name: "Room code" }).fill(code);
  await late.getByRole("button", { name: "Join" }).click();
  await expect(late.getByRole("alert")).toHaveText("This game has already started.");

  // a guest leaves: the game goes on for the others
  await guests[0].close();
  await expect(page.getByText("Ann left the game.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guests[1].getByText("The admin left the room.")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
