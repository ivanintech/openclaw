# ClawSecretary: The Autonomous AI Event Manager 🦞

Welcome to **ClawSecretary**, a high-leverage SaaS extension for OpenClaw designed to transform your digital life into a streamlined, proactive experience. This project represents a state-of-the-art implementation of the "Digital Twin" concept for 2026.

## 🚀 The Vision: From Assistant to Partner

ClawSecretary doesn't just manage a calendar; it **owns** your schedule. Built on the **Hal Stack** methodology, it uses relentless resourcefulness to solve conflicts, research meetings, and keep you briefed via premium channels.

---

## ✨ Core Pillars & Features

### 1. Autonomous Intelligence (The Proactive Core)
Located in `workspace/`, this module defines how the agent thinks and remembers.
- **SOUL.md**: Defines the "Owner" identity. The secretary initiates actions instead of waiting for prompts.
- **WAL Protocol (SESSION-STATE.md)**: A Write-Ahead Log that acts as the agent's RAM. Every user preference and decision is captured here _before_ a response is sent, ensuring zero context loss.
- **HEARTBEAT.md**: A self-monitoring loop that proactively scans for conflicts, prepares meeting research, and drafts surprises for the user.
- **Proactive Crons**: Registers multiple autonomous Node.js crons (e.g., Daily Briefing at 08:00, Pre-Meeting Research every :45) that execute `isolated agentTurn` payloads without user prompting.

### 2. Federated Architecture (Cloud as Bridge, Edge as Brain)
Built for the **Privacy-First** economy of 2026.
- **SaaS Orchestrator**: Manages high-availability cloud gateways (Next.js/React + Vite for the glassmorphic SaaS dashboard).
- **Mobile Edge Node**: Runs directly on the user's phone. Handles sensitive tool execution (local file access, private messages) via a secure bridge.
- **Mobile-Edge OAuth Bridge**: "Cloud as a Bridge, Edge as the Brain." Next.js and Nango act strictly as an ephemeral cloud router to perform OAuth dances (Notion, Google). The resulting `access_tokens` are instantly injected via secure WebSockets back into the user's local phone (`AutoAuthOrchestrator`), leaving zero storage footprint in the cloud.
- **Secure Asymmetric Tunnel**: Inter-component transit is secured via RSA-2048 encryption, preventing the cloud layer from viewing plain-text credentials.

### 3. Omnichannel Orchestration
The brains reside in `extensions/secretary/src/orchestrator.ts`.
- **Google Calendar (GOG) & Outlook (Microsoft Graph)**: Premium personal and corporate sync integrations.
- **Premium Email Concierge**: Intelligent inbox triage and automated drafting for Outlook and Gmail. Features 1-click response interactive options.
- **WhatsApp Business**: Our primary notification channel supporting interactive buttons for one-click briefings and conflict approvals.

### 4. Hyper-Convenience & Logistics
- **Event Shadowing**: Autonomous cron (`event_closure_shadowing`) detects when meetings conclude and intercepts the user.
- **Ghost Write & Auto-Commit**: Uses local `openai-whisper` (STT) and `summarize` skills to seamlessly transcribe dictated agreements and draft follow-up emails in Gmail/Outlook.
- **Logistics Triage**: Generates real-time Uber, parking, or micro-errand (gift delivery) suggestions 15-30 minutes before an event constraint.

### 5. Inter-Agent Negotiation Protocol (P2P RSA)
- **RSA Handshake**: Two ClawSecretary local nodes negotiate meeting slots securely via point-to-point RSA encryption.
- **Autonomous Auto-Match**: Without exposing full schedules to the cloud (only proposing empty slots), the system validates against the local `CalendarStore` and auto-commits mutually agreed times automatically.

### 6. Modo Piloto Automático (SOUL.md v3)
- **Dynamic Autonomy Levels**: Maps event categories to trust levels (L1 Strict, L2 Proactive, L3 Auto-Commit, L4 Silent).
- **Silent Commits (L3/L4)**: Resolves agenda conflicts, moves overlapping trusted meetings, and handles negotiations in the background. It generates summarized texts via WhatsApp terminating in `_Acción: Piloto Automático L3_` to eliminate interactive decision fatigue.

---

## 💡 Casos de Uso (Use Cases)

ClawSecretary brilla en situaciones donde la agenda convencional falla:

### 1. El Ejecutivo "Context-Shifted"
Un usuario con una mañana llena de reuniones corporativas y citas personales.
- **Valor**: ClawSecretary unifica ambas vidas y le envía un **WhatsApp Interactivo** a las 8:00 AM: _"Hoy tienes 5 reuniones. La de las 11:00 choca con tu Dentista (Personal). ¿Quieres que mueva al Dentista a las 16:00? [SÍ] [NO]"_.

### 2. Preparación de Reuniones Proactiva
Antes de una reunión importante, el secretario utiliza el módulo `proactive_research`.
- **Valor**: 15 minutos antes recibes: _"Investigación lista para 'X Tech': Su última ronda fue de $20M. Aquí tienes los puntos clave para la conversación"_.

### 3. El Guardián del Tiempo de Enfoque
- **Valor**: El secretario filtra el ruido. _"Ivan, tienes 40 correos nuevos. 37 son basura. Uno de 'Inversor Beta' es crítico. He redactado una respuesta aceptando la reunión. ¿La envío? [ENVIAR] [CORREGIR]"_.

### 4. El Perfil "Privacy-First" (Mobile Edge)
- **Valor**: El secretario procesa documentos altamente confidenciales **dentro del propio teléfono**. Los metadatos/triaje se hacen localmente, el SaaS rutea resúmenes anonimizados, pero los datos crudos/embeddings y memoria nunca salen a la nube.

---

## 📄 Technical Insights & Execution Patterns

### Persistent Stateful Memory (WAL Protocol)
Unlike standard agents, ClawSecretary maintains state safely via Write-Ahead logs in `workspace/SESSION-STATE.md`.
```markdown
- Capture Preference: "I prefer morning meetings for deep work"
- Stop & Write: Immediate persistence before replying.
```

### Proactive Orchestration Logic
The `setup_proactive` action injects autonomous `agentTurn` crons (proactive-agent v3.1 pattern).
```typescript
{
  name: "Secretary Daily Briefing",
  schedule: { kind: "cron", expr: "0 8 * * *", tz: "Local" },
  payload: { kind: "agentTurn", message: "AUTONOMOUS: run briefing + send WA buttons" },
  sessionTarget: "isolated",
}
```

### Real WhatsApp Business Payload Formatting
Tools natively return `waInteractivePayload` structs for direct injection via WhatsApp.
```typescript
// conflict_guardian output.details.waInteractivePayload:
{
  messaging_product: "whatsapp",
  to: "34612345678",
  type: "interactive",
  interactive: {
    type: "button",
    body: { text: "⚠️ Conflicto detectado. ¿Mover a 16:15?" },
    action: { buttons: [
      { type: "reply", reply: { id: "btn_mover", title: "✅ Sí, mover" } },
      { type: "reply", reply: { id: "btn_no", title: "❌ No, mantener" } }
    ]}
  }
} // → Passed tightly to secretary_whatsapp(action="send_buttons")
```

---

## 📈 Evolution Timeline (Git History)

- **Phase 1-3**: Initial CRUD extension, local calendar storage, Tavily/GOG integration.
- **Phase 4-8**: Implementation of the Hal Stack, WAL Protocol, Maton Premium APIs (Outlook & WhatsApp). Added Email Concierge & Proactive Triage.
- **Phase 10-14**: Federated Gateway Architecture. SaaS Dashboard Production (React/Vite). Cloud Sync & Zero-Touch AutoAuth.
- **Phase 16-17**: Upstream Innovation (SecurityAudits, Native PDF analysis, Live iOS widget). Implemented Proactive Control Panel & Opportunity Search (Tavily).
- **Phase 22-24**: Intelligent Document Vault, Financial Guardian triage, Voice-to-Task Engine (Native STT/TTS via Whisper & OpenClaw Runtime).
- **Phase 27**: Personal OS Integration (1Password vault, Notion Second Brain sync, Apple Reminders/Things 3).
- **Phase 28-29**: SaaS Mobile-Edge Bridge built. RSA-2048 Asymmetric Tunnel enforcement. Converted SaaS Dashboard to optimized PWA.
- **Phase 30**: Hyper-Convenience (Ghost Write & Auto-Commit hooks). Logistics triage. Event Shadowing crons.
- **Phase 31**: Inter-Agent Negotiation Protocol (RSA Handshake) enabling auto-matched peer schedules.
- **Phase 33**: Upstream Sync & Core Alignment. Successfully merged `upstream/main` and resolved critical conflicts in `registry.ts`.
- **Phase 34**: Structural Refactor. Integrated `joinPresentTextSegments` for robust briefing generation and cleaned up TypeScript architecture.
- **Phase 35**: Advanced Core Integration (Biometry Standardization + Subagent Supervision) 🦞
- **Phase 36**: Smart Environment & Multi-Account Concierge. Added `himalaya` support for generic email, `trigger_focus_mode` for IoT control (Hue + Sonos), and an Urgent Alert Tier (Voice + iMessage). 🦞

---

## 🔧 Required Environment Variables

| Variable             | Required  | Purpose                                      |
| -------------------- | --------- | -------------------------------------------- |
| `MATON_API_KEY`      | ✅ Core   | Outlook + WhatsApp Business via Maton.ai     |
| `WA_PHONE_NUMBER_ID` | ✅ For WA | Meta WhatsApp Business Phone Number ID       |
| `WA_DEFAULT_PHONE`   | Optional  | Default WA recipient (international, no `+`) |
| `GOG_ACCOUNT`        | Optional  | Google Calendar via `gog` CLI                |
| `TAVILY_API_KEY`     | Optional  | Proactive meeting research                   |
| `CALENDLY_API_KEY`   | Optional  | Calendly booking management                  |

> _Tokens generated via OAuth Bridge are stored implicitly in `workspace/auth-profiles.json`._

## 🛠️ Verification & Health Check

Verify the assistant's setup and workspace integrity locally at any time:

```bash
npx tsx extensions/secretary/verify-v2.ts
```

---

_Powered by [OpenClaw](https://github.com/openclaw/openclaw) & [IvanInTech Fork](https://github.com/ivanintech/openclaw)_ 🦞🚀
