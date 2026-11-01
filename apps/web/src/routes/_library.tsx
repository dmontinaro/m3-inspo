import * as m from "#/paraglide/messages.js";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import logoUrl from "#/assets/m3-inspo-logo.svg?url";
import { OwnerMenu } from "#/components/owner-menu";
import { QuickAdd } from "#/components/quick-add";
import { getOwner } from "#/server/owner.functions";

// Frame for the signed-in pages: gallery, collections, type pairings ("Schriften"), Brand Kits and the
// generator, adding (upload and URL import), imports, reference detail, settings and tools.
// QuickAdd lets the owner paste or drop images on every one of them.
export const Route = createFileRoute("/_library")({
  loader: () => getOwner(),
  // The owner's name and avatar for the header only; access is checked on every request by the
  // owner gate. Loading them once keeps search-only steps (gallery search, every generator step)
  // from refetching them; router.invalidate() still reloads them.
  staleTime: Infinity,
  component: LibraryLayout,
});

function LibraryLayout() {
  const owner = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-stone-50 text-neutral-900">
      <header className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link to="/" className="shrink-0">
          <img src={logoUrl} alt="m3 inspo" width={1520} height={432} className="h-4 w-auto sm:h-6" />
        </Link>
        <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-4">
          {/*
            From md up only; phones reach collections through a reference's detail view, imports through
            "Hinzufügen", type pairings and Brand Kits through the avatar menu and the tools page through the
            settings there.
          */}
          <Link
            to="/collections"
            className="hidden shrink-0 rounded-md px-2.5 py-1.5 text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900 md:inline-block"
          >
            {m.collections_title()}</Link>
          <Link
            to="/type-pairings"
            className="hidden shrink-0 rounded-md px-2.5 py-1.5 text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900 md:inline-block"
          >
            {m.type_pairings_title()}</Link>
          <Link
            to="/brand-kits"
            className="hidden shrink-0 rounded-md px-2.5 py-1.5 text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900 md:inline-block"
          >
            {m.brand_kits_title()}</Link>
          <Link
            to="/imports"
            className="hidden shrink-0 rounded-md px-2.5 py-1.5 text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900 md:inline-block"
          >
            {m.imports_title()}</Link>
          <Link
            to="/tools"
            className="hidden shrink-0 rounded-md px-2.5 py-1.5 text-neutral-600 hover:bg-neutral-200/60 hover:text-neutral-900 md:inline-block"
          >
            {m.tools_title()}</Link>
          <Link
            to="/add"
            className="shrink-0 rounded-md bg-neutral-900 px-3.5 py-2 font-medium text-white hover:bg-neutral-700"
          >
            {m.add_title()}</Link>
          <OwnerMenu name={owner.name} image={owner.image} />
        </div>
      </header>
      <QuickAdd>
        <Outlet />
      </QuickAdd>
    </div>
  );
}
