"""WebSocket and Event Bus foundation for realtime POS events."""

import asyncio
from datetime import datetime, timezone
from typing import Dict, Optional, Set, Any
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class WebSocketConnectionManager:
    """Manages active WebSocket connections for table and order status broadcasts."""

    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()
        self.channel_subscriptions: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str = "general") -> None:
        await websocket.accept()
        self.active_connections.add(websocket)
        if channel not in self.channel_subscriptions:
            self.channel_subscriptions[channel] = set()
        self.channel_subscriptions[channel].add(websocket)
        logger.info("Client connected to channel '%s'. Total active: %d", channel, len(self.active_connections))

    def disconnect(self, websocket: WebSocket, channel: str = "general") -> None:
        if websocket in self.active_connections:
            self.active_connections.discard(websocket)
        if channel in self.channel_subscriptions and websocket in self.channel_subscriptions[channel]:
            self.channel_subscriptions[channel].discard(websocket)
        logger.info("Client disconnected from channel '%s'. Total active: %d", channel, len(self.active_connections))

    async def broadcast_to_channel(self, message: dict, channel: str) -> None:
        if channel in self.channel_subscriptions:
            dead_sockets = set()
            for connection in list(self.channel_subscriptions[channel]):
                try:
                    await connection.send_json(message)
                except Exception as exc:
                    logger.warning("Error sending message to websocket on channel %s: %s", channel, exc)
                    dead_sockets.add(connection)
            for dead in dead_sockets:
                self.disconnect(dead, channel)

    async def broadcast_event(self, event_type: str, data: Any = None, channel: str = "floor") -> None:
        """Broadcasts a standardized event envelope across channel and general."""
        envelope = {
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data or {},
        }
        # Broadcast to specific channel
        await self.broadcast_to_channel(envelope, channel)
        # Also broadcast to general if different
        if channel != "general":
            await self.broadcast_to_channel(envelope, "general")


ws_manager = WebSocketConnectionManager()


def dispatch_pos_event(event_type: str, data: Any = None, channel: str = "floor") -> None:
    """Dispatches a websocket event asynchronously without blocking current transaction."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(ws_manager.broadcast_event(event_type, data, channel))
    except RuntimeError:
        pass
