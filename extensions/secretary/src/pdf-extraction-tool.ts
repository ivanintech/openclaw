import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

export function createPdfExtractionTool(api: OpenClawPluginApi) {
  return {
    name: "secretary_pdf_extract",
    label: "Secretary PDF Extraction",
    description: "Extract text and images from PDF documents using OpenClaw's built-in PDF processing engine.",
    
    parameters: Type.Object({
      filePath: Type.String({
        description: "Path to the PDF file to extract content from.",
      }),
      maxPages: Type.Optional(Type.Number({
        description: "Maximum number of pages to process (default: process all pages).",
        default: 0,
        minimum: 1,
      })),
      maxPixels: Type.Optional(Type.Number({
        description: "Maximum dimension per extracted image (default: 2048).",
        default: 2048,
        minimum: 64,
        maximum: 10000,
      })),
      minTextChars: Type.Optional(Type.Number({
        description: "Minimum text characters required for successful extraction (default: 0).",
        default: 0,
        minimum: 0,
      })),
    }),

    async execute(runId: string, params: Record<string, any>) {
      try {
        const { filePath, maxPages = 0, maxPixels = 2048, minTextChars = 0 } = params;

        if (!filePath) {
          return {
            content: [{
              type: "text" as const,
              text: "⚠️ Se requiere un path al archivo PDF para extraer contenido."
            }],
          };
        }

        api.logger.info(`[pdf-extract-tool] Starting extraction for: ${filePath}`);

        // Read PDF file
        const fileBuffer = await import("node:fs/promises").then(fs => fs.readFile(filePath));

        // Use core's PDF extraction
        const result = await api.extractPdfContent({
          buffer: fileBuffer,
          maxPages,
          maxPixels,
          minTextChars,
          onImageExtractionError: (error: unknown) => {
            api.logger.warn(`[pdf-extract-tool] Image extraction error: ${error}`);
          },
        });

        const { text, images } = result;

        if (!text && images.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: "❌ No se pudo extraer contenido del PDF. Verifica que el archivo no esté corrupto o esté vacío."
            }],
            details: { filePath, error: "Failed PDF extraction - no content" },
          };
        }

        // Generate summary
        const summary = `
📄 **Extracción completada** 📁 ${filePath}

📝 **Texto extraído:** ${text.length} caracteres
🖼️ **Imágenes extraídas:** ${images.length} imágenes
        `.trim();

        api.logger.info(`[pdf-extract-tool] Successfully extracted PDF content from ${filePath}: ${text.length} chars, ${images.length} images`);

        return {
          content: [{
            type: "text" as const,
            text: summary
          }],
          details: { 
            filePath: params.filePath, 
            totalTextChars: text.length,
            totalImages: images.length
          },
          // Also include full text as a separate field for programmatic access
          fullText: text.trim()
        };

      } catch (error: any) {
        api.logger.error(`[pdf-extract-tool] Error extracting PDF: ${error.message}`);
        return {
          content: [{
            type: "text" as const,
            text: `❌ Error al extraer PDF: ${error.message}`
          }],
          details: { filePath: params.filePath, error: error.message },
        };
      }
    },
  };
}