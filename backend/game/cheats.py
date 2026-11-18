"""Decide who may use the secret key combos (Z + C cheat shot, Z + U uwu, Z + W chaos).

Only IP addresses listed in CHEAT_IPS may use them. In dev and test mode your own computer (127.0.0.1) may too.
Edit this file when the rule for who may use the combos changes.
Do not copy this file. Add a new rule here instead of making a second list.
"""

from __future__ import annotations

from aiohttp import web

from backend.config import Settings

LOOPBACK_IPS = {"127.0.0.1", "::1"}


def client_ip(request: web.Request) -> str:
    """Return the browser's IP address, also when the request came through a proxy (Caddy on tlfpaas, Vite in dev)."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    # Our own proxy adds the real address at the end. Earlier entries could be typed by anyone, so we ignore them.
    ip = forwarded.split(",")[-1].strip() if forwarded.strip() else (request.remote or "")
    if ip.startswith("::ffff:"):
        ip = ip.removeprefix("::ffff:")  # an IPv4 address written in IPv6 form
    return ip


def cheats_allowed(settings: Settings, ip: str) -> bool:
    if ip in settings.cheat_ips:
        return True
    return settings.mode != "prod" and ip in LOOPBACK_IPS
