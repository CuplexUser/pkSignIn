import qrcode from "qrcode-generator";

/**
 * Renders the otpauth URI as an inline SVG on the server, so the page never requests an image
 * from anywhere and the secret never appears in a URL that could end up in a log or referrer.
 *
 * Error correction level M is the usual choice for otpauth URIs: enough redundancy to scan from
 * a screen, without inflating the module count to where the code gets hard to focus on.
 */
export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}
