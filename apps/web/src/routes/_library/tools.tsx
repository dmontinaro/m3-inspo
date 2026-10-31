import { formatNumber } from "#/lib/format";
import * as m from "#/paraglide/messages.js";
import type { ReactNode } from "react";
import {
  Blocks,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Component,
  Copy,
  FileCode,
  Files,
  FolderOpen,
  Folders,
  GitCompare,
  LayoutTemplate,
  Library,
  ListFilter,
  Palette,
  Pipette,
  ScanEye,
  Search,
  Sparkles,
  SwatchBook,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { mcpToolGuide, toolGroups, toolStatuses } from "#/lib/mcp-tool-guide";
import type { ToolGuide, ToolStatus } from "#/lib/mcp-tool-guide";

export const Route = createFileRoute("/_library/tools")({
  head: () => ({ meta: [{ title: m.tools_page_title() }] }),
  component: Tools,
});

type ToolName = keyof typeof mcpToolGuide;

const tools = Object.entries(mcpToolGuide).map(([name, guide]) => ({ name, guide }));

const statusBadges: Record<ToolStatus, { label: string; className: string; Icon: LucideIcon }> = {
  ready: { get label() { return m.tool_ready(); }, className: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", Icon: CircleCheck },
  limited: { get label() { return m.tool_limited(); }, className: "bg-amber-50 text-amber-800 ring-amber-600/20", Icon: CircleAlert },
  empty: { get label() { return m.tool_empty(); }, className: "bg-neutral-100 text-neutral-600 ring-neutral-500/20", Icon: CircleDashed },
};

/** One icon per tool, shown at the top of its card. */
const toolIcons: Record<string, LucideIcon> = {
  generate_color_scheme: WandSparkles,
  list_brand_kits: Library,
  get_brand_kit: SwatchBook,
  recommend: Sparkles,
  search_screens: Search,
  find_by_color: Pipette,
  find_examples_for_macrostructure: LayoutTemplate,
  get_filters: ListFilter,
  get_screen: ScanEye,
  get_design_system: Palette,
  get_site_pages: Files,
  compare: GitCompare,
  find_similar: Copy,
  list_collections: Folders,
  get_collection: FolderOpen,
  find_components: Component,
  find_reference_components: Blocks,
  get_reference_jsx: FileCode,
} satisfies Record<ToolName, LucideIcon>;

// The MCP tools a coding agent gets, grouped by task: one card per tool with
// its purpose. Opening a card shows a typical request and what it delivers on
// today's library.
function Tools() {
  return (
    <main className="mx-auto max-w-screen-2xl px-5 pt-2 pb-16 sm:px-8">
      <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <span aria-hidden>←</span> {m.settings_title()}</Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{m.tools_title()}</h1>
      <p className="mt-1 max-w-prose text-[15px] text-neutral-600">
        {m.tools_intro()}{" "}
        <Link to="/settings" className="text-neutral-900 underline underline-offset-4 hover:text-neutral-600">
          {m.tools_settings_link()}</Link>
      </p>
      <StatusSummary />

      {toolGroups.map((group) => (
        <section key={group.id} className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">{group.title}</h2>
          {/* items-start: an opened card grows alone instead of stretching its row. */}
          <ul className="mt-4 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools
              .filter((tool) => tool.guide.group === group.id)
              .map((tool) => (
                <ToolCard key={tool.name} name={tool.name} tool={tool.guide} />
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

/** How many tools have each status, so the state of the whole set reads at a glance. */
function StatusSummary() {
  return (
    <p className="mt-5 flex flex-wrap gap-2">
      {toolStatuses.map((status) => (
        <StatusBadge key={status} status={status} count={tools.filter((tool) => tool.guide.status === status).length} />
      ))}
    </p>
  );
}

/** A tool card that shows icon, name, status and purpose; opening it reveals when to use it and its state. */
function ToolCard({ tool, name }: { tool: ToolGuide; name: string }) {
  const Icon = toolIcons[name] ?? ScanEye;
  return (
    <li>
      <details className="group rounded-xl border border-neutral-200 bg-white shadow-xs open:shadow-sm">
        <summary className="flex cursor-pointer list-none flex-col gap-3 rounded-xl p-5 hover:bg-neutral-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 [&::-webkit-details-marker]:hidden">
          <div className="flex items-start gap-3">
            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
              <Icon className="size-5" strokeWidth={1.75} />
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1.5">
              <h3 className="min-w-0 font-semibold break-words text-neutral-900">{name}</h3>
              <StatusBadge status={tool.status} />
            </div>
          </div>
          <div className="flex items-start gap-3">
            <p className="flex-1 text-[15px] text-neutral-700">{tool.purpose}</p>
            <ChevronDown
              aria-hidden
              className="mt-0.5 size-5 shrink-0 text-neutral-400 transition-transform group-open:rotate-180"
              strokeWidth={1.75}
            />
          </div>
        </summary>
        <dl className="flex flex-col gap-4 border-t border-neutral-100 px-5 pt-4 pb-5 text-[15px]">
          <Explanation label={m.tool_when()}>
            <span className="text-neutral-600">{m.tools_example_question({ question: tool.askedFor })}</span>
          </Explanation>
          <Explanation label={m.tool_state()}>
            <span className="text-sm text-neutral-500">
              {tool.note}
            </span>
          </Explanation>
        </dl>
      </details>
    </li>
  );
}

/** One labelled explanation inside an opened tool card. */
function Explanation({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-neutral-400 uppercase">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

const statusCounts = { ready: m.tool_ready_count, limited: m.tool_limited_count, empty: m.tool_empty_count } satisfies Record<ToolStatus, (input: { count: number; formattedCount: string }) => string>;

function StatusBadge({ status, count }: { status: ToolStatus; count?: number }) {
  const { label, className, Icon } = statusBadges[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2} />
      {count === undefined ? label : statusCounts[status]({ count, formattedCount: formatNumber(count) })}
    </span>
  );
}
