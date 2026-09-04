import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

import { AppHome } from "./index";
import { ShapeToolsHome } from "./shape-tools";

function RootLayout(): React.JSX.Element {
  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  component: AppHome,
  getParentRoute: () => rootRoute,
  path: "/",
});

const shapeToolsRoute = createRoute({
  component: ShapeToolsHome,
  getParentRoute: () => rootRoute,
  path: "/shape-tools",
});

export const routeTree = rootRoute.addChildren([indexRoute, shapeToolsRoute]);
