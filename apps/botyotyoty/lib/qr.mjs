import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode');

export async function qrSvg(text) {
  const raw = await QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#221c16', light: '#fffaf3' },
  });
  const svg = String(raw).replace(/<\?xml[^?]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/g, '').trim();
  if (!svg.startsWith('<svg') || /<script|foreignObject|javascript:/i.test(svg)) {
    throw new Error('unexpected qr markup');
  }
  return svg.replace('<svg ', '<svg class="qr-svg" role="img" aria-label="QR code for this profile" ');
}
