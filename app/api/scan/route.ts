import { scan, type ScanEvent } from "@/lib/scan";

// Playwright drives a real browser, so this must run on the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * This endpoint makes the server fetch a URL of the caller's choosing, so
 * without a guard it is a server-side request forgery primitive: anyone could
 * point it at cloud metadata endpoints or services on the host's private
 * network and read the response back through the audit report.
 *
 * Loopback and private ranges are allowed only in development, where the target
 * is the developer's own machine and the fixture app lives on localhost.
 */
function validateTarget(
  raw: string
): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That doesn't look like a valid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Axiom can only audit http and https URLs." };
  }

  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (isPrivate && process.env.NODE_ENV === "production") {
    return {
      ok: false,
      reason: "Private and loopback addresses can't be audited.",
    };
  }

  return { ok: true, url };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = params.get("url") ?? "";
  const depth = params.get("depth") === "page" ? "page" : "site";
  // Clamp: a caller cannot ask us to crawl an unbounded number of pages.
  const maxPages = Math.min(
    Math.max(Number(params.get("maxPages")) || 25, 1),
    100
  );
  const check = validateTarget(target);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ScanEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected; the scan will finish and close on its own.
        }
      };

      if (!check.ok) {
        send({ type: "error", message: check.reason });
        controller.close();
        return;
      }

      try {
        await scan({
          url: check.url.toString(),
          depth,
          maxPages,
          onEvent: send,
        });
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "The audit failed unexpectedly.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
