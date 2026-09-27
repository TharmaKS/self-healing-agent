import { WebSocketEventType } from '../../types/automation';

type Broadcast = (
  type: WebSocketEventType,
  payload: Record<string, unknown>,
  correlationIds?: Record<string, string>
) => void;

let broadcast: Broadcast = () => {};

export function setExecutionEventBroadcast(fn: Broadcast) {
  broadcast = fn;
}

export function emitExecutionEvent(
  type: WebSocketEventType,
  payload: Record<string, unknown>,
  correlationIds?: Record<string, string>
) {
  broadcast(type, payload, correlationIds);
}
