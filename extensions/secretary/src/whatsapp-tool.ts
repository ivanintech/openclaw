import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";

const MATON_BASE = "https://gateway.maton.ai/whatsapp-business";

async function matonPost(phoneNumberId: string, apiKey: string, body: object): Promise<object> {
  const res = await fetch(`${MATON_BASE}/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Maton WA API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<object>;
}

export function createWhatsAppTool(api: OpenClawPluginApi) {
  const runtime = api.runtime;

  return {
    name: "secretary_whatsapp",
    label: "Secretary WhatsApp Business",
    description:
      "Send real WhatsApp Business messages via Maton API: plain text, interactive buttons (up to 3), or interactive list (up to 10 items).",
    parameters: Type.Object({
      action: Type.String({
        enum: ["send_text", "send_buttons", "send_list", "send_voice"],
        description: "Type of WA message to send.",
      }),
      to: Type.String({
        description: "Recipient phone number in international format without + (e.g. 34612345678).",
      }),
      body: Type.String({
        description: "Main message body text. For send_voice, this text is converted to audio.",
      }),
      buttons: Type.Optional(
        Type.Array(Type.String(), {
          description: "Button labels (max 3, for send_buttons).",
          maxItems: 3,
        }),
      ),
      listHeader: Type.Optional(Type.String({ description: "Header text for list message." })),
      listButtonLabel: Type.Optional(
        Type.String({
          description: "The CTA button label that opens the list (default: 'Ver opciones').",
        }),
      ),
      listSections: Type.Optional(
        Type.Array(
          Type.Object({
            title: Type.String(),
            rows: Type.Array(
              Type.Object({
                id: Type.String(),
                title: Type.String(),
                description: Type.Optional(Type.String()),
              }),
            ),
          }),
          { description: "Sections for list message (max 10 rows total, for send_list)." },
        ),
      ),
    }),

    async execute(_runId: string, params: Record<string, any>) {
      const apiKey = process.env.MATON_API_KEY;
      const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

      if (!apiKey) {
        return {
          content: [
            {
              type: "text" as const,
              text: "⚠️ `MATON_API_KEY` no configurada. WhatsApp Business no disponible.",
            },
          ],
        };
      }
      if (!phoneNumberId) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "⚠️ `WA_PHONE_NUMBER_ID` no configurada.\n" +
                "Añade tu Phone Number ID de Meta en las variables de entorno.",
            },
          ],
        };
      }

      if (params.action === "send_text") {
        const result = await matonPost(phoneNumberId, apiKey, {
          messaging_product: "whatsapp",
          to: params.to,
          type: "text",
          text: { body: params.body },
        });
        return {
          content: [{ type: "text" as const, text: `✅ Mensaje enviado a ${params.to}` }],
          details: { result },
        };
      }

      if (params.action === "send_buttons") {
        const buttons: string[] = params.buttons ?? [];
        if (buttons.length === 0 || buttons.length > 3) {
          throw new Error("send_buttons requires 1–3 button labels.");
        }
        const result = await matonPost(phoneNumberId, apiKey, {
          messaging_product: "whatsapp",
          to: params.to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: params.body },
            action: {
              buttons: buttons.map((label: string, i: number) => ({
                type: "reply",
                reply: { id: `btn_${i}`, title: label },
              })),
            },
          },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Mensaje con botones enviado a ${params.to}\nBotones: ${buttons.join(" | ")}`,
            },
          ],
          details: { result },
        };
      }

      if (params.action === "send_list") {
        const sections = params.listSections ?? [];
        if (sections.length === 0) {
          throw new Error("send_list requires at least one section with rows.");
        }
        const result = await matonPost(phoneNumberId, apiKey, {
          messaging_product: "whatsapp",
          to: params.to,
          type: "interactive",
          interactive: {
            type: "list",
            header: params.listHeader ? { type: "text", text: params.listHeader } : undefined,
            body: { text: params.body },
            action: {
              button: params.listButtonLabel ?? "Ver opciones",
              sections,
            },
          },
        });
        return {
          content: [{ type: "text" as const, text: `✅ Mensaje con lista enviado a ${params.to}` }],
          details: { result },
        };
      }

      if (params.action === "send_voice") {
        const result_tts = await runtime.tts.textToSpeech({
          text: params.body,
          cfg: api.config,
        });

        if (!result_tts.success || !result_tts.audioPath) {
          throw new Error(`TTS failed: ${result_tts.error}`);
        }

        api.logger.info(`[whatsapp-tool] TTS generated at ${result_tts.audioPath}`);

        // Maton expects a publicly accessible URL for media.
        // In a local environment, this requires a media proxy.
        // For now, we send the intent and log the local file path.
        const result = await matonPost(phoneNumberId, apiKey, {
          messaging_product: "whatsapp",
          to: params.to,
          type: "text",
          text: {
            body: `🎙️ [Respuesta de Voz]: ${params.body}\n(Audio generado localmente en: ${result_tts.audioPath})`,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Respuesta de voz enviada (como texto con referencia local) a ${params.to}`,
            },
          ],
          details: { result, localAudioPath: result_tts.audioPath },
        };
      }

      throw new Error(`Unknown action: ${params.action}`);
    },
  };
}
