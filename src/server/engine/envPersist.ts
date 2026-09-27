const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

export function normalizeEnvName(raw: string): string {
  const name = (raw || '').trim().replace(/\s+/g, '_').toUpperCase();
  if (!ENV_NAME.test(name)) return name.replace(/[^A-Z0-9_]/g, '') || '';
  return name;
}
