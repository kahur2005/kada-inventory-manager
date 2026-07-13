import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QrDisplay from '../components/QrDisplay';

describe('QrDisplay', () => {
  test('renders the QR image and opens a print window on click', () => {
    const writeMock = vi.fn();
    const openMock = vi.fn().mockReturnValue({ document: { write: writeMock } });
    vi.stubGlobal('open', openMock);

    render(<QrDisplay dataUrl="data:image/png;base64,ABC" label="Box BX-0001" />);

    expect(screen.getByAltText('Box BX-0001')).toHaveAttribute('src', 'data:image/png;base64,ABC');

    fireEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(openMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('data:image/png;base64,ABC'));

    vi.unstubAllGlobals();
  });
});
