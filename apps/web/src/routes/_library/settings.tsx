import { formatDate, formatNumber } from "#/lib/format";
import { useLanguageGuard, useFormLanguageGuard , LanguageControl  } from "#/components/language-control";
import * as m from "#/paraglide/messages.js";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { fieldClassName } from "#/lib/form-styles";
import { defaultTokenLifetimeDays, maxTokenNameLength, mcpPath, tokenLifetimeDays } from "#/lib/mcp-tokens";
import type { TokenLifetimeDays } from "#/lib/mcp-tokens";
import { createMcpToken, listMcpTokens, revokeMcpToken } from "#/server/mcp-tokens.functions";

export const Route = createFileRoute("/_library/settings")({
  head: () => ({ meta: [{ title: m.settings_page_title() }] }),
  loader: () => listMcpTokens(),
  component: Settings,
});

type ListedToken = Awaited<ReturnType<typeof listMcpTokens>>[number];
type NewToken = { name: string; token: string };

const lifetimeLabels: Record<TokenLifetimeDays, () => string> = { 30: () => m.token_lifetime_days({ days: formatNumber(30) }), 90: () => m.token_lifetime_days({ days: formatNumber(90) }), 365: m.token_lifetime_year };


// Settings: MCP tokens for coding agents. A new token's plaintext exists only in this
// page's state until the owner leaves or presses "Fertig"; the server keeps a hash.
function Settings() {
  const tokens = Route.useLoaderData();
  const router = useRouter();
  const [newToken, setNewToken] = useState<NewToken | null>(null);
  const [revokeFailed, setRevokeFailed] = useState(false);
  useLanguageGuard({ blocker: newToken ? m.language_block_token() : undefined });

  async function revoke(token: ListedToken) {
    if (!window.confirm(m.token_revoke_confirm({ name: token.name }))) return;
    setRevokeFailed(false);
    try {
      await revokeMcpToken({ data: { id: token.id } });
      await router.invalidate();
    } catch {
      setRevokeFailed(true);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pt-2 pb-16 sm:px-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <span aria-hidden>←</span> {m.gallery_title()}</Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{m.settings_title()}</h1>

      <LanguageControl />
      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">{m.mcp_access()}</h2>
        <p className="mt-1 max-w-prose text-[15px] text-neutral-600">
          {m.mcp_access_help()}{" "}
          <Link to="/tools" className="text-neutral-900 underline underline-offset-4 hover:text-neutral-600">
            {m.mcp_tools_link()}</Link>
        </p>

        {newToken ? (
          <CreatedToken token={newToken} onDone={() => setNewToken(null)} />
        ) : (
          <CreateTokenForm
            onCreated={async (created) => {
              setNewToken(created);
              await router.invalidate();
            }}
          />
        )}

        {revokeFailed && <p role="alert" className="mt-4 text-sm text-rose-700">{m.action_failed()}</p>}
        <h3 className="mt-10 text-sm font-semibold text-neutral-900">{m.tokens_title()}</h3>
        {tokens.length === 0 ? (
          <p className="mt-2 text-[15px] text-neutral-500">{m.tokens_none()}</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {tokens.map((token) => (
              <TokenRow key={token.id} token={token} onRevoke={() => revoke(token)} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function CreateTokenForm({ onCreated }: { onCreated: (token: NewToken) => Promise<void> }) {
  const languageForm = useFormLanguageGuard();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { token, credential } = await createMcpToken({ data: new FormData(event.currentTarget) });
      await onCreated({ name: credential.name, token });
    } catch {
      setError(m.token_create_failed());
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={languageForm.form} noValidate onSubmit={submit} className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <div>
          <label htmlFor="name" className="text-sm font-medium text-neutral-900">
            {m.field_name()}</label>
          <input
            id="name"
            name="name"
            required
            maxLength={maxTokenNameLength}
            placeholder={m.token_name_placeholder()}
            className={fieldClassName}
          />
        </div>
        <div>
          <label htmlFor="expiresInDays" className="text-sm font-medium text-neutral-900">
            {m.token_valid_for()}</label>
          <select id="expiresInDays" name="expiresInDays" defaultValue={defaultTokenLifetimeDays} className={fieldClassName}>
            {tokenLifetimeDays.map((days) => (
              <option key={days} value={days}>
                {lifetimeLabels[days]()}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? m.token_creating() : m.token_create()}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
    </form>
  );
}

// The one moment the plaintext is visible, together with the ready-to-run Claude Code command
// and the server URL for a claude.ai connector, which sends the token as `x-api-key`.
function CreatedToken({ token, onDone }: { token: NewToken; onDone: () => void }) {
  const serverUrl = `${window.location.origin}${mcpPath}`;
  const command = `claude mcp add --transport http m3-inspo ${serverUrl} --header "Authorization: Bearer ${token.token}"`;

  return (
    <div role="status" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:p-5">
      <p className="font-medium text-neutral-900">{m.token_created_name({ name: token.name })}</p>
      <p className="mt-1 text-sm text-amber-900">
        {m.token_copy_now()}</p>

      <CopyField label="Token" value={token.token} />
      <CopyField label={m.token_connect_claude()} value={command} />
      <CopyField
        label={m.token_connect_claude_web()}
        value={serverUrl}
        hint={
          <>
            {m.token_connector_help()}<code className="font-mono text-[13px]">x-api-key</code> {m.token_header_help()}</>
        }
      />

      <button
        type="button"
        onClick={onDone}
        className="mt-5 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
      >
        {m.action_done()}</button>
    </div>
  );
}

function CopyField({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access (e.g. not a secure origin): the text stays selectable.
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-neutral-900">{label}</p>
      <div className="mt-1.5 flex items-start gap-2">
        <code className="block min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-[13px] break-all text-neutral-900 select-all">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          {copied ? m.action_copied() : m.action_copy()}
        </button>
      </div>
      {hint && <p className="mt-1.5 text-sm text-neutral-600">{hint}</p>}
    </div>
  );
}

function TokenRow({ token, onRevoke }: { token: ListedToken; onRevoke: () => void }) {
  const status = token.revokedAt ? "revoked" : token.expiresAt <= new Date() ? "expired" : "active";

  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-neutral-900">{token.name}</span>
            <StatusBadge status={status} />
          </p>
          <p className="mt-0.5 font-mono text-[13px] text-neutral-500">{`${token.tokenPrefix}…`}</p>
        </div>
        {status === "active" && (
          <button
            type="button"
            onClick={onRevoke}
            className="shrink-0 rounded-md px-2.5 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
          >
            {m.token_revoked()}</button>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <Detail label={m.token_created()} value={formatDate(token.createdAt, { dateStyle: "medium", timeStyle: "short" })} />
        <Detail label={tokenStatuses[status].dateLabel} value={formatDate(token.revokedAt ?? token.expiresAt)} />
        <Detail label={m.token_last_used()} value={token.lastUsedAt ? formatDate(token.lastUsedAt, { dateStyle: "medium", timeStyle: "short" }) : m.token_never_used()} />
      </dl>
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-neutral-800">{value}</dd>
    </div>
  );
}

/** Per token status: the badge, and the label of the date shown next to "Erstellt". */
const tokenStatuses = {
  active: { get label() { return m.token_active(); }, get dateLabel() { return m.token_expires(); }, className: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" },
  expired: { get label() { return m.token_expired(); }, get dateLabel() { return m.token_expired(); }, className: "bg-neutral-100 text-neutral-600 ring-neutral-500/20" },
  revoked: { get label() { return m.token_revoked(); }, get dateLabel() { return m.token_revoked(); }, className: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

function StatusBadge({ status }: { status: keyof typeof tokenStatuses }) {
  const { label, className } = tokenStatuses[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>{label}</span>;
}
