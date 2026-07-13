import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import QrScanner from '../components/QrScanner';

let startArgs;
let stopMock;
let clearMock;
let startMock;

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn(function() {
    startMock = vi.fn((...args) => {
      startArgs = args;
      return Promise.resolve();
    });
    stopMock = vi.fn().mockResolvedValue(undefined);
    clearMock = vi.fn();

    return {
      start: startMock,
      stop: stopMock,
      clear: clearMock,
    };
  }),
}));

describe('QrScanner', () => {
  beforeEach(() => {
    startArgs = undefined;
    vi.clearAllMocks();
  });

  test('starts the scanner with the back camera and forwards decoded text to onScan', async () => {
    const onScan = vi.fn();
    render(<QrScanner onScan={onScan} />);
    await Promise.resolve();
    await Promise.resolve();

    expect(startArgs[0]).toEqual({ facingMode: 'environment' });
    const successCallback = startArgs[2];
    successCallback('{"type":"box","id":"1","token":"tok"}');
    expect(onScan).toHaveBeenCalledWith('{"type":"box","id":"1","token":"tok"}');
  });

  test('stops and clears the scanner on unmount', async () => {
    const { unmount } = render(<QrScanner onScan={vi.fn()} />);
    await Promise.resolve();
    await Promise.resolve();
    unmount();
    expect(stopMock).toHaveBeenCalled();
  });
});
