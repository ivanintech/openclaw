import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { OpenClawPluginApi } from "../../../../src/plugins/types.js";

/**
 * Phase 46: PWA Provisioning Engine (Deep-Adoption)
 * Handles the activation of a mobile device as a self-healing edge node.
 */
export function createActivationHandler(api: OpenClawPluginApi) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return true;
    }

    try {
      const body = await getJsonBody(req);
      const { activationToken, identity } = body;

      // In a real SaS, we would verify the activationToken against the Bridge JWT
      api.logger.info(
        `[activation] Handshake received for identity: ${identity?.name || "Unknown"}`,
      );

      const workspaceDir =
        api.config.agents?.defaults?.workspace || path.join(process.cwd(), "workspace");
      const soulPath = path.join(workspaceDir, "SOUL.md");

      // Check if SOUL.md exists, if not, create it (The "Born" process)
      try {
        await fs.access(soulPath);
      } catch {
        const initialSoul = generateInitialSoul(identity);
        await fs.mkdir(workspaceDir, { recursive: true });
        await fs.writeFile(soulPath, initialSoul, "utf-8");
        api.logger.info(`[activation] Secretary SOUL.md "born" at ${soulPath}`);
      }

      // Prepare provisioning payload for the mobile node
      const provisioning = {
        status: "activated",
        nodeId: `edge-${Math.random().toString(36).slice(2, 9)}`,
        capabilities: ["vector-memory", "proactive-hooks", "whatsapp-relay"],
        config: {
          autonomyLevel: identity?.autonomy || "L2",
          privacyMode: "edge-only",
        },
      };

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(provisioning));
    } catch (err: any) {
      api.logger.error(`[activation] error: ${err.message}`);
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Bad Request", details: err.message }));
    }

    return true;
  };
}

function getJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function generateInitialSoul(identity: any): string {
  const name = identity?.name || "User";
  const autonomy = identity?.autonomy || "L2";

  return `# 🦞 Secretary SOUL (Born: ${new Date().toISOString()})

## 👤 Identity
- **Owner**: ${name}
- **Autonomy Level**: ${autonomy}
- **Primary Goal**: Executive Hyper-Convenience & Privacy.

## 🧠 Behavior Manifest
- Be proactive but never intrusive.
- Prioritize daily briefings at 08:00 AM.
- Index all knowledge to Vector Memory (LanceDB).
- Keep all sensitive logic at the Mobile Edge.

---
*Configured via Magic Onboarding Wizard*
`;
}
