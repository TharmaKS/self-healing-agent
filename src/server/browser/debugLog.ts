import fs from 'fs';
import path from 'path';

const LOG_FILE = path.resolve(process.cwd(), 'debug-928203.log');
const INGEST = 'http://127.0.0.1:7381/ingest/7becfd9a-4ce5-4dff-b216-e15d9ec91894';

export function debugLog(hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  const payload = {
    sessionId: '928203',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(payload) + '\n');
  } catch {
    // ignore disk errors
  }
  fetch(INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '928203' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
