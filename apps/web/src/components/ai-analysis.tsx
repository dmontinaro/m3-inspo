import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { MACROSTRUCTURE_LABELS } from "@m3-inspo/taxonomy";
import type { getReference } from "#/server/library.functions";
import { reanalyzeReference } from "#/server/library.functions";

type Reference = Awaited<ReturnType<typeof getReference>>;
type Language = "de" | "en";

/** How often the detail page looks again while an analysis waits or runs. */
const refreshMs = 5000;

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

/**
 * The "KI-Analyse" card on a reference's detail view: generated description,
 * layout summary and tags, apart from the owner's notes and marked with the
 * model and version that wrote them. German by default, English on toggle.
 * "Neu analysieren" queues a new version; while it waits or runs, the page
 * refreshes itself. Without ANTHROPIC_API_KEY the card keeps showing an
 * earlier analysis, without the action, or says the analysis is off.
 */
export function AiAnalysis({ reference }: { reference: Reference }) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("de");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const { generated, analysisJob, analysisEnabled } = reference;
  const running = analysisJob?.status === "queued" || analysisJob?.status === "processing";

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void router.invalidate(), refreshMs);
    return () => clearInterval(timer);
  }, [running, router]);

  async function reanalyze() {
    setPending(true);
    setFailed(false);
    try {
      await reanalyzeReference({ data: { slug: reference.slug } });
      await router.invalidate();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  // Style, industry, components, vibe and colour words in one row, in this order (jsonb keeps
  // its own key order), each word once.
  const { style = [], industry = [], components = [], vibe = [], colorWords = [] } = generated?.tags ?? {};
  const tags = [...new Set([...style, ...industry, ...components, ...vibe, ...colorWords])];

  return (
    <section aria-labelledby="ai-analysis" className="rounded-lg bg-white p-4 ring-1 ring-neutral-200">
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden className="size-4 text-violet-500" />
        <h2 id="ai-analysis" className="flex-1 text-sm font-semibold text-neutral-900">
          KI-Analyse
        </h2>
        {generated && <LanguageSwitch language={language} onChange={setLanguage} />}
      </div>

      {generated ? (
        <>
          <p className="mt-1 text-xs text-neutral-500">
            {`Von ${generated.model} erzeugt · Version ${generated.version} · ${dateFormat.format(generated.createdAt)}`}
          </p>
          <p lang={language} className="mt-3 text-[15px] leading-relaxed text-neutral-700">
            {generated.description[language]}
          </p>
          <h3 className="mt-4 text-xs font-medium text-neutral-500">{language === "de" ? "Aufbau" : "Layout"}</h3>
          <p lang={language} className="mt-1 text-sm leading-relaxed text-neutral-700">
            {generated.layoutSummary[language]}
          </p>
          {(generated.macrostructure || tags.length > 0) && (
            <ul className="mt-4 flex flex-wrap gap-1.5 text-xs" aria-label="KI-Tags">
              {generated.macrostructure && (
                <li className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-800 ring-1 ring-violet-200 ring-inset">
                  {MACROSTRUCTURE_LABELS[generated.macrostructure]}
                </li>
              )}
              {tags.map((tag) => (
                <li key={tag} className="rounded-full bg-neutral-50 px-2 py-0.5 text-neutral-600 ring-1 ring-neutral-200 ring-inset">
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : !analysisEnabled ? (
        <p className="mt-2 text-sm text-neutral-500">
          Die KI-Analyse ist aus. Mit einem Anthropic-Schlüssel erzeugt sie Tags, Beschreibung und Aufbau.
        </p>
      ) : (
        !running && <p className="mt-2 text-sm text-neutral-500">Noch keine KI-Analyse.</p>
      )}

      {analysisEnabled && running && (
        <p className="mt-3 flex items-center gap-2 text-sm text-sky-800">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {analysisJob.status === "queued" ? "Analyse wartet auf ihren Start …" : "Die KI analysiert die Aufnahmen …"}
        </p>
      )}
      {analysisEnabled && !running && analysisJob?.status === "failed" && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm break-words text-rose-800">
          {`Die letzte Analyse ist fehlgeschlagen: ${analysisJob.errorMessage ?? "Unbekannter Fehler."}`}
        </p>
      )}
      {analysisEnabled && !running && (
        <button
          type="button"
          disabled={pending}
          onClick={reanalyze}
          className="mt-4 flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-neutral-100 disabled:opacity-60"
        >
          <RefreshCw aria-hidden className="size-3.5" />
          {generated ? "Neu analysieren" : "Jetzt analysieren"}
        </button>
      )}
      {failed && (
        <p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          Das hat nicht geklappt. Bitte versuche es noch einmal.
        </p>
      )}
    </section>
  );
}

/** DE / EN as a small segmented control. */
function LanguageSwitch({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return (
    <div role="group" aria-label="Sprache der KI-Texte" className="flex rounded-md bg-neutral-100 p-0.5 text-xs">
      {(["de", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === language}
          onClick={() => onChange(option)}
          className="rounded px-2 py-0.5 font-medium text-neutral-500 uppercase hover:text-neutral-900 aria-pressed:bg-white aria-pressed:text-neutral-900 aria-pressed:shadow-sm"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
