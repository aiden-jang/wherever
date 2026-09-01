/*
 * Whether this browser can read a QR from the camera.
 *
 * Its own module rather than an export beside the component, because a `.tsx` file that exports
 * anything other than components loses React Fast Refresh: vite reported
 * "Could not Fast Refresh (qrScanSupported export is incompatible)" and every edit to the scanner
 * became a full page reload.
 *
 * Two questions, not one. `BarcodeDetector` exists on some builds without the `qr_code` format, so
 * the interface being present is not the same as it being able to do the job.
 */
export async function qrScanSupported(): Promise<boolean> {
  const api = (window as unknown as {
    BarcodeDetector?: { getSupportedFormats: () => Promise<string[]> };
  }).BarcodeDetector;
  if (!api || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    return (await api.getSupportedFormats()).includes("qr_code");
  } catch {
    return false;
  }
}
