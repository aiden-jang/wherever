// BarcodeDetector presence is insufficient: the browser must also support the qr_code format.
export async function qrScanSupported(): Promise<boolean> {
  const api = (
    window as unknown as {
      BarcodeDetector?: { getSupportedFormats: () => Promise<string[]> };
    }
  ).BarcodeDetector;
  if (!api || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    return (await api.getSupportedFormats()).includes("qr_code");
  } catch {
    return false;
  }
}
