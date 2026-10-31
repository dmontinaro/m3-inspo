import { createFileRoute } from "@tanstack/react-router";
import { probeLocale } from "#/server/paraglide-spike.functions";

export const Route = createFileRoute("/_library/paraglide-spike")({
  loader: () => probeLocale({ data: { title: "", delay: 0 } }),
  component: SpikeResult,
});

function SpikeResult() {
  return <pre>{JSON.stringify(Route.useLoaderData())}</pre>;
}
