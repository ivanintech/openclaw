import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const execFileAsync = promisify(execFile);

/**
 * Heuristic/placeholder function for data extraction (traditionally an LLM call).
 */
export async function extractFinancialData(
  text: string,
): Promise<{ amount?: string; deadline?: string; type: string }> {
  try {
    const amountMatch = text.match(/(Total|Importe|Monto|Amount|EUR|€|USD|\$)\s*[:\s]*([\d.,]+)/i);
    const dateMatch = text.match(
      /(Vencimiento|Due Date|Fecha Limite|Deadline|Vence)\s*[:\s]*([\d\/\-]+)/i,
    );

    return {
      amount: amountMatch ? amountMatch[2] : undefined,
      deadline: dateMatch ? dateMatch[2] : undefined,
      type:
        text.toLowerCase().includes("factura") || text.toLowerCase().includes("invoice")
          ? "Invoice"
          : "Other",
    };
  } catch {
    return { type: "Unknown" };
  }
}
