"""Keep online game rooms in memory: create a room, join it by code, and leave it.

There are two kinds of rooms:
- a two-player room: the host and one guest;
- a party room: the host (the admin) and up to 7 guests, each with a name and a player id.
Edit this file when room rules change (code length, how many players fit, what happens when someone leaves).
Copy this file as a starting point when you add another small in-memory store that does not need the database.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

# No look-alike characters (0/O, 1/I, 5/S, 8/B), so a code shown in the pixel font is easy to read.
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ234679"
CODE_LENGTH = 4
MAX_PARTY_PLAYERS = 8
MAX_NAME_LENGTH = 12


@dataclass
class Room:
    code: str
    host: Any
    guest: Any = None  # two-player rooms only
    party: bool = False
    guests: dict[int, Any] = field(default_factory=dict)  # party rooms: player id -> connection (the host is id 0)
    locked: bool = False  # party rooms: the game has started, so nobody can join any more
    next_id: int = 1


class RoomError(Exception):
    """A join failed. The message is shown to the player."""


def clean_name(name: object) -> str:
    text = " ".join(str(name or "").split())[:MAX_NAME_LENGTH]
    if not text:
        raise RoomError("Type your name first.")
    return text


class RoomStore:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}

    def new_code(self) -> str:
        while True:
            code = "".join(random.choice(CODE_CHARS) for _ in range(CODE_LENGTH))
            if code not in self.rooms:
                return code

    def create(self, host: Any, party: bool = False) -> Room:
        room = Room(code=self.new_code(), host=host, party=party)
        self.rooms[room.code] = room
        return room

    def join(self, code: str, guest: Any, name: object = "") -> tuple[Room, int | None, str]:
        """Join a room. Returns the room and, for a party room, the new player's id and cleaned-up name."""
        code = code.strip().upper()
        room = self.rooms.get(code)
        if room is None:
            raise RoomError(f"Room {code} was not found.")
        if not room.party:
            if room.guest is not None:
                raise RoomError("This room already has two players.")
            room.guest = guest
            return room, None, ""
        clean = clean_name(name)
        if room.locked:
            raise RoomError("This game has already started.")
        if len(room.guests) + 1 >= MAX_PARTY_PLAYERS:
            raise RoomError(f"This room is full ({MAX_PARTY_PLAYERS} players).")
        player_id = room.next_id
        room.next_id += 1
        room.guests[player_id] = guest
        return room, player_id, clean

    def room_of(self, player: Any) -> Room | None:
        for room in self.rooms.values():
            if room.host is player or room.guest is player or player in room.guests.values():
                return room
        return None

    def player_id(self, room: Room, player: Any) -> int | None:
        for player_id, guest in room.guests.items():
            if guest is player:
                return player_id
        return None

    def others(self, player: Any) -> list[Any]:
        """Everyone this player's messages go to: the host sends to all guests, a guest sends to the host."""
        room = self.room_of(player)
        if room is None:
            return []
        if room.host is player:
            return [g for g in [room.guest, *room.guests.values()] if g is not None]
        return [room.host]

    def lock(self, player: Any) -> None:
        room = self.room_of(player)
        if room is not None and room.party and room.host is player:
            room.locked = True

    def leave(self, player: Any) -> tuple[Room | None, list[Any], int | None]:
        """Remove the player. Returns the room, the players to tell, and the party id of a guest who left."""
        room = self.room_of(player)
        if room is None:
            return None, [], None
        if room.host is player:
            del self.rooms[room.code]
            return room, [g for g in [room.guest, *room.guests.values()] if g is not None], None
        if room.guest is player:
            room.guest = None
            return room, [room.host], None
        player_id = self.player_id(room, player)
        room.guests.pop(player_id, None)
        return room, [room.host], player_id
