import { execFileAsync } from "./common.js";

export async function triggerUrgentAlert(phone: string, message: string): Promise<boolean> {
  try {
    // Stage 1: Attempt voice call via OpenClaw CLI
    await execFileAsync("openclaw", ["voicecall", "call", "--to", phone, "--message", message]);
    // Stage 2: Parallel high-priority text logging (BlueBubbles simulated here)
    console.log(`[Urgent Alert] Message sent to ${phone}: ${message}`);
    return true;
  } catch {
    return false;
  }
}
