import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import '@fontsource-variable/manrope';
import './index.css';
import App from './App';
import { Conversation } from './pages/Conversation';
import { Assets } from './pages/Assets';
import { Saved } from './pages/Saved';
const rootRoute = createRootRoute({ component: App });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Conversation,
});
const assetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assets',
  component: Assets,
});
const savedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/saved',
  component: Saved,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, assetsRoute, savedRoute]),
});
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
