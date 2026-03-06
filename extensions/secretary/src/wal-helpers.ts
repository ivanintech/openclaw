import fs from "node:fs/promises";
import path from "node:path";
import { STRINGS } from "./constants.js";

/**
 * \"STOP and PERSIST before you REPLY.\" — WAL-PROTOCOL.md + proactive-agent v3.1
 */
export async function updateSessionState(
  workspaceDir: string | undefined,
  section: string,
  entry: string,
): Promise<void> {
  if (!workspaceDir) return;
  const sessionStatePath = path.join(workspaceDir, "SESSION-STATE.md");
  let content: string;
  try {
    content = await fs.readFile(sessionStatePath, "utf-8");
  } catch {
    content = STRINGS.es.walHeader;
  }

  const timestamp = new Date().toISOString();
  const fullEntry = `\n### [${timestamp}] ${entry}`;

  if (content.includes(`## ${section}`)) {
    content = content.replace(
      new RegExp(`## ${section}[\\s\\S]*?(?=\\n## |\\n---\\n\\n##|\\s*$)`),
      `## ${section}\n${fullEntry}\n`,
    );
  } else {
    content += `\n---\n\n## ${section}\n${fullEntry}\n`;
  }
  await fs.writeFile(sessionStatePath, content, "utf-8");
}

export async function appendWorkingBuffer(
  workspaceDir: string | undefined,
  role: "Human" | "Agent",
  summary: string,
): Promise<void> {
  if (!workspaceDir) return;
  const bufferPath = path.join(workspaceDir, "memory", "working-buffer.md");
  const timestamp = new Date().toISOString();
  const entry = `\n## [${timestamp}] ${role}\n${summary}\n`;
  try {
    await fs.appendFile(bufferPath, entry, "utf-8");
  } catch {
    /* silent — buffer is non-critical */
  }
}

export async function searchDeepMemory(workspaceDir: string | undefined): Promise<string> {
  if (!workspaceDir) return "No hay memoria disponible.";
  try {
    const sessionStatePath = path.join(workspaceDir, "SESSION-STATE.md");
    const content = await fs.readFile(sessionStatePath, "utf-8");
    // Just return the last 1000 chars for context
    return content.length > 2000 ? `...${content.slice(-2000)}` : content;
  } catch {
    return "No hay memoria disponible.";
  }
}
