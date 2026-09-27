import http from 'http';
import https from 'https';

export async function probeUrl(
  rawUrl: string,
  timeoutMs = 5000
): Promise<{ reachable: boolean; detail: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { reachable: false, detail: `Registered URL is invalid: ${rawUrl}` };
  }

  if (!/^https?:$/i.test(url.protocol)) {
    return { reachable: false, detail: `URL must be http or https: ${rawUrl}` };
  }

  return new Promise((resolve) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}` || '/',
        method: 'GET',
        timeout: timeoutMs,
        rejectUnauthorized: false,
      },
      (res) => {
        res.resume();
        resolve({ reachable: true, detail: `HTTP ${res.statusCode}` });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({
        reachable: false,
        detail: `Timed out reaching ${rawUrl}. Confirm the local app is running.`,
      });
    });
    req.on('error', (err) => {
      const refused = /ECONNREFUSED/i.test(err.message);
      resolve({
        reachable: false,
        detail: refused
          ? `Nothing is listening at ${rawUrl}. Start that local app, then launch again.`
          : `Cannot reach ${rawUrl}: ${err.message}`,
      });
    });
    req.end();
  });
}

export function describeBrowserError(err: unknown, url: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(raw)) {
    return `Nothing is listening at ${url}. Start the local app first, then select it again.`;
  }
  if (/ERR_CONNECTION_RESET/i.test(raw)) {
    return `${url} reset the connection. Confirm the app is serving HTTP on that port.`;
  }
  if (/ERR_NAME_NOT_RESOLVED/i.test(raw)) {
    return `Cannot resolve host for ${url}. Check the registered URL.`;
  }
  if (/Timeout/i.test(raw)) {
    return `Timed out opening ${url}. Wait for the local UI to finish starting, then retry.`;
  }
  return raw;
}