export type ExtractedPdfText = {
  text: string
  pageCount: number
}

export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPdfText> {
  const pdfBytes = new Uint8Array(bytes)
  const fallbackText = extractReadableText(pdfBytes)

  try {
    return await extractWithPdfJs(new Uint8Array(pdfBytes))
  } catch {
    if (fallbackText.length > 0) {
      return {
        text: fallbackText,
        pageCount: 0,
      }
    }

    throw new Error("Could not extract text from the uploaded PDF")
  }
}

async function extractWithPdfJs(bytes: Uint8Array): Promise<ExtractedPdfText> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const loadingTask = getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ")
    pageTexts.push(text)
  }

  const text = pageTexts.join("\n\n").trim()
  if (text.length === 0) {
    throw new Error("PDF text extraction returned no text")
  }

  return {
    text,
    pageCount: pdf.numPages,
  }
}

function extractReadableText(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("utf8")
    .replace(/[^\t\n\r -~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
