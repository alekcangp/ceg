import type { IncomingMessage, ServerResponse } from "http";

export type VercelRequest = IncomingMessage & {
  body?: { address?: string };
};

export type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};
