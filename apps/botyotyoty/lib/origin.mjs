export function originOf(c) {
  const env = (process.env.PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
  if (env) return env;
  const url = new URL(c.req.url);
  const forwardedProto = c.req.header('x-forwarded-proto');
  const forwardedHost = c.req.header('x-forwarded-host');
  const proto = (forwardedProto || url.protocol.replace(/:$/, '')).split(',')[0].trim();
  const host = (forwardedHost || c.req.header('host') || url.host).split(',')[0].trim();
  return `${proto}://${host}`;
}

export function clientIp(c) {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 80) || 'local';
  return (c.req.header('x-real-ip') || 'local').slice(0, 80);
}

export function allowedHostsFor(origin) {
  const hosts = new Set(['boty.synteq.app']);
  for (const value of [origin, process.env.PUBLIC_ORIGIN]) {
    if (!value) continue;
    try {
      hosts.add(new URL(value).hostname.toLowerCase());
    } catch {
      // Ignore a malformed origin. The request host is enough.
    }
  }
  return [...hosts];
}
