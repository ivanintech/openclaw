export async function fetchCalendlyEvents(apiKey: string): Promise<any[]> {
  try {
    const res = await fetch("https://gateway.maton.ai/calendly/scheduled_events?status=active", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.collection || [];
  } catch {
    return [];
  }
}

export async function fetchCalendlyInvitees(apiKey: string, eventUri: string): Promise<any[]> {
  try {
    // Extract UUID from URI: https://api.calendly.com/scheduled_events/UUID
    const uuid = eventUri.split("/").pop();
    const res = await fetch(`https://gateway.maton.ai/calendly/scheduled_events/${uuid}/invitees`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.collection || [];
  } catch {
    return [];
  }
}
