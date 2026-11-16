/*
This file checks the game in a real browser: the menu starts a match, and two players meet in an online room.
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
  await openGame(page);
  await clickMenu(page, "ONLINE");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { name: "Room is ready" })).toBeVisible();
  const code = (await page.locator("#room-code").textContent()) ?? "";
  expect(code).toMatch(/^[A-Z2-9]{4}$/);

  const guest = await context.newPage();
  await openGame(guest);
  await clickMenu(guest, "ONLINE");
  await guest.getByRole("textbox", { name: "Room code" }).fill("ZZZZ");
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest.getByRole("alert")).toHaveText("Room ZZZZ was not found.");

  await guest.getByRole("textbox", { name: "Room code" }).fill(code.toLowerCase());
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest.getByText(`Room ${code} · you are PURPLE (right)`, { exact: false })).toBeVisible();
  await expect(page.getByText(`Room ${code} · you are GREEN (left)`, { exact: false })).toBeVisible();

  await guest.close();
  await expect(page.getByText("Your opponent left the game.")).toBeVisible();
});
