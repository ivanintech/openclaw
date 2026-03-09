import fs from "node:fs/promises";
import path from "node:path";

export async function syncToNotion(title: string, content: string): Promise<boolean> {
  const apiKey = process.env.NOTION_API_KEY;
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

export async function syncKnowledge(title: string, content: string): Promise<string[]> {
  const results: string[] = [];

  if (process.env.OBSIDIAN_VAULT_PATH) {
    const ok = await syncToObsidian(title, content);
    if (ok) results.push("Obsidian");
  }

  if (process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID) {
    const ok = await syncToNotion(title, content);
    if (ok) results.push("Notion");
  }

  return results;
}
