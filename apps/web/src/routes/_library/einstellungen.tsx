import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { fieldClassName } from "#/lib/form-styles";
import { defaultTokenLifetimeDays, maxTokenNameLength, mcpPath, tokenLifetimeDays } from "#/lib/mcp-tokens";
import type { TokenLifetimeDays } from "#/lib/mcp-tokens";
import { createMcpToken, listMcpTokens, revokeMcpToken } from "#/server/mcp-tokens.functions";

export const Route = createFileRoute("/_library/einstellungen")({
  head: () => ({ meta: [{ title: "Einstellungen · m3 inspo" }] }),
  loader: () => listMcpTokens(),
  component: Settings,
});

type ListedToken = Awaited<ReturnType<typeof listMcpTokens>>[number];
type NewToken = { name: string; token: string };

const lifetimeLabels: Record<TokenLifetimeDays, string> = { 30: "30 Tage", 90: "90 Tage", 365: "1 Jahr" };

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });
const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

// Settings: MCP tokens for coding agents. A new token's plaintext exists only in this
// page's state until the owner leaves or presses "Fertig"; the server keeps a hash.
function Settings() {
  const tokens = Route.useLoaderData();
  const router = useRouter();
  const [newToken, setNewToken] = useState<NewToken | null>(null);

  async function revoke(token: ListedToken) {
    if (!window.confirm(`Token „${token.name}“ widerrufen? Agenten mit diesem Token verlieren sofort den Zugriff.`)) return;
    await revokeMcpToken({ data: { id: token.id } });
    await router.invalidate();
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pt-2 pb-16 sm:px-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <span aria-hidden>←</span> Galerie
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Einstellungen</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">MCP-Zugang</h2>
        <p className="mt-1 max-w-prose text-[15px] text-neutral-600">
          Mit einem Token greifen Coding-Agenten wie Claude Code auf deine freigegebenen Referenzen zu, mit Notizen und
          Bildern. Entwürfe und archivierte Referenzen sehen sie nicht. Welche Werkzeuge sie dabei bekommen und wofür, steht
          unter{" "}
          <Link to="/werkzeuge" className="text-neutral-900 underline underline-offset-4 hover:text-neutral-600">
            Werkzeuge
          </Link>
          .
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

        <h3 className="mt-10 text-sm font-semibold text-neutral-900">Tokens</h3>
        {tokens.length === 0 ? (
          <p className="mt-2 text-[15px] text-neutral-500">Noch keine Tokens.</p>
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
      setError("Der Token konnte nicht erstellt werden. Bitte versuche es noch einmal.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <div>
          <label htmlFor="name" className="text-sm font-medium text-neutral-900">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={maxTokenNameLength}
            placeholder="z. B. Claude Code MacBook"
            className={fieldClassName}
          />
        </div>
        <div>
          <label htmlFor="expiresInDays" className="text-sm font-medium text-neutral-900">
            Gültig für
          </label>
          <select id="expiresInDays" name="expiresInDays" defaultValue={defaultTokenLifetimeDays} className={fieldClassName}>
            {tokenLifetimeDays.map((days) => (
              <option key={days} value={days}>
                {lifetimeLabels[days]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "Wird erstellt …" : "Token erstellen"}
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
      <p className="font-medium text-neutral-900">{`Token „${token.name}“ erstellt`}</p>
      <p className="mt-1 text-sm text-amber-900">
        Kopiere ihn jetzt. Er wird nur dieses eine Mal angezeigt und lässt sich später nicht wieder abrufen.
      </p>

      <CopyField label="Token" value={token.token} />
      <CopyField label="Claude Code anbinden" value={command} />
      <CopyField
        label="claude.ai anbinden"
        value={serverUrl}
        hint={
          <>
            Als Connector-URL eintragen, dazu den Header <code className="font-mono text-[13px]">x-api-key</code> mit dem
            Token von oben.
          </>
        }
      />

      <button
        type="button"
        onClick={onDone}
        className="mt-5 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100"
      >
        Fertig
      </button>
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
          {copied ? "Kopiert" : "Kopieren"}
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
            Widerrufen
          </button>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <Detail label="Erstellt" value={dateFormat.format(token.createdAt)} />
        <Detail label={tokenStatuses[status].dateLabel} value={dateFormat.format(token.revokedAt ?? token.expiresAt)} />
        <Detail label="Zuletzt genutzt" value={token.lastUsedAt ? dateTimeFormat.format(token.lastUsedAt) : "Noch nie"} />
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
  active: { label: "Aktiv", dateLabel: "Läuft ab", className: "bg-emerald-50 text-emerald-800 ring-emerald-600/20" },
  expired: { label: "Abgelaufen", dateLabel: "Abgelaufen", className: "bg-neutral-100 text-neutral-600 ring-neutral-500/20" },
  revoked: { label: "Widerrufen", dateLabel: "Widerrufen", className: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

function StatusBadge({ status }: { status: keyof typeof tokenStatuses }) {
  const { label, className } = tokenStatuses[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>{label}</span>;
}
