// pdf-parse is loaded lazily (not at module top-level) so that if it hasn't been installed yet,
// only PDF-brief extraction fails with a clear error - the rest of the API (auth, clients, everything
// else) keeps working instead of the whole process crashing on boot.
export async function extractPdfText(buffer: Buffer): Promise<string> {
  let pdfParse: (data: Buffer) => Promise<{ text?: string }>;
  try {
    const pdfModule = await import("pdf-parse");
    pdfParse = pdfModule.default;
  } catch {
    throw new Error(
      "The 'pdf-parse' package is not installed on the server. Run `pnpm install` in the repo, then restart the API, to enable PDF brief uploads."
    );
  }
  const data = await pdfParse(buffer);
  return data.text ?? "";
}
