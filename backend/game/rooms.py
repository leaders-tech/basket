"""Keep online game rooms in memory: create a room, join it by code, and leave it.

Edit this file when room rules change (code length, how many players fit, what happens when someone leaves).
Copy this file as a starting point when you add another small in-memory store that does not need the database.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any

# No look-alike characters (0/O, 1/I, 5/S, 8/B), so a code shown in the pixel font is easy to read.
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ234679"
CODE_LENGTH = 4


@dataclass
class Room:
    code: str
    host: Any
    guest: Any = None


class RoomError(Exception):
    """A join failed. The message is shown to the player."""


class RoomStore:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}

    def new_code(self) -> str:
        while True:
            code = "".join(random.choice(CODE_CHARS) for _ in range(CODE_LENGTH))
            if code not in self.rooms:
                return code

    def create(self, host: Any) -> Room:
        room = Room(code=self.new_code(), host=host)
        self.rooms[room.code] = room
        return room

    def join(self, code: str, guest: Any) -> Room:
        code = code.strip().upper()
        room = self.rooms.get(code)
        if room is None:
            raise RoomError(f"Room {code} was not found.")
        if room.guest is not None:
            raise RoomError("This room already has two players.")
        room.guest = guest
        return room

    def leave(self, player: Any) -> tuple[Room | None, Any]:
        """Remove the player from their room. Return the room and the other player (or None)."""
        for room in list(self.rooms.values()):
            if room.host is player:
                del self.rooms[room.code]
                return room, room.guest
            if room.guest is player:
                room.guest = None
                return room, room.host
        return None, None

    def other_player(self, player: Any) -> Any:
        for room in self.rooms.values():
            if room.host is player:
                return room.guest
            if room.guest is player:
                return room.host
        return None
