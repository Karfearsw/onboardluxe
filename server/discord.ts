type DiscordWebhookPayload = {
  content?: string;
};

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("password") ||
        lower.includes("secret") ||
        lower.includes("token") ||
        lower.includes("cookie") ||
        lower.includes("authorization") ||
        lower.includes("database_url") ||
        lower.includes("discord_webhook")
      ) {
        continue;
      }

      if (lower === "signaturedataurl" || lower === "signature_data_url") {
        if (typeof child === "string") {
          next[key] = child.length > 120 ? `${child.slice(0, 120)}…` : child;
        } else {
          next[key] = "[omitted]";
        }
        continue;
      }

      next[key] = redact(child);
    }

    return next;
  }

  return value;
}

async function postJson(url: string, body: DiscordWebhookPayload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status}`);
  }
}

async function postWithFile(url: string, body: DiscordWebhookPayload, filename: string, fileText: string) {
  const form = new FormData();
  form.append("payload_json", JSON.stringify(body));
  form.append(
    "files[0]",
    new Blob([fileText], { type: "application/json" }),
    filename,
  );

  const res = await fetch(url, { method: "POST", body: form });

  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status}`);
  }
}

export async function sendDiscordWebhook(event: string, payload: unknown) {
  const url = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!url) return;

  const redacted = redact(payload);
  const json = JSON.stringify({ event, payload: redacted }, null, 2);
  const header = `**${event}**`;

  if (json.length <= 1800) {
    await postJson(url, { content: `${header}\n\`\`\`json\n${json}\n\`\`\`` });
    return;
  }

  await postWithFile(url, { content: `${header}\n(payload attached)` }, "payload.json", json);
}

