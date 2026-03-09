import { execFileAsync } from "./common.js";
import { resolveApiKeyForProvider } from "../../../../src/agents/model-auth.js";
import type { OpenClawConfig } from "../../../../src/config/config.js";
import { loadConfig } from "../../../../src/config/config.js";

export async function fetchGogEvents(
  dateStr: string,
): Promise<{ title: string; startTime: string; endTime: string }[]> {
  // AUTO-OAUTH: Verificar si tenemos Google auth profiles antes de usar CLI
  try {
    const cfg = await loadConfig() as OpenClawConfig;
    await resolveApiKeyForProvider({
      provider: "google-gmail", // o "google-calendar" - OpenClaw maneja ambos
      cfg,
    });
    console.log("[Secretary:Email] ✅ Auto-detected Google auth, using gog CLI");
  } catch (error) {
    console.log("[Secretary:Email] ⚠️  No Google auth found, gog CLI may fail");
  }

  try {
    const { stdout } = await execFileAsync("gog", [
      "calendar",
      "events",
      "primary",
      "--from",
      `${dateStr}T00:00:00Z`,
      "--to",
      `${dateStr}T23:59:59Z`,
      "--json",
      "--no-input",
    ]);
    const raw = JSON.parse(stdout) as any[];
    return raw.map((e) => ({
      title: e.summary ?? "Sin título",
      startTime: e.start?.dateTime ?? `${dateStr}T00:00:00Z`,
      endTime: e.end?.dateTime ?? `${dateStr}T01:00:00Z`,
    }));
  } catch {
    return [];
  }
}

export async function fetchGmailUnread(
  maxResults = 15,
): Promise<{ subject: string; from: string; snippet: string }[]> {
  // AUTO-OAUTH: Verificar si tenemos Google auth antes de usar CLI
  try {
    const cfg = await loadConfig() as OpenClawConfig;
    await resolveApiKeyForProvider({
      provider: "google-gmail",
      cfg,
    });
    console.log("[Secretary:Email] ✅ Auto-detected Google Gmail auth");
  } catch (error) {
    console.log("[Secretary:Email] ⚠️  No Google Gmail auth found");
  }

  try {
    const { stdout } = await execFileAsync("gog", [
      "gmail",
      "messages",
      "search",
      "is:unread newer_than:1h",
      "--max",
      String(maxResults),
      "--json",
      "--no-input",
    ]);
    const raw = JSON.parse(stdout) as any[];
    return raw.map((m) => ({
      subject: m.subject ?? "(sin asunto)",
      from: m.from ?? "Desconocido",
      snippet: m.snippet ?? "",
    }));
  } catch {
    return [];
  }
}

export async function fetchOutlookInbox(
  providedApiKey?: string,
): Promise<{ subject: string; from: string; id: string; bodyPreview: string }[]> {
  // AUTO-OAUTH: Si no se proporciona API key, intentar obtenerla automáticamente
  let apiKey = providedApiKey;
  if (!apiKey) {
    try {
      const cfg = await loadConfig() as OpenClawConfig;
      const auth = await resolveApiKeyForProvider({
        provider: "microsoft",
        cfg,
      });
      apiKey = auth.apiKey;
      console.log("[Secretary:Email] ✅ Auto-detected Microsoft Outlook API key from auth profiles");
    } catch {
      console.log("[Secretary:Email] ⚠️  No Microsoft Outlook auth found, trying env var");
      apiKey = process.env.MICROSOFT_OUTLOOK_API_KEY;
    }
  }

  if (!apiKey) {
    console.log("[Secretary:Email] ⚠️  No Microsoft Outlook API key available");
    return [];
  }

  try {
    const res = await fetch(
      "https://gateway.maton.ai/outlook/v1.0/me/mailFolders/Inbox/messages?$top=20&$filter=isRead eq false&$orderby=receivedDateTime desc&$select=id,subject,from,bodyPreview",
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    return (data.value ?? []).map((m: any) => ({
      id: m.id,
      subject: m.subject ?? "(sin asunto)",
      from: m.from?.emailAddress?.name ?? "Desconocido",
      bodyPreview: m.bodyPreview ?? "",
    }));
  } catch (error) {
    console.error("[Secretary:Email] Error fetching Outlook inbox:", error);
    return [];
  }
}

export async function himalayaList(account?: string): Promise<any[]> {
  try {
    const args = ["envelope", "list", "--output", "json"];
    if (account) args.push("--account", account);
    const { stdout } = await execFileAsync("himalaya", args);
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

export async function himalayaRead(id: string, account?: string): Promise<string> {
  try {
    const args = ["message", "read", id];
    if (account) args.push("--account", account);
    const { stdout } = await execFileAsync("himalaya", args);
    return stdout;
  } catch {
    return "Error leyendo el mensaje.";
  }
}
