import { PageError, PageNotFound } from "./components/page-feedback"
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { parseSearch, stringifySearch } from './lib/search'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultErrorComponent: PageError,
    defaultNotFoundComponent: PageNotFound,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    parseSearch,
    stringifySearch,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
