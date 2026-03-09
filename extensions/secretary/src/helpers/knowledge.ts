import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawPluginApi } from "../../../../src/plugins/types.js";
import { storeVectorMemory } from "../wal-helpers.js";
import { resolveApiKeyForProvider } from "../../../../src/agents/model-auth.js";
import type { OpenClawConfig } from "../../../../src/config/config.js";
import { loadConfig } from "../../../../src/config/config.js";

export async function syncToNotion(title: string, content: string): Promise<boolean> {
  // AUTO-OAUTH: Intentar obtener API key desde auth profiles automáticamente
  let apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    try {
      const cfg = await loadConfig() as OpenClawConfig;
      const auth = await resolveApiKeyForProvider({
        provider: "notion",
        cfg,
      });
      apiKey = auth.apiKey;
      console.log("[Secretary:Knowledge] ✅ Auto-detected Notion API key from auth profiles");
    } catch {
      console.log("[Secretary:Knowledge] ℹ️  Notion API key not found in auth profiles, trying env vars");
    }
  }
  
  const dbId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !dbId) {
    console.log("[Secretary:Knowledge] Notion API key or Database ID not configured.");
    return false;
  }

  try {
    const response = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28", // Using stable version; adjust to 2025-09-03 if required for specific data_source features
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          Name: { title: [{ text: { content: title } }] },
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content } }],
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`[Secretary:Knowledge] Notion sync failed: ${response.status} - ${errorData}`);
      return false;
    }

    console.log(`[Secretary:Knowledge] Synced '${title}' to Notion successfully.`);
    return true;
  } catch (error) {
    console.error("[Secretary:Knowledge] Error syncing to Notion:", error);
    return false;
  }
}

export async function syncToObsidian(title: string, content: string): Promise<boolean> {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;

  if (!vaultPath) {
    console.log("[Secretary:Knowledge] Obsidian vault path not configured.");
    return false;
  }

  try {
    // Basic sanitization for filenames
    const safeTitle = title.replace(/[/\\?%*:|"<>]/g, "-").trim() || "Untitled_Note";
    const fileName = `${safeTitle}.md`;
    const filePath = path.join(vaultPath, fileName);

    // Simple markdown formatting
    const fileContent = `# ${title}\n\n${content}\n\n---\n*Synced by ClawSecretary 🦞*`;

    await fs.writeFile(filePath, fileContent, "utf-8");
    console.log(`[Secretary:Knowledge] Synced '${title}' to Obsidian successfully at ${filePath}.`);
    return true;
  } catch (error) {
    console.error("[Secretary:Knowledge] Error syncing to Obsidian:", error);
    return false;
  }
}

export async function syncKnowledge(
  api: OpenClawPluginApi,
  title: string,
  content: string,
): Promise<string[]> {
  const results: string[] = [];

  // Phase 41D: Populate Vector Memory (LanceDB)
  await storeVectorMemory(api, `${title}: ${content}`, "fact");
  results.push("VectorDB");

  if (process.env.OBSIDIAN_VAULT_PATH) {
    const ok = await syncToObsidian(title, content);
    if (ok) results.push("Obsidian");
  }

  // AUTO-OAUTH: Intentar Notion automáticamente (la función syncToNotion ya busca en auth profiles)
  if (process.env.NOTION_DATABASE_ID) {  // Solo necesitamos el DB ID, la key se obtendrá automáticamente
    const ok = await syncToNotion(title, content);
    if (ok) results.push("Notion");
  }

  return results;
}
