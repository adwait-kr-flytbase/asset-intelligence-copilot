import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const route = createRootRoute({ component: Outlet });
const splitRoute = createRoute({
  getParentRoute: () => route,
  path: '/',
  component: () => <App />,
});
const conversationRoute = createRoute({
  getParentRoute: () => route,
  path: '/conversation',
  component: () => <App experience="conversation" />,
});
const operatorRoute = createRoute({
  getParentRoute: () => route,
  path: '/operator',
  component: () => <App experience="operator" />,
});
const router = createRouter({
  routeTree: route.addChildren([splitRoute, conversationRoute, operatorRoute]),
});
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
const queryClient = new QueryClient();
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
