export function waButtonPayload(to: string, bodyText: string, buttons: string[]): object {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((label, i) => ({
          type: "reply",
          reply: { id: `btn_${i}`, title: label },
        })),
      },
    },
  };
}
