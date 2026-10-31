import { Link } from "@tanstack/react-router";
import * as m from "#/paraglide/messages.js";

export function PageError() {
  return <main className="mx-auto max-w-lg p-8"><h1 className="text-xl font-semibold">{m.page_error()}</h1><Link to="/" className="mt-4 inline-block underline">{m.gallery_back()}</Link></main>;
}

export function PageNotFound() {
  return <main className="mx-auto max-w-lg p-8"><h1 className="text-xl font-semibold">{m.page_not_found()}</h1><Link to="/" className="mt-4 inline-block underline">{m.gallery_back()}</Link></main>;
}
