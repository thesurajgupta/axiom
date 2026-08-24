import { scanFiles, type CodeScanEvent } from "@/lib/code/scan";
import { unzipToSourceFiles } from "@/lib/code/unzip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Reject anything larger than this before reading it into memory. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Audit an uploaded project archive.
 *
 * Privacy contract, enforced by the shape of this handler:
 *   - the archive is read into memory and unzipped in RAM
 *   - findings are computed and returned
 *   - nothing is written to disk, logged, persisted, or sent to any third party
 *   - when the response ends, the buffers are gone
 *
 * The scan itself makes no network calls.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return Response.json(
      { error: "Upload a .zip of your project as multipart form data." },
      { status: 400 }
    );
  }

  let archive: Uint8Array;
  try {
    const form = await request.formData();
    const file = form.get("project");
    if (!(file instanceof Blob)) {
      return Response.json({ error: "No file received." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: "That archive is over 25 MB. Zip just the source, without node_modules." },
        { status: 413 }
      );
    }
    archive = new Uint8Array(await file.arrayBuffer());
  } catch {
    return Response.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: CodeScanEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        const { files, skipped, rootLabel } = unzipToSourceFiles(archive);
        if (files.length === 0) {
          send({
            type: "status",
            message:
              "No source files found in that archive. Make sure you zipped the project folder itself.",
          });
          controller.close();
          return;
        }
        scanFiles(files, { root: rootLabel, skipped }, send);
      } catch {
        send({
          type: "status",
          message: "That file could not be unzipped. Is it a valid .zip?",
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
    },
  });
}
