import { generateKeyPairSync, privateDecrypt } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthProfileCredential } from "../../../src/agents/auth-profiles/types.js";
import type { OpenClawPluginApi } from "../../../src/plugins/types.js";
import { AutoAuthOrchestrator } from "../../../src/saas/orchestrator.js";

let keyPair: { publicKey: string; privateKey: string } | null = null;

export function getKeys() {
  if (!keyPair) {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    keyPair = { publicKey, privateKey };
  }
  return keyPair;
}

export function createPublicKeyHandler(_api: OpenClawPluginApi) {
  return async (_req: IncomingMessage, res: ServerResponse) => {
    const { publicKey } = getKeys();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ publicKey }));
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

export function createOAuthInjectHandler(api: OpenClawPluginApi) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return true;
    }

    try {
      const body = await getJsonBody(req);
      let payload = body;

      // Phase 29: Decrypt if payload is encrypted
      if (body.encryptedPayload) {
        const { privateKey } = getKeys();
        const decryptedBuffer = privateDecrypt(
          {
            key: privateKey,
            // In production, matching padding should be strictly enforced (e.g., OAEP)
          },
          Buffer.from(body.encryptedPayload, "base64"),
        );
        payload = JSON.parse(decryptedBuffer.toString());
        api.logger.info("Phase 29: Successfully decrypted secure tunnel payload.");
      }

      const { saasToken, profiles } = payload;

      // Verify the SAAS request originates from our trusted Cloud Bridge
      // (Simplified verification for the prototype. In production: asymmetric JWT validation)
      if (saasToken !== process.env.SAAS_BRIDGE_TOKEN && process.env.NODE_ENV !== "development") {
        api.logger.warn("Unauthorized OAuth inject request caught by Listener.");
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return true;
      }

      const orchestratorRuntime = {
        ...api.runtime,
        log: (msg: string) => api.logger.info(msg),
        error: (msg: string) => api.logger.error(msg),
        exit: (code: number) => process.exit(code),
      } as any;

      const orchestrator = new AutoAuthOrchestrator(orchestratorRuntime);
      await orchestrator.injectCloudProfiles(profiles as Record<string, AuthProfileCredential>);

      api.logger.info(
        `Phase 28 Mobile-Edge Bridge: Successfully injected ${Object.keys(profiles).length} edge credentials.`,
      );

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          message: "Credentials injected into Local Vault.",
          injectedCount: Object.keys(profiles).length,
        }),
      );
    } catch (err: any) {
      api.logger.error(`OAuth Injection error: ${err.message}`);
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Bad Request", details: err.message }));
    }

    return true; // Indicate that we handled the response
  };
}
