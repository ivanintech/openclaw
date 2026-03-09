import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";
import { STRINGS } from "./constants.js";

/**
 * Phase 41D: Bridges the Secretary internal state with OpenClaw's Vector Memory (sqlite-vec or qmd).
 * Uses Subagent Delegation to ensure we leverage the core memory configuration and embedding keys.
 */
export async function storeVectorMemory(
  api: OpenClawPluginApi,
  text: string,
  category: "preference" | "decision" | "fact" | "entity" | "other" = "other",
): Promise<void> {
  try {
    api.logger.info(
      `[memory-cognition] Delegating storage to native LanceDB: ${text.slice(0, 50)}...`,
    );

    // Spawning a headless subagent that has the 'memory_store' tool available
    await api.runtime.subagent.run({
      sessionKey: "secretary-ltm-sync",
      message: `Memory Capture Request: "${text}"\nCategory: ${category}`,
      extraSystemPrompt: `
        You are a memory synchronization specialist. 
        Use the 'memory_store' tool to persist the provided information into the long-term vector database.
        Include the category: ${category} if possible.
        Exit immediately after successful storage.
      `,
      deliver: false, // Internal process; don't broadcast to user
    });
  } catch (err: any) {
    api.logger.warn(`[memory-cognition] Failed to delegate memory storage: ${err.message}`);
  }
}

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
