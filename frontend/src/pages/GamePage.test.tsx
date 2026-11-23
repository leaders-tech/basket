/*
This file tests that the game page starts the game, stops it when the page closes, and shows English panel text.
Edit this file when the game page panels or the startGame() contract change.
Copy this test when you add another page that runs plain JavaScript code.
*/

import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

const { stop, startGame } = vi.hoisted(() => {
  const stop = vi.fn();
  return { stop, startGame: vi.fn(() => stop) };
});
vi.mock("../game/game.js", () => ({ startGame, SOCKET_PATH: "/ws/game" }));

import { render, screen } from "@testing-library/react";
import { GamePage } from "./GamePage";

describe("GamePage", () => {
  it("starts the game and stops it when the page closes", () => {
    startGame.mockClear();
    stop.mockClear();
    const view = render(<GamePage />);
    expect(startGame).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Wobble Hoops game")).toBeInTheDocument();
    view.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("has the online play panels in English", () => {
    render(<GamePage />);
    expect(screen.getByRole("button", { name: "Create room (1 vs 1)", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create party room (up to 8)", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start game", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Boosts (power-ups) in rooms I create", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join", hidden: true })).toBeInTheDocument();
    expect(screen.getByText("Waiting for an opponent")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
});
