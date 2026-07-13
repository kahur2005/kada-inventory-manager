const QRCode = require('qrcode');

async function generateQrDataUrl(payload) {
  return QRCode.toDataURL(JSON.stringify(payload));
}

module.exports = { generateQrDataUrl };
