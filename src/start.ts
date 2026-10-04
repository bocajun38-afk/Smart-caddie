import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const isAbort = (error: unknown): boolean =>
  error != null &&
  typeof error === "object" &&
  ((error as { name?: string }).name === "AbortError" ||
    (error as { message?: string }).message?.toLowerCase() === "aborted" ||
    isAbort((error as { cause?: unknown }).cause));

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    // A closed socket is not an application error, even if the framework wraps it
    // in an HTTP error with statusCode 500.
    if (request?.signal?.aborted || isAbort(error)) {
      return new Response(null, { status: 499 });
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
