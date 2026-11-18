"""Handle the public game websocket at /ws/game and the /api/game/cheats check.

The websocket creates or joins a room, then passes messages between the two players. Secret combo messages
(c = cheat shot, u = uwu, x = chaos) are passed on only from IP addresses that may use them.

Edit this file when the online game message types or the connection flow change.
Copy this route pattern when you add another public websocket endpoint that does not need login.
"""

from __future__ import annotations

import json
import logging

from aiohttp import WSMsgType, web

from backend.app_keys import GAME_ROOMS, SETTINGS
from backend.game.cheats import cheats_allowed, client_ip
from backend.game.rooms import RoomError
from backend.http.json_api import ok
from backend.http.middleware import require_allowed_origin

LOGGER = logging.getLogger("backend.game")

# Game messages are small. A bigger message means a broken or hostile client.
MAX_MESSAGE_SIZE = 64 * 1024
# Messages that only allowed IP addresses may send: cheat shot, uwu sound, chaos.
SECRET_COMBO_MESSAGES = {"c", "u", "x"}


async def cheats_check(request: web.Request) -> web.Response:
    """Tell the game whether this browser may use the secret combos, and which IP address the server sees."""
    require_allowed_origin(request)
    ip = client_ip(request)
    return ok({"allowed": cheats_allowed(request.app[SETTINGS], ip), "ip": ip})


async def send(ws: web.WebSocketResponse | None, message: dict[str, object] | str) -> None:
    if ws is None or ws.closed:
        return
    try:
        if isinstance(message, str):
            await ws.send_str(message)
        else:
            await ws.send_json(message)
    except ConnectionError:
        pass


async def leave_room(request: web.Request, ws: web.WebSocketResponse) -> None:
    room, other = request.app[GAME_ROOMS].leave(ws)
    if room is None:
        return
    LOGGER.info("Game room %s: a player left", room.code)
    await send(other, {"t": "peer-left"})


async def game_websocket(request: web.Request) -> web.WebSocketResponse:
    require_allowed_origin(request)
    ws = web.WebSocketResponse(heartbeat=30.0, max_msg_size=MAX_MESSAGE_SIZE)
    await ws.prepare(request)
    rooms = request.app[GAME_ROOMS]
    may_use_combos = cheats_allowed(request.app[SETTINGS], client_ip(request))

    try:
        async for message in ws:
            if message.type != WSMsgType.TEXT:
                continue
            try:
                data = json.loads(message.data)
            except json.JSONDecodeError:
                continue
            if not isinstance(data, dict):
                continue
            kind = data.get("t")
            if kind == "create":
                await leave_room(request, ws)
                room = rooms.create(ws)
                LOGGER.info("Game room %s created", room.code)
                await send(ws, {"t": "created", "code": room.code})
            elif kind == "join":
                await leave_room(request, ws)
                try:
                    room = rooms.join(str(data.get("code", "")), ws)
                except RoomError as error:
                    await send(ws, {"t": "error", "msg": str(error)})
                    continue
                LOGGER.info("Game room %s: the second player joined", room.code)
                await send(ws, {"t": "joined", "code": room.code})
                await send(room.host, {"t": "peer-joined"})
            elif kind == "leave":
                await leave_room(request, ws)
            elif kind in SECRET_COMBO_MESSAGES and not may_use_combos:
                LOGGER.info("Game: blocked a secret combo from an IP that may not use it")
            else:
                # Game state from the host and button presses from the guest go straight to the other player.
                await send(rooms.other_player(ws), message.data)
    finally:
        await leave_room(request, ws)

    return ws


def setup_game_routes(app: web.Application) -> None:
    app.router.add_get("/ws/game", game_websocket)
    app.router.add_post("/api/game/cheats", cheats_check)
