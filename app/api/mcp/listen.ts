import { SERVER_INFO_META_KEY, SUBSCRIPTION_ID_META_KEY } from '@modelcontextprotocol/server';

/**
 * `subscriptions/listen`, answered and then closed.
 *
 * A client opens a listen stream to hear tools/prompts/resources change. The
 * SDK serves it as SSE that stays open with a keepalive until the client
 * goes away, whatever `responseMode` says. On Vercel that is a function
 * instance held for the whole timeout: Claude's connector opened one on every
 * connect, each sat for the full 300s doing nothing, and that was nearly all
 * of the project's provisioned memory.
 *
 * Akada never has anything to say on one. Its tool list is fixed per token,
 * and the SDK's event bus is in-process, so on serverless nothing published
 * in one instance could reach a stream held by another anyway. So the SDK is
 * left to validate the request and write its acknowledgement, and the stream
 * is ended right after that with the same `complete` result the SDK writes
 * when it shuts down gracefully, which every client already has to handle.
 */

const LISTEN = 'subscriptions/listen';
const ACKNOWLEDGED = 'notifications/subscriptions/acknowledged';

type JsonRpcId = string | number;

/** The JSON-RPC id of a `subscriptions/listen` request, or undefined for anything else. */
export async function listenRequestId(request: Request): Promise<JsonRpcId | undefined> {
  if (request.method !== 'POST') return undefined;
  try {
    const body = (await request.clone().json()) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
    const { method, id } = body as { method?: unknown; id?: unknown };
    if (method !== LISTEN) return undefined;
    return typeof id === 'string' || typeof id === 'number' ? id : undefined;
  } catch {
    // Not JSON: the handler answers that itself.
    return undefined;
  }
}

/**
 * The listen response, ended once it has been acknowledged.
 *
 * Anything that is not an event stream (a refusal, a bad version) passes
 * through untouched. The upstream stream is cancelled when ours ends, which
 * is what unhooks the SDK's bus listener and keepalive timer.
 */
export function endListenAfterAcknowledgement(
  response: Response,
  subscriptionId: JsonRpcId,
  serverInfo: { name: string; version: string },
): Response {
  const type = response.headers.get('content-type') ?? '';
  if (!response.body || !type.includes('text/event-stream')) return response;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const complete = `event: message\ndata: ${JSON.stringify({
    jsonrpc: '2.0',
    id: subscriptionId,
    result: {
      resultType: 'complete',
      _meta: { [SUBSCRIPTION_ID_META_KEY]: subscriptionId, [SERVER_INFO_META_KEY]: serverInfo },
    },
  })}\n\n`;
  let pending = '';

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      pending += decoder.decode(value, { stream: true });
      let end = pending.indexOf('\n\n');
      while (end !== -1) {
        const frame = pending.slice(0, end + 2);
        pending = pending.slice(end + 2);
        controller.enqueue(encoder.encode(frame));
        if (frame.includes(ACKNOWLEDGED)) {
          controller.enqueue(encoder.encode(complete));
          controller.close();
          await reader.cancel().catch(() => {});
          return;
        }
        end = pending.indexOf('\n\n');
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  const headers = new Headers(response.headers);
  // Nothing about this one is kept alive.
  headers.delete('connection');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
