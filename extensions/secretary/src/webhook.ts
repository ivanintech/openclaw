import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";
import { SecretaryOrchestrator } from "./orchestrator.js";

const execFileAsync = promisify(execFile);

// Helper to read the JSON body from an IncomingMessage
async function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// Helper to download media from a URL
async function downloadMedia(url: string, destPath: string, bearerToken?: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (bearerToken) {
    headers["Authorization"] = `Bearer ${bearerToken}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(destPath, Buffer.from(arrayBuffer));
}

// Main Webhook Handler
export function createWhatsAppWebhookHandler(api: OpenClawPluginApi) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    // Only handle POST requests
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return true;
    }

    try {
      const payload = await readJsonBody(req);
      api.logger.info(
        `[webhook] Received WhatsApp payload: ${JSON.stringify(payload).substring(0, 100)}...`,
      );

      // WhatsApp Cloud API payload structure
      // { "entry": [ { "changes": [ { "value": { "messages": [ ... ] } } ] } ] }
      const entries = payload.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const messages = change.value?.messages || [];
          for (const message of messages) {
            const from = message.from;

            // Handle Audio Message (Voice Note)
            if (message.type === "audio" && message.audio?.id) {
              const audioId = message.audio.id;
              api.logger.info(`[webhook] Received audio message ${audioId} from ${from}`);

              // Process voice note asynchronously so we can quickly ack the webhook
              processVoiceNote(api, from, audioId).catch((err) => {
                api.logger.error(`[webhook] Voice-to-Task error: ${err}`);
              });
            } else if (message.type === "text") {
              // Handle normal text message if needed
              api.logger.info(`[webhook] Received text message from ${from}`);
            }
          }
        }
      }

      // Always return 200 OK immediately to WhatsApp/Meta
      res.statusCode = 200;
      res.end("OK");
    } catch (err) {
      api.logger.error(`[webhook] Error processing request: ${err}`);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }

    return true; // We handled the request
  };
}

async function processVoiceNote(api: OpenClawPluginApi, from: string, audioId: string) {
  // 1. Fetch Media URL from Meta
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const token = process.env.MATON_API_KEY;

  if (!phoneNumberId || !token) {
    throw new Error("Missing WA_PHONE_NUMBER_ID or token for media fetch");
  }

  const metaGraphUrl = `https://graph.facebook.com/v18.0/${audioId}`;
  const mediaRes = await fetch(metaGraphUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!mediaRes.ok) {
    throw new Error(`Meta API error fetching media ID ${audioId}: ${mediaRes.statusText}`);
  }

  const mediaData = await mediaRes.json();
  const mediaUrl = mediaData.url;

  if (!mediaUrl) {
    throw new Error(`No media URL returned for audio ID ${audioId}`);
  }

  // 2. Download Media File
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-audio-"));
  const audioFilePath = path.join(tempDir, `audio-${audioId}.ogg`);
  await downloadMedia(mediaUrl, audioFilePath, token);
  api.logger.info(`[webhook] Audio downloaded to ${audioFilePath}`);

  // 3. Transcribe with native STT
  let transcript = "";
  try {
    const result = await api.runtime.stt.transcribeAudioFile({
      filePath: audioFilePath,
      cfg: api.config,
    });
    transcript = result?.text?.trim() || "";
    if (!transcript) {
      throw new Error("No text transcribed from audio");
    }
  } catch (err: any) {
    api.logger.error(`[webhook] STT transcription failed: ${err.message}`);
    await fs.rm(tempDir, { recursive: true, force: true });
    return;
  }

  api.logger.info(`[webhook] Transcription (${transcript.length} chars): "${transcript}"`);

  // 4. Intent Routing
  // If short and imperative, trigger voice_command_executor
  // If long, trigger audio_summary
  const isShort = transcript.length < 80;
  const action = isShort ? "voice_command_executor" : "audio_summary";

  api.logger.info(`[webhook] Routing to ${action} for transcript: ${transcript}`);

  // Trigger the orchestrator asynchronously
  // Note: We use the orchestrator tool via the API if registered, or direct logic
  // For now, we log the intent to the session state so it's picked up
  const entry = isShort ? `[VOICE COMMAND] ${transcript}` : `[VOICE SUMMARY] ${transcript}`;

  // Log to session state via a future helper or the orchestrator
  api.logger.info(`[webhook] Voice intent captured: ${entry}`);

  // Clean up
  await fs.rm(tempDir, { recursive: true, force: true });
}

// Phase 41C: Physical Webhooks (Apple Shortcuts / Stream Deck)
export function createShortcutTriggerHandler(api: OpenClawPluginApi) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    // Only handle POST requests
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return true;
    }

    try {
      const payload = await readJsonBody(req);
      api.logger.info(`[webhook-trigger] Emulating physical action: ${payload.action}`);

      if (!payload.action) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing 'action' in payload" }));
        return true;
      }

      // Bypass LLM and talk directly to the hyper-capable orchestrator
      const orchestrator = new SecretaryOrchestrator(api);
      const result = await orchestrator.execute("webhook-physical", payload);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "success", result }));
    } catch (err: any) {
      api.logger.error(`[webhook-trigger] Action execution failed: ${err.message}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error", message: err.message }));
    }

    return true; // Request handled
  };
}
