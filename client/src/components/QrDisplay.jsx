export default function QrDisplay({ dataUrl, label }) {
  function handlePrint() {
    const win = window.open('', '_blank');
    win.document.write(`<img src="${dataUrl}" alt="${label}" onload="window.print()" />`);
  }

  return (
    <div>
      <img src={dataUrl} alt={label} width={200} height={200} />
      <button type="button" onClick={handlePrint}>
        Print
      </button>
    </div>
  );
}
