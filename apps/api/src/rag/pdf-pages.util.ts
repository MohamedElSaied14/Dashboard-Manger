/**
 * Page-aware PDF text extraction.
 *
 * The existing extractPdfText() returns one flat string, which is fine for stuffing a whole brief
 * into a prompt but loses the page numbers that make a retrieved answer checkable. pdf-parse lets
 * a `pagerender` hook see each page as pdf.js lays it out, so the pages are collected there.
 *
 * pdf-parse is still imported lazily so a missing install only breaks PDF ingest, not the API.
 */
export interface PdfExtraction {
  pages: string[];
  text: string;
}

export async function extractPdfPages(buffer: Buffer): Promise<PdfExtraction> {
  let pdfParse: (data: Buffer, options?: Record<string, unknown>) => Promise<{ text?: string; numpages?: number }>;
  try {
    const pdfModule = await import("pdf-parse");
    pdfParse = pdfModule.default as any;
  } catch {
    throw new Error(
      "The 'pdf-parse' package is not installed on the server. Run `pnpm install` in the repo, then restart the API, to enable PDF uploads.",
    );
  }

  const pages: string[] = [];
  const result = await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const content = await pageData.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      // pdf.js emits positioned runs; `hasEOL` is the only reliable line break signal.
      let pageText = "";
      for (const item of content.items ?? []) {
        pageText += item.str ?? "";
        pageText += item.hasEOL ? "\n" : " ";
      }
      pages.push(pageText.trim());
      return pageText;
    },
  });

  // If pagerender never ran (older pdf-parse builds), fall back to the flat text as one page.
  if (pages.length === 0 && result.text) pages.push(result.text);

  return { pages, text: pages.join("\n\n") };
}
