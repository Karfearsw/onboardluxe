/**
 * Unified onboarding provisioning pipeline:
 *   career approval → IONOS mailbox → CRM employee account.
 *
 * IONOS MAILBOX REALITY (verified Oct 2026): IONOS exposes NO public API for
 * creating email mailboxes. The IONOS Cloud API (api.ionos.com) covers cloud
 * infrastructure only — not the web-hosting email product. Mailboxes are
 * created manually in the My IONOS control panel (Email Portfolio → Create an
 * email address). This module therefore:
 *   1. Creates the CRM employee account automatically (server-to-server), and
 *   2. Generates the exact manual IONOS steps + temp password handoff for the
 *      admin, instead of pretending an API call exists.
 *
 * If IONOS ever ships a mailbox API (or the mailbox provider changes), add a
 * provider implementation behind `createMailbox()` and flip
 * `ionosProvider.mode` — the pipeline and UI already handle both paths.
 *
 * Secrets: all via env vars. Passwords are NEVER logged.
 */

import { decryptTempPassword } from "./email-provisioning.js";

export interface ProvisioningConfig {
  crmBaseUrl: string;
  crmApiKey: string;
  ionosApiKey: string; // reserved: no mailbox endpoint exists today; kept for future use
}

export function getProvisioningConfig(): ProvisioningConfig {
  const crmBaseUrl = (process.env.CRM_BASE_URL || "").trim().replace(/\/+$/, "");
  const crmApiKey = (process.env.CRM_API_KEY || "").trim();
  const ionosApiKey = (process.env.IONOS_API_KEY || "").trim();
  const missing: string[] = [];
  if (!crmBaseUrl) missing.push("CRM_BASE_URL");
  if (!crmApiKey) missing.push("CRM_API_KEY");
  if (missing.length) {
    throw new Error(
      `Provisioning is not configured. Set ${missing.join(" and ")} in the environment, then retry.`
    );
  }
  return { crmBaseUrl, crmApiKey, ionosApiKey };
}

// ── IONOS mailbox provider ────────────────────────────────────────────────
// mode "manual": no programmatic mailbox API exists; the pipeline hands the
// admin exact steps. mode "api": reserved for a future provider API.
export type IonosMode = "manual" | "api";

export interface IonosProvisionOutcome {
  mode: IonosMode;
  steps: string[];
  note: string;
}

export function buildIonosManualSteps(requestedEmail: string): IonosProvisionOutcome {
  return {
    mode: "manual",
    note:
      "IONOS has no API for mailbox creation — this step is manual by design. " +
      "Use the temp password from 'Reveal once' when creating the mailbox.",
    steps: [
      "1. Sign in to https://my.ionos.com (My IONOS control panel).",
      "2. Open Menu → Email → Email Portfolio (or 'Set up a new email address').",
      "3. Select the oceanluxe.org contract, then click 'Create an email address'.",
      `4. Enter the address exactly: ${requestedEmail}`,
      "5. Set the password to the temp password (use Admin → 'Reveal once' to copy it).",
      "6. Choose the included mailbox size (2 GB is fine) and save.",
      "7. Wait for IONOS to confirm the mailbox is configured.",
      "8. Back here, click 'Mark created' on this request to finish onboarding.",
      "Agent login: https://mail.ionos.com (IMAP: imap.ionos.com, SMTP: smtp.ionos.com).",
    ],
  };
}

// ── CRM employee account ──────────────────────────────────────────────────

export interface CrmUserInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string; // plaintext; the CRM hashes it server-side. NEVER log this.
  phone?: string;
}

export interface CrmUserResult {
  id: number;
  email: string;
}

/** Split "First Last" → { firstName, lastName }. Single-word names keep lastName empty. */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "Agent", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

export async function createCrmUser(
  config: ProvisioningConfig,
  input: CrmUserInput
): Promise<CrmUserResult> {
  const url = `${config.crmBaseUrl}/api/users`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.crmApiKey}`,
      },
      // role "agent": the CRM's employee role (see employee-code signup).
      // password is hashed server-side; never include it in logs or errors.
      body: JSON.stringify({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone || undefined,
        password: input.password,
        role: "agent",
      }),
    });
  } catch (e: any) {
    throw new Error(`Could not reach the CRM at ${config.crmBaseUrl}: ${e?.message || e}`);
  }

  if (res.status === 201 || res.status === 200) {
    const data = (await res.json()) as any;
    if (!data?.id) throw new Error("CRM returned no user id for the created account.");
    return { id: Number(data.id), email: String(data.email || input.email) };
  }

  const text = await res.text().catch(() => "");
  let detail = "";
  try {
    detail = (JSON.parse(text) as any)?.message || "";
  } catch {
    detail = text.slice(0, 200);
  }
  if (res.status === 400 && /already|exists|duplicate|unique/i.test(detail)) {
    throw new Error(
      `A CRM user with ${input.email} already exists. Reuse that account or remove it in the CRM, then retry.`
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      "CRM API key rejected (401/403). Check CRM_API_KEY and that the key belongs to a manager/admin user."
    );
  }
  throw new Error(`CRM user creation failed (${res.status}): ${detail || "unknown error"}`);
}

// ── Pipeline ──────────────────────────────────────────────────────────────

export interface ProvisionPipelineInput {
  request: {
    id: number;
    requestedEmail: string;
    tempPasswordCiphertext: string;
  };
  agent: {
    id: number;
    name: string;
    phone?: string | null;
  };
}

export interface ProvisionPipelineResult {
  ok: boolean;
  crmUserId?: number;
  ionos: IonosProvisionOutcome;
  error?: string;
}

/**
 * Run the provisioning pipeline for one approved email request.
 * Order: CRM account first (automatic), then IONOS manual handoff.
 * Returns ok:false with a human-readable error instead of throwing, so the
 * route can persist status=failed + provisioning_error.
 */
export async function runProvisionPipeline(
  input: ProvisionPipelineInput
): Promise<ProvisionPipelineResult> {
  const ionos = buildIonosManualSteps(input.request.requestedEmail);

  let config: ProvisioningConfig;
  try {
    config = getProvisioningConfig();
  } catch (e: any) {
    return { ok: false, ionos, error: e?.message || "Provisioning not configured." };
  }

  let tempPassword: string;
  try {
    tempPassword = decryptTempPassword(input.request.tempPasswordCiphertext);
  } catch {
    return { ok: false, ionos, error: "Could not decrypt the temp password for this request. Regenerate it and retry." };
  }

  const { firstName, lastName } = splitName(input.agent.name);
  try {
    const crmUser = await createCrmUser(config, {
      email: input.request.requestedEmail,
      firstName,
      lastName,
      password: tempPassword,
      phone: input.agent.phone || undefined,
    });
    return { ok: true, crmUserId: crmUser.id, ionos };
  } catch (e: any) {
    return { ok: false, ionos, error: e?.message || "CRM provisioning failed." };
  }
}
