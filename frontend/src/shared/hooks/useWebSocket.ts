/**
 * Reusable WebSocket hook for realtime POS updates.
 * Prepares structure for Phase 4 table state and order refresh events.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { config } from '../../app/config';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseWebSocketReturn {
  status: WebSocketStatus;
  lastMessage: unknown | null;
  sendMessage: (data: unknown) => void;
  reconnect: () => void;
}

export function useWebSocket(channel: string = 'general'): UseWebSocketReturn {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<unknown | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    try {
      setStatus('connecting');
      const wsUrl = `${config.wsBaseUrl}/ws/${channel}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setLastMessage(parsed);
        } catch {
          setLastMessage(event.data);
        }
      };

      ws.onerror = () => {
        setStatus('error');
      };

      ws.onclose = () => {
        setStatus('disconnected');
      };

      socketRef.current = ws;
    } catch {
      setStatus('error');
    }
  }, [channel]);

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((data: unknown) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  }, []);

  return {
    status,
    lastMessage,
    sendMessage,
    reconnect: connect,
  };
}
