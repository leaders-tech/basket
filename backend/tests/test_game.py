"""Test online game rooms: room codes, joining, message relay, and leaving.

Edit this file when the room rules or the /ws/game messages change.
Copy a test pattern here when you add tests for another websocket feature.
"""

from __future__ import annotations

import pytest
from aiohttp import WSServerHandshakeError

from backend.game.rooms import CODE_CHARS, RoomError, RoomStore


def test_room_code_has_four_clear_characters() -> None:
    store = RoomStore()
    room = store.create("host")
    assert len(room.code) == 4
    assert all(char in CODE_CHARS for char in room.code)
    for look_alike in "0O1I58":
        assert look_alike not in CODE_CHARS


def test_join_room_by_code_ignores_case_and_spaces() -> None:
    store = RoomStore()
    room = store.create("host")
    joined = store.join(f" {room.code.lower()} ", "guest")
    assert joined is room
    assert store.other_player("host") == "guest"
    assert store.other_player("guest") == "host"


def test_join_unknown_room_fails() -> None:
    store = RoomStore()
    with pytest.raises(RoomError, match="Room ZZZZ was not found."):
        store.join("ZZZZ", "guest")


def test_third_player_cannot_join() -> None:
    store = RoomStore()
    room = store.create("host")
    store.join(room.code, "guest")
    with pytest.raises(RoomError, match="already has two players"):
        store.join(room.code, "third")


def test_host_leaving_closes_room() -> None:
    store = RoomStore()
    room = store.create("host")
    store.join(room.code, "guest")
    left_room, other = store.leave("host")
    assert left_room is room
    assert other == "guest"
    assert room.code not in store.rooms
    assert store.other_player("guest") is None


def test_guest_leaving_keeps_room_open() -> None:
    store = RoomStore()
    room = store.create("host")
    store.join(room.code, "guest")
    _, other = store.leave("guest")
    assert other == "host"
    assert store.rooms[room.code].guest is None
    store.join(room.code, "new guest")
    assert store.other_player("host") == "new guest"


@pytest.mark.asyncio
async def test_game_websocket_rejects_wrong_origin(client) -> None:
    with pytest.raises(WSServerHandshakeError) as error:
        await client.ws_connect("/ws/game", headers={"Origin": "http://evil.example"})
    assert error.value.status == 403


@pytest.mark.asyncio
async def test_two_players_meet_in_a_room_and_exchange_messages(client) -> None:
    host = await client.ws_connect("/ws/game")
    await host.send_json({"t": "create"})
    created = await host.receive_json()
    assert created["t"] == "created"
    code = created["code"]

    guest = await client.ws_connect("/ws/game")
    await guest.send_json({"t": "join", "code": code.lower()})
    assert await guest.receive_json() == {"t": "joined", "code": code}
    assert await host.receive_json() == {"t": "peer-joined"}

    await guest.send_json({"t": "i", "d": 1})
    assert await host.receive_json() == {"t": "i", "d": 1}
    await host.send_json({"t": "s", "sc": [1, 0]})
    assert await guest.receive_json() == {"t": "s", "sc": [1, 0]}

    await host.close()
    assert await guest.receive_json() == {"t": "peer-left"}
    await guest.close()


@pytest.mark.asyncio
async def test_join_wrong_code_returns_error(client) -> None:
    ws = await client.ws_connect("/ws/game")
    await ws.send_str("not json")
    await ws.send_json({"t": "join", "code": "ZZZZ"})
    assert await ws.receive_json() == {"t": "error", "msg": "Room ZZZZ was not found."}
    await ws.close()
