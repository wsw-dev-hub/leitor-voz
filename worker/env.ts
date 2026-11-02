export interface Env {
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  GEMINI_API_KEY?: string;
  ACCESS_CODE?: string;
  OPENAI_TTS_MODEL: string;
  ELEVENLABS_MODEL: string;
  GEMINI_TTS_MODEL: string;
  OPENAI_ANALISE_MODEL: string;
  GEMINI_ANALISE_MODEL: string;
  /** "openai" ou "gemini": qual IA faz a análise quando as duas chaves existem. */
  ANALISE_PROVEDOR?: string;
}

export class UpstreamError extends Error {
  constructor(public engine: string, public status: number, detail: string, network = false) {
    super(network ? `${engine}: ${detail}` : `${engine} respondeu ${status}: ${detail.slice(0, 400)}`);
  }
}

/** fetch para um provedor: traduz falha de rede e resposta de erro em mensagens legíveis. */
export async function callProvider(engine: string, url: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new UpstreamError(engine, 503, "não foi possível conectar ao serviço. Verifique a conexão do servidor e tente de novo.", true);
  }
  return ensureOk(engine, res);
}

export async function ensureOk(engine: string, res: Response): Promise<Response> {
  if (res.ok) return res;
  let detail = await res.text().catch(() => "");
  try {
    const j = JSON.parse(detail);
    detail = j?.error?.message ?? j?.detail?.message ?? j?.detail ?? j?.message ?? detail;
    if (typeof detail !== "string") detail = JSON.stringify(detail);
  } catch {
    /* corpo não é JSON */
  }
  throw new UpstreamError(engine, res.status, detail);
}
