import { execFileAsync } from "./common.js";

export async function triggerHueScene(room: string, scene: string): Promise<boolean> {
  try {
    await execFileAsync("openhue", ["set", "scene", scene, "--room", room]);
    return true;
  } catch {
    return false;
  }
}

export async function triggerSonosFocus(name: string): Promise<boolean> {
  try {
    await execFileAsync("sonos", ["play", "--name", name]);
    return true;
  } catch {
    return false;
  }
}
