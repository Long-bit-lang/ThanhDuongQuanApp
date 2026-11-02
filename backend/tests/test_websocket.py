"""Tests for WebSocket connectivity and acknowledgement."""

import pytest
from starlette.testclient import TestClient

from app.main import app


def test_websocket_channel_echo() -> None:
    """Verifies that WebSocket clients can connect to a channel and exchange messages."""
    client = TestClient(app)
    with client.websocket_connect("/ws/floor") as websocket:
        websocket.send_json({"action": "PING", "table_id": 1})
        data = websocket.receive_json()
        assert data["type"] == "ACK"
        assert data["channel"] == "floor"
        assert data["data"]["action"] == "PING"
        assert data["data"]["table_id"] == 1
