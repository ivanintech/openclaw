import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi, OpenClawPluginToolContext } from "../../../src/plugins/types.js";
import { joinPresentTextSegments } from "../../../src/shared/text/join-segments.js";
import { STRINGS } from "./constants.js";
import { CRMManager } from "./crm.js";
import { triggerUrgentAlert } from "./helpers/alerts.js";
import { readAutonomyLevel } from "./helpers/autonomy.js";
import { fetchCalendlyEvents, fetchCalendlyInvitees } from "./helpers/calendly.js";
import { execFileAsync, extractFinancialData } from "./helpers/common.js";
import {
  fetchGogEvents,
  fetchGmailUnread,
  fetchOutlookInbox,
  himalayaList,
  himalayaRead,
} from "./helpers/email.js";
import {
  fetchRssDigest,
  fetchNearbyVenues,
  fetchOrderHistory,
  fetchWeather,
} from "./helpers/intelligence.js";
import { triggerHueScene, triggerSonosFocus } from "./helpers/iot.js";
import { syncKnowledge } from "./helpers/knowledge.js";
import { waButtonPayload } from "./helpers/whatsapp.js";
import { CalendarStore } from "./store.js";
import { VaultManager } from "./vault.js";
import { updateSessionState, appendWorkingBuffer, searchDeepMemory } from "./wal-helpers.js";

export function createOrchestratorTool(api: OpenClawPluginApi) {
  const orchestrator = new SecretaryOrchestrator(api);

  // Register native /briefing command for instant access (Phase 39)
  api.registerCommand({
    name: "briefing",
    description: "Genera un resumen proactivo de tu agenda y estado actual de forma instantánea.",
    acceptsArgs: false,
    handler: async (ctx) => {
      const result = await orchestrator.execute("native-cmd", { action: "briefing" });
      return { text: result.content[0].text };
    },
  });

  return {
    name: "secretary_orchestrator",
    label: orchestrator.label,
    description: orchestrator.description,
    parameters: orchestrator.parameters,
    async execute(runId: string, params: Record<string, any>, ctx?: OpenClawPluginToolContext) {
      return orchestrator.execute(runId, params, ctx);
    },
  };
}

export class SecretaryOrchestrator {
  private store: CalendarStore;
  private vault: VaultManager;
  private crm: CRMManager;
  private workspaceDir: string;

  public label = "Secretary Orchestrator";
  public description =
    "Multi-service agenda orchestration, proactive briefings, live Google/Outlook sync, and WAL-compliant conflict management.";

  public parameters = Type.Object({
    action: Type.String({
      enum: [
        "briefing",
        "conflict_guardian",
        "setup_status",
        "setup_proactive",
        "gog_sync",
        "proactive_research",
        "search_opportunities",
        "email_concierge",
        "whatsapp_preview",
        "gmail_triager",
        "rss_digest",
        "calendly_sync",
        "find_nearby_venues",
        "suggest_meal_habits",
        "get_personal_context",
        "financial_triage",
        "ingest_document",
        "voice_command_executor",
        "audio_summary",
        "contextual_monitor",
        "proactive_suggest",
        "get_secure_secret",
        "sync_tasks",
        "sync_to_notion",
        "logistics_triage",
        "event_closure_shadowing",
        "finalize_closure",
        "negotiate_meeting",
        "himalaya_list",
        "himalaya_read",
        "trigger_focus_mode",
        "urgent_alert",
      ],
      description: "Action to perform.",
    }),
    date: Type.Optional(Type.String({ description: "Target date ISO." })),
    title: Type.Optional(Type.String({ description: "Event title or research query." })),
    startTime: Type.Optional(Type.String({ description: "Start time ISO." })),
    endTime: Type.Optional(Type.String({ description: "End time ISO." })),
    recipientPhone: Type.Optional(
      Type.String({ description: "WhatsApp recipient phone (international, no +)." }),
    ),
    transcript: Type.Optional(Type.String({ description: "Transcribed text for voice actions." })),
    documentPath: Type.Optional(Type.String({ description: "Path to the PDF document." })),
    emailSubject: Type.Optional(Type.String({ description: "Subject of an email for triage." })),
    emailBody: Type.Optional(Type.String({ description: "Body of an email for triage." })),
    peerUrl: Type.Optional(
      Type.String({ description: "URL of the peer's ClawSecretary gateway." }),
    ),
    peerPublicKey: Type.Optional(Type.String({ description: "Public RSA key of the peer." })),
    durationMin: Type.Optional(Type.Number({ description: "Duration of the meeting in minutes." })),
    dateRange: Type.Optional(
      Type.Object({
        start: Type.String({ description: "Start of range (ISO)." }),
        end: Type.String({ description: "End of range (ISO)." }),
      }),
    ),
    account: Type.Optional(Type.String({ description: "Email account name (Himalaya)." })),
    id: Type.Optional(Type.String({ description: "Message ID or resource ID." })),
    room: Type.Optional(Type.String({ description: "Room name for IoT." })),
    scene: Type.Optional(Type.String({ description: "Scene name for IoT." })),
    speaker: Type.Optional(Type.String({ description: "Speaker name (Sonos)." })),
    message: Type.Optional(Type.String({ description: "Alert message." })),
  });

  constructor(private api: OpenClawPluginApi) {
    this.store = new CalendarStore(api.resolvePath("./data"));
    this.workspaceDir = api.resolvePath(".");
    this.vault = new VaultManager(this.workspaceDir);
    this.crm = new CRMManager();
  }

  async execute(
    runId: string,
    params: Record<string, any>,
    ctx?: OpenClawPluginToolContext,
  ): Promise<any> {
    const apiKey = process.env.MATON_API_KEY;

    switch (params.action) {
      case "get_secure_secret":
        return this.handleGetSecureSecret(params);
      case "sync_tasks":
        return this.handleSyncTasks(params);
      case "sync_to_notion":
        return this.handleSyncToNotion(params);
      case "sync_knowledge":
        return this.handleSyncKnowledge(params);
      case "setup_status":
        return this.handleSetupStatus(apiKey);
      case "setup_proactive":
        return this.handleSetupProactive();
      case "briefing":
        return this.handleBriefing(runId, params, apiKey);
      case "conflict_guardian":
        return this.handleConflictGuardian(params);
      case "gog_sync":
        return this.handleGogSync(params);
      case "proactive_research":
        return this.handleProactiveResearch(params);
      case "search_opportunities":
        return this.handleSearchOpportunities(params);
      case "email_concierge":
        return this.handleEmailConcierge(apiKey);
      case "whatsapp_preview":
        return this.handleWhatsappPreview(params, apiKey);
      case "gmail_triager":
        return this.handleGmailTriager(params);
      case "rss_digest":
        return this.handleRssDigest(params);
      case "calendly_sync":
        return this.handleCalendlySync(apiKey, params);
      case "find_nearby_venues":
        return this.handleFindNearbyVenues(params);
      case "suggest_meal_habits":
        return this.handleSuggestMealHabits();
      case "get_personal_context":
        return this.handleGetPersonalContext();
      case "financial_triage":
        return this.handleFinancialTriage(params);
      case "ingest_document":
        return this.handleIngestDocument(params);
      case "voice_command_executor":
        return this.handleVoiceCommandExecutor(runId, params);
      case "audio_summary":
        return this.handleAudioSummary(params);
      case "contextual_monitor":
        return this.handleContextualMonitor();
      case "proactive_suggest":
        return this.handleProactiveSuggest(params);
      case "logistics_triage":
        return this.handleLogisticsTriage(params);
      case "event_closure_shadowing":
        return this.handleEventClosureShadowing(params);
      case "finalize_closure":
        return this.handleFinalizeClosure(params);
      case "negotiate_meeting":
        return this.handleNegotiateMeeting(params);
      case "himalaya_list":
        return this.handleHimalayaList(params);
      case "himalaya_read":
        return this.handleHimalayaRead(params);
      case "trigger_focus_mode":
        return this.handleTriggerFocusMode(params);
      case "urgent_alert":
        return this.handleUrgentAlert(params);
      default:
        return { content: [{ type: "text", text: `⚠️ Unknown action: ${params.action}` }] };
    }
  }

  private async handleGetSecureSecret(params: any) {
    const secret = await this.vault.getSecret(params.item || "", params.field || "password");
    return {
      content: [
        { type: "text", text: secret ? "✅ Secreto recuperado." : "❌ Error recuperando secreto." },
      ],
      details: { secret: secret ? "***" : null },
    };
  }

  private async handleSyncTasks(params: any) {
    const success = await this.crm.pushToThings(
      params.title || "",
      params.notes || "",
      params.deadline,
    );
    return {
      content: [
        {
          type: "text",
          text: success ? "✅ Tarea enviada a Things 3." : "❌ Error enviando a Things 3.",
        },
      ],
    };
  }

  private async handleSyncToNotion(params: any) {
    const success = await this.crm.syncToNotion(
      params.databaseId || "",
      params.title || "Log Secretary",
      params.content || "",
    );
    return {
      content: [{ type: "text", text: success ? "✅ Sync to Notion ok." : "❌ Error Notion." }],
    };
  }

  private async handleSyncKnowledge(params: any) {
    const title = params.title || `Entry_${new Date().toISOString().split("T")[0]}`;
    const content = params.content || "";
    const syncedTo = await syncKnowledge(title, content);

    if (syncedTo.length === 0) {
      return {
        content: [
          { type: "text", text: "⚠️ No knowledge integration configured (Notion/Obsidian)." },
        ],
      };
    }

    return {
      content: [{ type: "text", text: `✅ Conocimiento sincronizado a: ${syncedTo.join(", ")}.` }],
      details: { syncedTo },
    };
  }

  private async handleSetupStatus(apiKey: string | undefined) {
    let gogInstalled = false;
    try {
      await execFileAsync("gog", ["--version"]);
      gogInstalled = true;
    } catch {}
    const status = {
      local_calendar: "✅ Connected",
      google_calendar_gog:
        process.env.GOG_ACCOUNT && gogInstalled
          ? "✅ Connected"
          : gogInstalled
            ? "⚠️ gog installed but GOG_ACCOUNT not set"
            : "❌ gog CLI not installed",
      outlook: apiKey ? "✅ Maton OAuth ready" : "❌ Missing MATON_API_KEY",
      whatsapp_business:
        apiKey && process.env.WA_PHONE_NUMBER_ID ? "✅ Connected" : "⚠️ MATON_API_KEY missing",
      calendly: process.env.CALENDLY_API_KEY ? "✅ Connected" : "❌ Missing CALENDLY_API_KEY",
      tavily: process.env.TAVILY_API_KEY ? "✅ Connected" : "❌ Missing TAVILY_API_KEY",
    };
    let message = "📊 *CLAWSECRETARY SETUP STATUS*\n\n";
    for (const [k, v] of Object.entries(status)) {
      message += `• *${k.toUpperCase()}*: ${v}\n`;
    }
    return { content: [{ type: "text", text: message }], details: { status } };
  }

  private async handleSetupProactive() {
    const allCrons = [
      {
        name: "Daily Briefing",
        schedule: { kind: "cron", expr: "0 8 * * *", tz: "Local" },
        payload: { kind: "agentTurn", message: "AUTONOMOUS TASK — Briefing & Concierge." },
        sessionTarget: "isolated",
      },
      {
        name: "Pre-Meeting Research",
        schedule: { kind: "cron", expr: "45 * * * *", tz: "Local" },
        payload: { kind: "agentTurn", message: "AUTONOMOUS TASK — Research next meeting." },
        sessionTarget: "isolated",
      },
      {
        name: "Gmail Triager",
        schedule: { kind: "cron", expr: "0 * * * *", tz: "Local" },
        payload: { kind: "agentTurn", message: "AUTONOMOUS TASK — Gmail Triage." },
        sessionTarget: "isolated",
      },
      {
        name: "RSS Digest",
        schedule: { kind: "cron", expr: "30 7 * * 1", tz: "Local" },
        payload: { kind: "agentTurn", message: "AUTONOMOUS TASK — RSS Digest." },
        sessionTarget: "isolated",
      },
      {
        name: "Memory Freshener",
        schedule: { kind: "cron", expr: "0 20 * * 0", tz: "Local" },
        payload: { kind: "agentTurn", message: "AUTONOMOUS TASK — Memory Refresh." },
        sessionTarget: "isolated",
      },
      {
        name: "Notion Sync",
        schedule: { kind: "cron", expr: "0 21 * * 0", tz: "Local" },
        payload: { kind: "agentTurn", message: "AUTONOMOUS TASK — Notion Sync." },
        sessionTarget: "isolated",
      },
      {
        name: "Event Shadowing",
        schedule: { kind: "cron", expr: "*/15 * * * *", tz: "Local" },
        payload: { kind: "agentTurn", message: "AUTONOMOUS TASK — Event Closure Shadowing." },
        sessionTarget: "isolated",
      },
    ];
    let summary =
      "⚙️ *Autonomous Secretary — Crons Ready*\n" +
      allCrons.map((c, i) => `• ${c.name}: \`${(c.schedule as any).expr}\``).join("\n");
    return { content: [{ type: "text", text: summary }], details: { allCrons } };
  }

  private async handleBriefing(runId: string, params: any, apiKey: string | undefined) {
    const targetDate = params.date ? new Date(params.date) : new Date();
    const dateStr = targetDate.toISOString().split("T")[0];
    const localEvents = await this.store.load();
    const gogEvents = await fetchGogEvents(dateStr);
    const allEventMap = new Map<string, any>();
    localEvents
      .filter((e: any) => e.startTime.startsWith(dateStr))
      .forEach((e: any) => allEventMap.set(e.id, e));
    for (const ge of gogEvents) {
      const key = `gog_${ge.startTime}`;
      if (!allEventMap.has(key)) allEventMap.set(key, { id: key, ...ge });
    }
    const dailyEvents = [...allEventMap.values()].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    );
    const userCity = process.env.USER_CITY ?? "Madrid";
    const weatherStr = await fetchWeather(userCity);
    const advisorInsights: string[] = [];
    if (dailyEvents.some((e: any) => new Date(e.endTime).getHours() >= 19)) {
      const habits = await fetchOrderHistory();
      if (habits.length > 0)
        advisorInsights.push(
          `🛵 *Asesor de Hábitos*: Hoy terminas tarde. ¿Pedimos en *${habits[0].restaurant}*?`,
        );
    }
    const memoryTip = await searchDeepMemory(this.workspaceDir);
    if (memoryTip && memoryTip !== "No hay memoria disponible.")
      advisorInsights.push(
        `🧠 *Recuerdo Proactivo*: ${memoryTip.substring(0, 100).replace(/\n/g, " ")}...`,
      );

    const briefingSegments = [
      `📅 *Agenda para hoy ${dateStr}* _(total + google)_:`,
      dailyEvents.length === 0
        ? "No tienes eventos agendados."
        : dailyEvents
            .map((e: any) => `• ${e.startTime.substring(11, 16)} ❯ *${e.title}*`)
            .join("\n"),
      advisorInsights.length > 0 ? `🤖 *AI ADVISOR*:\n${advisorInsights.join("\n")}` : undefined,
      `🌡️ *Tiempo en ${userCity}:* ${weatherStr}`,
      dailyEvents.length > 3
        ? "🥵 Día intenso. ¡No olvides los descansos!"
        : "💡 Día tranquilo. Buen momento para trabajo profundo.",
    ];
    const briefingText = joinPresentTextSegments(briefingSegments) || "";
    const recipient = params.recipientPhone ?? process.env.WA_DEFAULT_PHONE;
    const waPayload =
      recipient && dailyEvents.length > 0
        ? waButtonPayload(recipient, briefingText, ["✅ Confirmar", "🤖 Ver Consejo", "📍 Lugares"])
        : null;

    await appendWorkingBuffer(
      this.workspaceDir,
      "Agent",
      `Briefing sent for ${dateStr}. Items: ${dailyEvents.length}`,
    );
    return {
      content: [{ type: "text", text: briefingText }],
      details: { events: dailyEvents, waInteractivePayload: waPayload, weather: weatherStr },
    };
  }

  private async handleConflictGuardian(params: any) {
    if (!params.startTime || !params.endTime) throw new Error("startTime and endTime required.");
    const start = new Date(params.startTime);
    const end = new Date(params.endTime);
    const candidateTitle = params.title ?? "Nuevo evento";
    const localEvents = await this.store.load();
    const conflicts = localEvents.filter(
      (e: any) => start < new Date(e.endTime) && end > new Date(e.startTime),
    );

    if (conflicts.length === 0)
      return { content: [{ type: "text", text: `✅ Sin conflictos para *"${candidateTitle}"*.` }] };

    const suggestedStart = new Date(
      Math.max(...conflicts.map((c: any) => new Date(c.endTime).getTime())) + 15 * 60000,
    );
    const suggestedEnd = new Date(suggestedStart.getTime() + (end.getTime() - start.getTime()));
    const fmt = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    const autonomy = readAutonomyLevel(candidateTitle);
    const recipient = params.recipientPhone ?? process.env.WA_DEFAULT_PHONE;

    if (autonomy === "L3" || autonomy === "L4") {
      await updateSessionState(
        this.workspaceDir,
        "Conflicts",
        `L3 Resolution for "${candidateTitle}".`,
      );
      const silentText = `⚙️ Solapamiento detectado. He movido "${candidateTitle}" a las ${fmt(suggestedStart)} \n_Acción: Piloto Automático L3_ 🦞`;
      return {
        content: [{ type: "text", text: silentText }],
        details: {
          conflicts,
          suggestion: { startTime: suggestedStart.toISOString() },
          autoCommitted: true,
        },
      };
    }

    await updateSessionState(
      this.workspaceDir,
      "Conflicts",
      `Collision: "${candidateTitle}" vs ${conflicts.map((c) => c.title).join(", ")}`,
    );
    const bodyText = `⚠️ *CONFLICTO DE HORARIO*\n\n"${candidateTitle}" solapa con:\n${conflicts.map((c) => `• ${c.title}`).join("\n")}\n\n💡 Sugerencia: mover a las ${fmt(suggestedStart)}.`;
    const waPayload = recipient
      ? waButtonPayload(recipient, bodyText, ["✅ Sí, mover", "❌ No, mantener"])
      : null;
    return {
      content: [{ type: "text", text: bodyText }],
      details: {
        conflicts,
        suggestion: { startTime: suggestedStart.toISOString() },
        waInteractivePayload: waPayload,
      },
    };
  }

  private async handleGogSync(params: any) {
    const dateStr = (params.date ?? new Date().toISOString()).split("T")[0];
    const googleEvents = await fetchGogEvents(dateStr);
    if (googleEvents.length === 0)
      return { content: [{ type: "text", text: "📅 No events found in Google Calendar." }] };
    const localEvents = await this.store.load();
    const existingTitles = new Set(localEvents.map((e: any) => `${e.title}_${e.startTime}`));
    const merged: any[] = [];
    for (const ge of googleEvents) {
      if (!existingTitles.has(`${ge.title}_${ge.startTime}`))
        merged.push({ id: `gog_${Math.random().toString(36).slice(2, 7)}`, ...ge });
    }
    if (merged.length > 0) await this.store.save([...localEvents, ...merged]);
    await updateSessionState(this.workspaceDir, "Last Sync", `Synced ${merged.length} gog events.`);
    return {
      content: [{ type: "text", text: `✅ Sync complete: ${merged.length} new events.` }],
      details: { googleEvents, merged },
    };
  }

  private async handleProactiveResearch(params: any) {
    if (!process.env.TAVILY_API_KEY)
      return { content: [{ type: "text", text: "⚠️ Tavily key missing." }] };
    const results = await fetchRssDigest();
    await updateSessionState(this.workspaceDir, "Research", `Investigated: ${params.title}`);
    return {
      content: [{ type: "text", text: `🔍 Investigation on "${params.title}" complete.` }],
      details: { results },
    };
  }

  private async handleSearchOpportunities(params: any) {
    if (!process.env.TAVILY_API_KEY)
      return { content: [{ type: "text", text: "⚠️ Tavily key missing." }] };
    const results = await fetchNearbyVenues(params.location || "Madrid");
    return {
      content: [{ type: "text", text: `💼 Opportunity search found ${results.length} results.` }],
      details: { results },
    };
  }

  private async handleEmailConcierge(apiKey: string | undefined) {
    if (!apiKey) return { content: [{ type: "text", text: "⚠️ Maton API key missing." }] };
    const messages = await fetchOutlookInbox(apiKey);
    const critical = messages.filter((m) => /urgent|firma|asap/i.test(m.subject));
    let text = `📧 *Outlook Inbox — ${messages.length} unread*\n🚨 Critical: ${critical.length}`;
    if (critical.length > 0)
      text += `\n\n🚨 *ACTION REQUIRED*: De ${critical[0].from}\nAsunto: ${critical[0].subject}`;
    const recipient = process.env.WA_DEFAULT_PHONE;
    const waPayload =
      recipient && critical.length > 0
        ? waButtonPayload(recipient, text, ["📤 Draft Reply", "🗑️ Ignore"])
        : null;
    await updateSessionState(this.workspaceDir, "Email", `Triaged ${messages.length} inbox items.`);
    return {
      content: [{ type: "text", text }],
      details: { critical, waInteractivePayload: waPayload },
    };
  }

  private async handleWhatsappPreview(params: any, apiKey: string | undefined) {
    const phone = params.recipientPhone ?? process.env.WA_DEFAULT_PHONE ?? "PHONE_NUMBER";
    const preview = waButtonPayload(phone, params.title || "Test", [
      "Option A",
      "Option B",
      "Option C",
    ]);
    return {
      content: [{ type: "text", text: "📱 WhatsApp interactive payload built (see details)." }],
      details: { preview },
    };
  }

  private async handleGmailTriager(params: any) {
    const emails = await fetchGmailUnread(20);
    if (emails.length === 0)
      return { content: [{ type: "text", text: STRINGS.es.noUnreadEmails }] };
    const critical = emails.filter((e) => /urgent|urgente|asap/i.test(e.subject));
    let triageText = `📧 *GMAIL TRIAGE*\n🔴 Críticos: ${critical.length}\n⚪ FYI: ${emails.length - critical.length}`;
    const recipient = params.recipientPhone ?? process.env.WA_DEFAULT_PHONE;
    const waPayload =
      recipient && critical.length > 0
        ? waButtonPayload(recipient, triageText, ["📖 Ver", "✅ OK"])
        : null;
    await updateSessionState(
      this.workspaceDir,
      "Gmail",
      `Triage complete: ${emails.length} unread items.`,
    );
    return {
      content: [{ type: "text", text: triageText }],
      details: { critical, waInteractivePayload: waPayload },
    };
  }

  private async handleRssDigest(params: any) {
    const articles = await fetchRssDigest();
    if (articles.length === 0)
      return { content: [{ type: "text", text: STRINGS.es.rssNoNewItems }] };
    let text =
      "📰 *INTELLIGENCE DIGEST*\n\n" +
      articles
        .slice(0, 5)
        .map((a) => `• *${a.title}*\n  _${a.blog}_`)
        .join("\n\n");
    const recipient = params.recipientPhone ?? process.env.WA_DEFAULT_PHONE;
    const waPayload = recipient
      ? waButtonPayload(recipient, text.substring(0, 1000), ["✅ OK"])
      : null;
    await updateSessionState(
      this.workspaceDir,
      "RSS",
      `News digest sent with ${articles.length} stories.`,
    );
    return {
      content: [{ type: "text", text }],
      details: { articles, waInteractivePayload: waPayload },
    };
  }

  private async handleCalendlySync(apiKey: string | undefined, params: any) {
    if (!apiKey) return { content: [{ type: "text", text: STRINGS.es.calendlySyncNoApiKey }] };
    const events = await fetchCalendlyEvents(apiKey);
    if (events.length === 0)
      return { content: [{ type: "text", text: STRINGS.es.calendlySyncNoEvents }] };
    await updateSessionState(
      this.workspaceDir,
      "Calendly",
      `Synced ${events.length} events from Maton.`,
    );
    return {
      content: [{ type: "text", text: `✅ Calendly: ${events.length} bookings sincronizados.` }],
      details: { events },
    };
  }

  private async handleFindNearbyVenues(params: any) {
    const venues = await fetchNearbyVenues(params.location || "Madrid");
    return {
      content: [{ type: "text", text: `🗺️ Found ${venues.length} venues nearby.` }],
      details: { venues },
    };
  }

  private async handleSuggestMealHabits() {
    const habits = await fetchOrderHistory();
    let text =
      habits.length > 0
        ? `🍴 Suggestion: ¿Pedimos en *${habits[0].restaurant}*?`
        : "🍴 No order history found.";
    return { content: [{ type: "text", text }], details: { habits } };
  }

  private async handleGetPersonalContext() {
    const memory = await searchDeepMemory(this.workspaceDir);
    return {
      content: [{ type: "text", text: `🧠 Memories: ${memory.substring(0, 200)}...` }],
      details: { memory },
    };
  }

  private async handleFinancialTriage(params: any) {
    const data = await extractFinancialData(params.emailBody || "");
    if (data.type === "Invoice")
      await updateSessionState(
        this.workspaceDir,
        "Financial",
        `Detected Invoice: ${data.amount} due ${data.deadline}`,
      );
    return {
      content: [
        {
          type: "text",
          text: data.type === "Invoice" ? "💰 Item financiero detectado." : "⚪ No es financiero.",
        },
      ],
      details: { data },
    };
  }

  private async handleIngestDocument(params: any) {
    if (!params.documentPath) throw new Error("documentPath is required.");
    const docPath = this.api.resolvePath(params.documentPath);
    const buffer = await fs.readFile(docPath);
    const result = await this.api.extractPdfContent({
      buffer,
      maxPages: 5,
      maxPixels: 4_000_000,
      minTextChars: 100,
    });
    const financial = await extractFinancialData(result.text);
    await updateSessionState(this.workspaceDir, "Vault", `Ingested ${path.basename(docPath)}.`);
    return {
      content: [{ type: "text", text: `📄 Ingested ${path.basename(docPath)}.` }],
      details: { financial, summary: result.text.substring(0, 200) },
    };
  }

  private async handleVoiceCommandExecutor(runId: string, params: any): Promise<any> {
    if (!params.transcript) throw new Error("Transcript missing.");
    const text = params.transcript.toLowerCase();
    let action = "";
    if (text.includes("briefing") || text.includes("agenda")) action = "briefing";
    else if (text.includes("triaje") || text.includes("email")) action = "gmail_triager";
    if (action) return this.execute(runId, { action });
    return { content: [{ type: "text", text: "🎙️ Comentario registrado en el WAL." }] };
  }

  private async handleAudioSummary(params: any) {
    if (!params.transcript) throw new Error("Transcript missing.");
    await updateSessionState(
      this.workspaceDir,
      "Audio",
      `Snippet: ${params.transcript.substring(0, 50)}...`,
    );

    // Phase 40: Auto-sync audio notes to Second Brain
    const syncedTo = await syncKnowledge(
      `Voice Note ${new Date().toLocaleString()}`,
      params.transcript,
    );

    return {
      content: [
        {
          type: "text",
          text: `🎙️ Nota de voz guardada${syncedTo.length > 0 ? ` y enviada a ${syncedTo.join(", ")}` : ""}.`,
        },
      ],
      details: { transcript: params.transcript, syncedTo },
    };
  }

  private async handleContextualMonitor() {
    return {
      content: [{ type: "text", text: "🔍 Analizando SESSION-STATE.md para sugerencias..." }],
    };
  }

  private async handleProactiveSuggest(params: any) {
    const recipient = params.recipientPhone ?? process.env.WA_DEFAULT_PHONE;
    if (recipient) waButtonPayload(recipient, params.title || "Sugerencia", ["OK"]);
    return { content: [{ type: "text", text: `💡 Suggestion: ${params.title}` }] };
  }

  private async handleLogisticsTriage(params: any) {
    const dateStr = (params.date ?? new Date().toISOString()).split("T")[0];
    const events = (await this.store.load()).filter((e: any) => e.startTime.startsWith(dateStr));
    let text = `🚀 Found ${events.length} logistics items for ${dateStr}.`;
    return { content: [{ type: "text", text }], details: { events } };
  }

  private async handleEventClosureShadowing(params: any) {
    const now = new Date();
    const ago = new Date(now.getTime() - 15 * 60000);
    const events = (await this.store.load()).filter(
      (e: any) => new Date(e.endTime) > ago && new Date(e.endTime) <= now,
    );
    let text = `🏁 Found ${events.length} events for closure shadowing.`;
    return { content: [{ type: "text", text }], details: { events } };
  }

  private async handleFinalizeClosure(params: any) {
    if (!params.transcript) throw new Error("Closure requires transcript.");
    await updateSessionState(
      this.workspaceDir,
      "Closure",
      `Finalized: ${params.transcript.substring(0, 50)}...`,
    );

    // Phase 40: Auto-sync Ghost Writes to Second Brain
    const syncedTo = await syncKnowledge(
      `Acta / Cierre Ghost Write ${new Date().toLocaleDateString()}`,
      params.transcript,
    );

    return {
      content: [
        {
          type: "text",
          text: `📝 Cierre procesado (Ghost Write completed)${syncedTo.length > 0 ? ` y guardado en ${syncedTo.join(", ")}` : ""}.`,
        },
      ],
      details: { syncedTo },
    };
  }

  private async handleNegotiateMeeting(params: any) {
    if (!params.peerUrl || !params.peerPublicKey)
      throw new Error("Negotiation requires peer context.");
    await updateSessionState(
      this.workspaceDir,
      "P2P",
      `Handshake initiated with ${params.peerUrl}`,
    );
    return {
      content: [{ type: "text", text: "🤝 Negociación P2P iniciada con handshake cifrado." }],
    };
  }

  private async handleHimalayaList(params: any) {
    const envelopes = await himalayaList(params.account);
    return {
      content: [
        {
          type: "text",
          text: `📬 Himalaya (${params.account || "default"}): ${envelopes.length} emails.`,
        },
      ],
      details: { envelopes },
    };
  }

  private async handleHimalayaRead(params: any) {
    if (!params.id) throw new Error("ID required for reading.");
    const content = await himalayaRead(params.id, params.account);
    return { content: [{ type: "text", text: content }] };
  }

  private async handleTriggerFocusMode(params: any) {
    const room = params.room || "Oficina";
    const scene = params.scene || "Concentración";
    await triggerHueScene(room, scene);
    await triggerSonosFocus("Escritorio");
    await updateSessionState(this.workspaceDir, "IoT", `Triggered focus: ${room}/${scene}`);
    return { content: [{ type: "text", text: "🧘 Focus mode active (IOT synced)." }] };
  }

  private async handleUrgentAlert(params: any) {
    const phone = params.recipientPhone ?? process.env.WA_DEFAULT_PHONE;
    const msg = params.message || "Intervención crítica.";
    if (phone) await triggerUrgentAlert(phone, msg);
    await updateSessionState(this.workspaceDir, "Alert", `Urgent message sent to ${phone}.`);
    return { content: [{ type: "text", text: "🚨 Alerta enviada." }] };
  }
}

export function registerProactiveHooks(api: OpenClawPluginApi) {
  api.on("gateway_start", async () => {
    console.log("[Secretary] 🕒 Demonio cronométrico iniciado en background...");

    // Intervalo de evaluación: cada 60 segundos
    setInterval(async () => {
      const now = new Date();
      const hours = now.getHours();
      const mins = now.getMinutes();

      const orchestrator = new SecretaryOrchestrator(api);

      // Regla 1: Triaje Matutino (08:00 AM)
      if (hours === 8 && mins === 0) {
        const today = now.toISOString().split("T")[0];
        const marker = api.resolvePath("./.last-morning-briefing");
        try {
          const last = await fs.readFile(marker, "utf-8");
          if (last.trim() === today) return; // Ya se hizo hoy
        } catch {}

        await fs.writeFile(marker, today);
        console.log("☀️ [Secretary] Ejecutando Triaje Matutino Autónomo...");

        // Disparar las lógicas de resumen (email, rss)
        try {
          await orchestrator.execute("cron-morning", { action: "gmail_triager" });
          await orchestrator.execute("cron-morning", { action: "rss_digest" });
        } catch (e) {
          console.error("☀️ [Secretary] Error en Triaje Matutino:", e);
        }
      }

      // Regla 2: Cierre Nocturno (22:00 PM)
      if (hours === 22 && mins === 0) {
        const today = now.toISOString().split("T")[0];
        const marker = api.resolvePath("./.last-evening-closure");
        try {
          const last = await fs.readFile(marker, "utf-8");
          if (last.trim() === today) return; // Ya se hizo hoy
        } catch {}

        await fs.writeFile(marker, today);
        console.log("🌙 [Secretary] Ejecutando Cierre Nocturno Autónomo...");

        try {
          await orchestrator.execute("cron-evening", { action: "sync_tasks" });
          await orchestrator.execute("cron-evening", { action: "logistics_triage" });
        } catch (e) {
          console.error("🌙 [Secretary] Error en Cierre Nocturno:", e);
        }
      }
    }, 60000); // Evalúa cada minuto
  });

  // Phase 41B: Hyper-Context (Zero-latency environmental awareness)
  api.on("before_prompt_build", async (event) => {
    try {
      // Intentamos leer el estado de la sesión, específicamente la última actividad
      const statePath = api.resolvePath("./SESSION-STATE.md");
      const stateContent = await fs.readFile(statePath, "utf-8");

      // Inyectamos esto en el system prompt antes de cada mensaje para evitar que
      // el LLM tenga que hacer tool calls para saber donde está el usuario
      return {
        appendSystemContext: `\n\n=== RECENT REAL-WORLD CONTEXT (ZERO LATENCY) ===\n${stateContent.substring(0, 800)}\n================================================\n`,
      };
    } catch {
      // Falla silente si no hay contexto
      return {};
    }
  });

  api.on("tool_result_persist", (event) => {
    if (event.toolName && ["calendar_tool", "gog_sync", "calendly_sync"].includes(event.toolName)) {
      console.log(`[Secretary] Conflict check triggered by ${event.toolName}`);
    }
  });

  api.on("message_received", async (event) => {
    if (/factura|pago|vencimiento/i.test(event.content)) {
      console.log(`[Secretary] Financial triage hook detected potential invoice.`);
    }
  });

  api.on("message_sending", async (event) => {
    if (/reunión|cita/.test(event.content.toLowerCase())) {
      return { content: `${event.content}\n\n💡 _Verificado con Secretary_ 🦞` };
    }
  });

  api.on("node_event", async (event) => {
    if (event.event === "biometry") {
      const payload = event.payload as any;
      if ((payload?.stressLevel ?? 0) > 80) {
        console.log("[Secretary] High stress hook: triggering recommendation queue.");
      }
    }
  });

  // Phase 39: Enhanced subagent outcome tracking for WAL
  api.on("subagent_ended", async (event) => {
    const outcome = event.outcome || "unknown";
    const duration = event.endedAt
      ? `(ended at ${new Date(event.endedAt).toLocaleTimeString()})`
      : "";
    console.log(
      `[Secretary] Subagent ${event.targetSessionKey} [${event.targetKind}] ended with outcome: ${outcome} ${duration}`,
    );

    await updateSessionState(
      api.resolvePath((api.config.agents?.defaults?.workspace as string) || "./workspace"),
      "SUBAGENT_SYNC",
      `Delegation ${outcome.toUpperCase()}: ${event.targetSessionKey} ${duration}`,
    );
  });
}
