type DiscordWebhookPayload = {
  content?: string;
};

type SendDiscordWebhookOptions = {
  throwOnError?: boolean;
};

const DEFAULT_TIMEOUT_MS = 3500;

function normalizeEventToEnvSuffix(event: string) {
  return event
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueNonEmpty(values: Array<string | undefined | null>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = (raw || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function resolveWebhookUrlsForEvent(event: string) {
  const envSuffix = normalizeEventToEnvSuffix(event);
  const direct = process.env[`DISCORD_WEBHOOK_URL_EVENT_${envSuffix}`];

  const groupRules: Array<{ re: RegExp; envKey: string }> = [
    { re: /^debug\./, envKey: "DISCORD_WEBHOOK_URL_DEBUG" },
    { re: /^agent\.payout_/, envKey: "DISCORD_WEBHOOK_URL_FINANCE" },
    { re: /^agent\.email_/, envKey: "DISCORD_WEBHOOK_URL_IT" },
    { re: /^(agent\.|onboarding\.)/, envKey: "DISCORD_WEBHOOK_URL_HR" },
  ];

  const group = groupRules.find((r) => r.re.test(event))?.envKey;
  const groupUrl = group ? process.env[group] : undefined;

  const legacy = process.env.DISCORD_WEBHOOK_URL;

  if ((direct || "").trim()) return uniqueNonEmpty([direct]);
  if ((groupUrl || "").trim()) return uniqueNonEmpty([groupUrl]);
  return uniqueNonEmpty([legacy]);
}

export function hasDiscordWebhookForEvent(event: string) {
  return resolveWebhookUrlsForEvent(event).length > 0;
}

function redactEmail(value: string) {
  const v = value.trim();
  const at = v.indexOf("@");
  if (at <= 0) return "[redacted]";
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  const first = local.slice(0, 1);
  return `${first}***@${domain}`;
}

function redactPhone(value: string) {
  const digits = value.replace(/\D+/g, "");
  if (digits.length < 4) return "[redacted]";
  return `***${digits.slice(-4)}`;
}

function redactIp(value: string) {
  const v = value.trim();
  if (v.includes(".")) {
    const parts = v.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    return "[redacted]";
  }
  if (v.includes(":")) {
    const parts = v.split(":").filter(Boolean);
    return parts.slice(0, 3).join(":") + "::";
  }
  return "[redacted]";
}

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
        lower.includes("discord_webhook") ||
        lower === "fileurl" ||
        lower === "file_url" ||
        lower === "payoutdetails" ||
        lower === "payout_details"
      ) {
        continue;
      }

      if (lower === "email" || lower === "personalemail" || lower === "personal_email" || lower === "companyemail" || lower === "company_email") {
        next[key] = typeof child === "string" ? redactEmail(child) : "[redacted]";
        continue;
      }

      if (lower === "requestedemail" || lower === "requested_email") {
        next[key] = typeof child === "string" ? redactEmail(child) : "[redacted]";
        continue;
      }

      if (lower === "phone" || lower === "phonenormalized" || lower === "phone_normalized") {
        next[key] = typeof child === "string" ? redactPhone(child) : "[redacted]";
        continue;
      }

      if (lower === "name" || lower === "legalname" || lower === "legal_name") {
        next[key] = "[redacted]";
        continue;
      }

      if (lower === "address" || lower === "city" || lower === "state" || lower === "zip") {
        next[key] = "[redacted]";
        continue;
      }

      if (lower === "ip" || lower === "ipaddress" || lower === "ip_address") {
        next[key] = typeof child === "string" ? redactIp(child) : "[redacted]";
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

async function postJson(url: string, body: DiscordWebhookPayload, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const detail = text.length > 400 ? `${text.slice(0, 400)}…` : text;
    throw new Error(`Discord webhook failed: ${res.status}${detail ? ` ${detail}` : ""}`);
  }
}

async function postWithFile(url: string, body: DiscordWebhookPayload, filename: string, fileText: string, timeoutMs: number) {
  const form = new FormData();
  form.append("payload_json", JSON.stringify(body));
  form.append(
    "files[0]",
    new Blob([fileText], { type: "application/json" }),
    filename,
  );

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: form, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const detail = text.length > 400 ? `${text.slice(0, 400)}…` : text;
    throw new Error(`Discord webhook failed: ${res.status}${detail ? ` ${detail}` : ""}`);
  }
}

function minimizePayload(event: string, payload: unknown): unknown {
  const p = payload as any;

  if (event === "agent.created") {
    const agent = p?.agent;
    if (!agent) return payload;
    return {
      agentId: agent.id,
      subscriptionStatus: agent.subscriptionStatus,
      crmPipelineStage: agent.crmPipelineStage,
      onboardingStep: agent.onboardingStep,
      onboardingComplete: agent.onboardingComplete,
      sofiReferralStatus: agent.sofiReferralStatus,
      payoutMethodType: agent.payoutMethodType,
    };
  }

  if (event === "agent.payout_submitted") {
    const agent = p?.agent;
    if (!agent) return payload;
    return {
      agentId: agent.id,
      payoutMethodType: agent.payoutMethodType,
      sofiReferralStatus: agent.sofiReferralStatus,
      timestamp: new Date().toISOString(),
    };
  }

  if (event === "agent.email_requested" || event === "agent.email_created" || event === "agent.email_rejected") {
    const requestedEmail = typeof p?.requestedEmail === "string" ? redactEmail(p.requestedEmail) : undefined;
    return {
      agentId: p?.agentId,
      requestedEmail,
      emailRequestId: p?.emailRequestId,
      timestamp: p?.timestamp,
    };
  }

  if (event === "agent.pipeline_stage_changed") {
    return {
      agentId: p?.agentId,
      previousStage: p?.previousStage,
      nextStage: p?.nextStage,
      timestamp: new Date().toISOString(),
    };
  }

  if (event === "onboarding.completed") {
    return { agentId: p?.agentId, timestamp: new Date().toISOString() };
  }

  if (event === "agent.ica_signed") {
    const signature = p?.signature;
    return {
      agentId: p?.agentId,
      signedAt: signature?.signedAt,
      agreed: signature?.agreed,
    };
  }

  if (event === "agent.document_added") {
    const doc = p?.document;
    return {
      agentId: p?.agentId,
      documentId: doc?.id,
      docType: doc?.docType,
      status: doc?.status,
      uploadedAt: doc?.uploadedAt,
    };
  }

  if (event === "agent.training_completed") {
    const progress = p?.progress;
    return {
      agentId: p?.agentId,
      moduleKey: p?.moduleKey,
      completed: progress?.completed,
      completedAt: progress?.completedAt,
    };
  }

  if (event === "debug.discord_test") {
    return {
      timestamp: p?.timestamp,
      ip: typeof p?.ip === "string" ? redactIp(p.ip) : undefined,
      body: redact(p?.body ?? null),
    };
  }

  return payload;
}

export async function sendDiscordWebhook(event: string, payload: unknown, options: SendDiscordWebhookOptions = {}) {
  const urls = resolveWebhookUrlsForEvent(event);
  if (!urls.length) return;

  const timeoutMs = Math.max(
    500,
    Number(process.env.DISCORD_WEBHOOK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  );

  const minimized = minimizePayload(event, payload);
  const redacted = redact(minimized);
  const json = JSON.stringify({ event, payload: redacted }, null, 2);
  const header = `**${event}**`;

  const sendOne = async (url: string) => {
    if (json.length <= 1800) {
      await postJson(url, { content: `${header}\n\`\`\`json\n${json}\n\`\`\`` }, timeoutMs);
      return;
    }
    await postWithFile(url, { content: `${header}\n(payload attached)` }, "payload.json", json, timeoutMs);
  };

  const results = await Promise.allSettled(urls.map((url) => sendOne(url)));
  if (options.throwOnError) {
    const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (failures.length) {
      const reason = failures[0]?.reason;
      throw reason instanceof Error ? reason : new Error(String(reason));
    }
  }
}

export function queueDiscordWebhook(event: string, payload: unknown) {
  void sendDiscordWebhook(event, payload).catch(() => {});
}
