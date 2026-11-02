import type { Analise, EnginesInfo, SpeakRequest, VoiceOption } from "../shared/types";

let accessCode = "";
export const setAccessCode = (code: string) => (accessCode = code);

const headers = (): HeadersInit => (accessCode ? { "x-access-code": accessCode } : {});

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.error) return j.error;
  } catch {
    /* sem JSON */
  }
  return `O servidor respondeu ${res.status}.`;
}

export async function getEngines(): Promise<EnginesInfo | null> {
  try {
    const res = await fetch("/api/engines");
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function getElevenVoices(): Promise<VoiceOption[]> {
  const res = await fetch("/api/voices?engine=elevenlabs", { headers: headers() });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export interface SpeakResult {
  blob: Blob;
  fromCache: boolean;
}

export async function speak(body: SpeakRequest, signal?: AbortSignal): Promise<SpeakResult> {
  const res = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return { blob: await res.blob(), fromCache: res.headers.get("x-cache") === "HIT" };
}

export async function analyze(text: string, signal?: AbortSignal): Promise<Analise> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}
