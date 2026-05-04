"""Steam OpenID 2.0 link flow.

GET  /auth/steam/init      → redirects logged-in user to Steam OpenID
GET  /auth/steam/callback  → Steam redirects back here; we verify the
                              positive assertion and store steamid64 on
                              the user, then redirect to the front-end
                              profile page.
POST /auth/steam/unlink    → clear the steamid binding

The flow assumes the user is already authenticated on our side; the
Steam binding is just an additional verified identity.
"""
from __future__ import annotations

import re
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.models.user import User

router = APIRouter(prefix="/auth/steam", tags=["steam"])

STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"
STEAM_ID_RE = re.compile(r"https?://steamcommunity\.com/openid/id/(\d{17})")


@router.get("/init")
async def steam_init(user: CurrentUser) -> RedirectResponse:
    """Redirect the user to Steam's OpenID login screen."""
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": settings.steam_return_url,
        "openid.realm": settings.steam_realm,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return RedirectResponse(
        f"{STEAM_OPENID_URL}?{urlencode(params)}", status_code=302
    )


@router.get("/callback")
async def steam_callback(
    request: Request, user: CurrentUser, db: DbSession
) -> RedirectResponse:
    """Verify positive assertion from Steam and bind the steamid64."""
    # Snapshot all openid.* params; we'll send them back to Steam to verify.
    params = dict(request.query_params)
    if params.get("openid.mode") != "id_res":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Steam: некорректный ответ OpenID",
        )

    # Extract steamid64 from claimed_id BEFORE we modify mode for verification.
    claimed = params.get("openid.claimed_id", "")
    m = STEAM_ID_RE.match(claimed)
    if not m:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Steam: не получилось извлечь SteamID",
        )
    steamid64 = m.group(1)

    # Re-send everything with mode=check_authentication for verification.
    verify_params = {**params, "openid.mode": "check_authentication"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(STEAM_OPENID_URL, data=verify_params)
    if resp.status_code != 200 or "is_valid:true" not in resp.text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Steam: не удалось проверить ответ OpenID",
        )

    # Make sure no other user already owns this steamid.
    from sqlalchemy import select as _select

    other_q = await db.execute(
        _select(User).where(User.steam_id == steamid64, User.id != user.id)
    )
    if other_q.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот Steam уже привязан к другому аккаунту",
        )

    user.steam_id = steamid64
    await db.commit()

    # Bounce back to user profile on the public site.
    nick = user.nickname
    return RedirectResponse(f"{settings.app_url}/u/{nick}?steam=ok", status_code=302)


@router.post("/unlink")
async def steam_unlink(user: CurrentUser, db: DbSession) -> dict:
    user.steam_id = None
    await db.commit()
    return {"unlinked": True}
