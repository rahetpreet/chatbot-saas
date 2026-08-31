import QRCode from "qrcode";

export async function generateQRCodeDataUrl(url: string): Promise<string> {
  return await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 8,
    color: {
      dark: "#1e1b4b", // Dark indigo
      light: "#ffffff",
    },
  });
}

export async function generateQRCodeSVG(url: string): Promise<string> {
  return await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: {
      dark: "#1e1b4b",
      light: "#ffffff",
    },
  });
}
