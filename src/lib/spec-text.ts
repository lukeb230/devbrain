// Normalize any dropped context doc into markdown text, once, at ingest.
// Everything downstream (analysis, re-analysis) reads only the stored text —
// so no storage bucket, no binaries in Postgres, no PDF-parser dependency.

import { agentConfigured, askClaudeBlocks, PDF_TO_MARKDOWN_SYSTEM } from "@/lib/agent";

export const MAX_BODY_CHARS = 200_000;

export type SourceKind = "md" | "txt" | "html" | "pdf" | "paste";

export function kindFor(fileName: string): SourceKind {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".html") || n.endsWith(".htm")) return "html";
  if (n.endsWith(".md") || n.endsWith(".markdown")) return "md";
  return "txt";
}

/** Strip an HTML document down to readable text (scripts/styles removed,
 *  block tags become line breaks, entities decoded for the common cases). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/(p|div|section|li|h[1-6]|tr|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<h1[^>]*>/gi, "\n# ")
    .replace(/<h2[^>]*>/gi, "\n## ")
    .replace(/<h3[^>]*>/gi, "\n### ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** PDFs go to Claude as a native document block and come back as markdown —
 *  which also means diagrams, mockups, and screenshots get described. */
export async function pdfToMarkdown(base64: string): Promise<string> {
  if (!agentConfigured()) {
    throw new Error("PDF ingest needs an API key — paste the text instead, or upload .md/.txt/.html");
  }
  return askClaudeBlocks(
    PDF_TO_MARKDOWN_SYSTEM,
    [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: "Transcribe this document to markdown." },
    ],
    8000,
  );
}

/** A readable title when the doc doesn't get one from the extractor yet. */
export function fallbackTitle(fileName: string | null, body: string): string {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 120);
  if (fileName) return fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, " ").slice(0, 120);
  return body.trim().split("\n")[0]?.slice(0, 80) || "Untitled context";
}
