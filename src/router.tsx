import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

let routerSingleton: ReturnType<typeof createRouter> | undefined;

export function getRouter() {
  if (!routerSingleton) {
    const queryClient = new QueryClient();
    routerSingleton = createRouter({
      routeTree,
      context: { queryClient },
      scrollRestoration: true,
      defaultPreloadStaleTime: 0,
    });
  }
  return routerSingleton;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
