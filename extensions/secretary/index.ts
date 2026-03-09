/* eslint-disable @typescript-eslint/no-explicit-any */
import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import { createCalendarTool } from "./src/calendar-tool.js";
import { createNegotiationOfferHandler } from "./src/negotiation.js";
import { createOAuthInjectHandler, createPublicKeyHandler } from "./src/oauth-bridge.js";
import { createOrchestratorTool, registerProactiveHooks } from "./src/orchestrator.js";
import { createPrivacyTool } from "./src/privacy-tool.js";
import { createWhatsAppWebhookHandler, createShortcutTriggerHandler } from "./src/webhook.js";
import { createWhatsAppTool } from "./src/whatsapp-tool.js";

export default function register(api: OpenClawPluginApi) {
  console.log("[Secretary Extension] Registering plugin handlers...");
  // Cast as any: plugin tool factories use simplified execute(runId, params, ctx?) signature
  // which is normalized by pi-tool-definition-adapter.ts at runtime.
  api.registerTool(createCalendarTool(api) as any);
  api.registerTool(createOrchestratorTool(api) as any);
  api.registerTool(createPrivacyTool(api) as any);
  api.registerTool(createWhatsAppTool(api) as any);

  // Stage 3: Register proactive monitoring hooks (Lobster 🦞)
  registerProactiveHooks(api);

  // Register public webhook endpoint for Meta WhatsApp events
  api.registerHttpRoute({
    path: "/plugins/secretary/wa-webhook",
    handler: createWhatsAppWebhookHandler(api),
    auth: "plugin", // Public endpoint; implements its own verification if needed
    match: "exact",
  });

  // Phase 41C: Local trigger endpoint for Physical Action Integration (Shortcuts/Stream Deck)
  api.registerHttpRoute({
    path: "/plugins/secretary/trigger",
    handler: createShortcutTriggerHandler(api),
    auth: "plugin", // Allowed locally without token so automation tools can hit it directly
    match: "exact",
  });

  // Phase 28: Mobile-Edge OAuth Bridge
  api.registerHttpRoute({
    path: "/plugins/secretary/oauth-inject",
    handler: createOAuthInjectHandler(api),
    auth: "plugin", // Verify incoming requests via SAAS_BRIDGE_TOKEN
    match: "exact",
  });

  // Phase 29: Secure Tunnel Public Key
  api.registerHttpRoute({
    path: "/plugins/secretary/public-key",
    handler: createPublicKeyHandler(api),
    auth: "plugin", // Publically available for the Bridge
    match: "exact",
  });

  // Phase 31: Inter-Agent Negotiation Protocol
  api.registerHttpRoute({
    path: "/plugins/secretary/negotiate/offer",
    handler: createNegotiationOfferHandler(api),
    auth: "plugin", // Must be publicly reachable for P2P auth (payloads are RSA encrypted)
    match: "exact",
  });
}
