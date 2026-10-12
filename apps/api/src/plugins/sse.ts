// api/plugins/sse — GET /v1/stream. Services publish domain events;
// connected browsers get pushes, everyone else polls (visible indicator).
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface StreamEvent {
  kind: string;
  [key: string]: unknown;
}

type Subscriber = (chunk: string) => void;
const subscribers = new Set<Subscriber>();

export function publish(event: StreamEvent): void {
  const chunk = `data: ${JSON.stringify({ ...event, at: new Date().toISOString() })}\n\n`;
  for (const send of subscribers) {
    try {
      send(chunk);
    } catch {
      /* drop dead subscriber on next heartbeat */
    }
  }
}

export function subscriberCount(): number {
  return subscribers.size;
}

export async function streamHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send: Subscriber = (chunk: string) => reply.raw.write(chunk);
  subscribers.add(send);
  reply.raw.write(`data: ${JSON.stringify({ kind: 'hello', at: new Date().toISOString() })}\n\n`);
  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      subscribers.delete(send);
    }
  }, 25000);
  req.raw.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(send);
  });
}
