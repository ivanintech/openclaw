import { execFileAsync } from "./common.js";

export async function fetchGogEvents(
  dateStr: string,
): Promise<{ title: string; startTime: string; endTime: string }[]> {
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
  apiKey: string,
): Promise<{ subject: string; from: string; id: string; bodyPreview: string }[]> {
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
