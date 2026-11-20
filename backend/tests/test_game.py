"""Test online game rooms: room codes, joining, message relay, and leaving.

Edit this file when the room rules or the /ws/game messages change.
Copy a test pattern here when you add tests for another websocket feature.
"""

from __future__ import annotations

import pytest
from aiohttp import WSServerHandshakeError

from backend.game.rooms import CODE_CHARS, MAX_NAME_LENGTH, MAX_PARTY_PLAYERS, RoomError, RoomStore


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
    joined, player_id, _ = store.join(f" {room.code.lower()} ", "guest")
    assert joined is room
    assert player_id is None
    assert store.others("host") == ["guest"]
    assert store.others("guest") == ["host"]


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
    left_room, others, _ = store.leave("host")
    assert left_room is room
    assert others == ["guest"]
    assert room.code not in store.rooms
    assert store.others("guest") == []


def test_guest_leaving_keeps_room_open() -> None:
    store = RoomStore()
    room = store.create("host")
    store.join(room.code, "guest")
    _, others, _ = store.leave("guest")
    assert others == ["host"]
    assert store.rooms[room.code].guest is None
    store.join(room.code, "new guest")
    assert store.others("host") == ["new guest"]


def test_party_room_gives_ids_and_needs_a_name() -> None:
    store = RoomStore()
    room = store.create("host", party=True)
    with pytest.raises(RoomError, match="Type your name first."):
        store.join(room.code, "a", "   ")
    _, first, name = store.join(room.code, "a", "  Anna   Lee  ")
    _, second, _ = store.join(room.code, "b", "Bob")
    assert (first, second, name) == (1, 2, "Anna Lee")
    assert store.join(room.code, "c", "x" * 30)[2] == "x" * MAX_NAME_LENGTH
    assert store.others("host") == ["a", "b", "c"]
    assert store.others("b") == ["host"]


def test_party_room_is_full_at_eight_and_closed_after_start() -> None:
    store = RoomStore()
    room = store.create("host", party=True)
    for i in range(MAX_PARTY_PLAYERS - 1):
        store.join(room.code, f"p{i}", f"P{i}")
    with pytest.raises(RoomError, match="full"):
        store.join(room.code, "late", "Late")
    store.leave("p0")
    store.lock("p1")  # only the host can start the game
    assert not room.locked
    store.lock("host")
    with pytest.raises(RoomError, match="already started"):
        store.join(room.code, "late", "Late")


def test_party_guest_leaving_tells_the_host_its_id() -> None:
    store = RoomStore()
    room = store.create("host", party=True)
    store.join(room.code, "a", "A")
    store.join(room.code, "b", "B")
    assert store.leave("b") == (room, ["host"], 2)
    assert store.leave("host") == (room, ["a"], None)
    assert room.code not in store.rooms


@pytest.mark.asyncio
async def test_party_room_over_websocket(client) -> None:
    host = await client.ws_connect("/ws/game")
    await host.send_json({"t": "create-party", "name": "Admin"})
    created = await host.receive_json()
    assert created["party"] is True and created["id"] == 0 and created["name"] == "Admin"
    code = created["code"]

    guests = []
    for name in ("Ann", "Bob"):
        guest = await client.ws_connect("/ws/game")
        await guest.send_json({"t": "join", "code": code, "name": name})
        joined = await guest.receive_json()
        assert joined["party"] is True and joined["name"] == name
        assert await host.receive_json() == {"t": "p-join", "id": joined["id"], "name": name}
        guests.append(guest)

    # the host's messages go to every guest
    await host.send_json({"t": "lobby", "players": []})
    for guest in guests:
        assert await guest.receive_json() == {"t": "lobby", "players": []}
    # a guest's message goes to the host with the real sender id, even if the guest types another one
    await guests[1].send_json({"t": "i", "d": 1, "from": 0})
    assert await host.receive_json() == {"t": "i", "d": 1, "from": 2}

    # after the start nobody can join
    await host.send_json({"t": "lock"})
    late = await client.ws_connect("/ws/game")
    await late.send_json({"t": "join", "code": code, "name": "Late"})
    assert await late.receive_json() == {"t": "error", "msg": "This game has already started."}

    await guests[0].close()
    assert await host.receive_json() == {"t": "p-left", "id": 1}
    await host.close()
    assert await guests[1].receive_json() == {"t": "peer-left"}
    await guests[1].close()
    await late.close()


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
