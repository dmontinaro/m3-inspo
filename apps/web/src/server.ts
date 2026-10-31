import { pageRedirect } from "./lib/page-paths";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "./paraglide/server.js";

export default createServerEntry({
  fetch(request, options) {
    const redirect = pageRedirect(request);
    if (redirect) return redirect;
    return paraglideMiddleware(request, () => handler.fetch(request, options));
  },
});
