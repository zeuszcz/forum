from app.routers.prison_break.router import router
from app.routers.prison_break.actions import actions_router
from app.routers.prison_break.ws import ws_router
from app.routers.prison_break.craft_market import craft_router, market_router
from app.routers.prison_break.social import social_router
from app.routers.prison_break.minigames import minigames_router

__all__ = [
    "router", "actions_router", "ws_router",
    "craft_router", "market_router", "social_router",
    "minigames_router",
]
