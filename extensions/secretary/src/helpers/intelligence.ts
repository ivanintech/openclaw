import { execFileAsync } from "./common.js";

export async function fetchRssDigest(): Promise<{ title: string; blog: string; url?: string }[]> {
  try {
    const { stdout } = await execFileAsync("blogwatcher", ["articles", "--json"]);
    const raw = JSON.parse(stdout) as any[];
    return raw.slice(0, 10).map((a) => ({
      title: a.title ?? "Sin título",
      blog: a.blog ?? "Feed",
      url: a.url,
    }));
  } catch {
    return [];
  }
}

export async function fetchNearbyVenues(
  query: string,
  lat?: number,
  lng?: number,
): Promise<{ name: string; address: string; rating: number }[]> {
  try {
    const args = ["search", query, "--json", "--limit", "3", "--min-rating", "4"];
    if (lat !== undefined && lng !== undefined) {
      args.push("--lat", String(lat), "--lng", String(lng), "--radius-m", "2000");
    }
    const { stdout } = await execFileAsync("goplaces", args);
    const raw = JSON.parse(stdout) as any[];
    return raw.map((p) => ({
      name: p.name ?? "Lugar desconocido",
      address: p.formatted_address ?? "",
      rating: p.rating ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function fetchOrderHistory(): Promise<
  { code: string; items: string; restaurant: string }[]
> {
  try {
    const { stdout } = await execFileAsync("ordercli", [
      "foodora",
      "history",
      "--limit",
      "5",
      "--json",
    ]);
    const raw = JSON.parse(stdout) as any[];
    return raw.map((o) => ({
      code: o.code,
      restaurant: o.vendor_name ?? "Restaurante",
      items: o.summary ?? "",
    }));
  } catch {
    return [];
  }
}

export async function fetchWeather(city: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s",
      `wttr.in/${encodeURIComponent(city)}?format=%c+%t+%w+%h`,
    ]);
    return stdout.trim() || "☁️ Tiempo no disponible";
  } catch {
    return "☁️ Tiempo no disponible";
  }
}
