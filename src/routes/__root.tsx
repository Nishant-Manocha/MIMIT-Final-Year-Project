import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";

import appCss from "../styles.css?url";

const faviconSvg =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='10' y1='54' x2='54' y2='10' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%236d5dfc'/%3E%3Cstop offset='.55' stop-color='%238b5cf6'/%3E%3Cstop offset='1' stop-color='%232dd4bf'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='%2309081f'/%3E%3Crect x='7' y='7' width='50' height='50' rx='15' fill='url(%23g)'/%3E%3Cpath d='M24 19c-4 0-7 3-7 7 0 2 .7 3.6 2 5-1.3 1.4-2 3-2 5 0 4 3 7 7 7 2.4 0 4.4-1 5.7-2.8V23.3C28.4 21.2 26.4 19 24 19Zm16 0c4 0 7 3 7 7 0 2-.7 3.6-2 5 1.3 1.4 2 3 2 5 0 4-3 7-7 7-2.4 0-4.4-1-5.7-2.8V23.3C35.6 21.2 37.6 19 40 19Z' fill='white' fill-opacity='.94'/%3E%3Cpath d='M51 13l1.7 4.3L57 19l-4.3 1.7L51 25l-1.7-4.3L45 19l4.3-1.7L51 13Z' fill='%232dd4bf'/%3E%3C/svg%3E";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="glass-strong gradient-border max-w-md rounded-2xl p-10 text-center">
        <h1 className="text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Lost in the network</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist — or the model hasn't learned it yet.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground glow-sm transition hover:brightness-110"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="glass-strong gradient-border max-w-md rounded-2xl p-10 text-center">
        <h1 className="text-xl font-semibold">Something broke</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="rounded-lg border border-border px-4 py-2 text-sm">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AdaptiveAI — Personalized Learning, Powered by AI" },
      {
        name: "description",
        content:
          "An adaptive learning platform that adjusts difficulty, recommends what to study next, and tutors you with AI. Built for ambitious learners.",
      },
      { name: "author", content: "AdaptiveAI" },
      { property: "og:title", content: "AdaptiveAI — Personalized Learning, Powered by AI" },
      {
        property: "og:description",
        content: "Adaptive quizzes, ML-powered recommendations, and a 24/7 AI tutor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: faviconSvg },
      { rel: "shortcut icon", href: faviconSvg },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster position="top-right" theme="dark" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
