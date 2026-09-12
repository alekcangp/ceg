export interface VercelRequest {
  method?: string;
  body?: { address?: string; prompt?: string; seed?: string };
}

export interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
  end: () => void;
}
