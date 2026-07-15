export default function QrDisplay({ dataUrl, label, companyName = 'PT PecutAI International', from, to }) {
  function handlePrint() {
    const win = window.open('', '_blank');
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${label}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          }
          .qr-box {
            border: 2px solid #111;
            border-radius: 12px;
            padding: 40px 48px;
            text-align: center;
            width: 320px;
          }
          .company-name {
            font-size: 1.5rem;
            font-weight: 800;
            letter-spacing: -0.03em;
            margin-bottom: 24px;
            color: #111;
          }
          .qr-image {
            width: 200px;
            height: 200px;
            margin: 0 auto 24px;
            display: block;
          }
          .qr-label {
            font-size: 1rem;
            font-weight: 700;
            font-family: 'Courier New', monospace;
            margin-bottom: 20px;
            color: #111;
          }
          .route-info {
            border-top: 1px solid #ddd;
            padding-top: 16px;
            text-align: left;
            font-size: 0.875rem;
            color: #333;
            line-height: 1.8;
          }
          .route-info span {
            display: block;
          }
          .route-label {
            font-weight: 700;
            color: #111;
          }
          @media print {
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="qr-box">
          <div class="company-name">${companyName}</div>
          <img class="qr-image" src="${dataUrl}" alt="${label}" />
          <div class="qr-label">${label}</div>
          ${(from || to) ? `
          <div class="route-info">
            ${from ? `<span><span class="route-label">Dari:</span> ${from}</span>` : ''}
            ${to ? `<span><span class="route-label">Untuk:</span> ${to}</span>` : ''}
          </div>
          ` : ''}
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);
    win.document.close();
  }

  return (
    <div className="qr-card">
      <div className="company-name">{companyName}</div>
      <img src={dataUrl} alt={label} width={200} height={200} />
      <p>{label}</p>
      {(from || to) && (
        <div className="route-info">
          {from && <span>Dari: {from}</span>}
          {to && <span>Untuk: {to}</span>}
        </div>
      )}
      <button type="button" onClick={handlePrint}>
        Print
      </button>
    </div>
  );
}
