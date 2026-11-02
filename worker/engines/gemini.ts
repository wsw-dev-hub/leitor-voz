// Gemini: cada trecho vai como uma parte de texto com anotação de estilo (speech_metadata).
import { renderPieces, styleInstruction, type Segment } from "../../shared/markup";
import { personaInstruction } from "../../shared/persona";
import type { Persona } from "../../shared/types";
import { base64ToBytes, mapLimit, stripWavHeader } from "../audio";
import { callProvider, type Env } from "../env";

const API = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_CHARS = 4000; // por pedido (limite conservador)

interface Part {
  type: "text";
  text: string;
  annotations: { type: "speech_metadata"; style: string }[];
}

export function buildGeminiRequests(persona: Persona, segments: Segment[]): Part[][] {
  const requests: Part[][] = [];
  let cur: Part[] = [];
  let size = 0;
  for (const seg of segments) {
    const text = renderPieces(seg.pieces, "gemini");
    if (!text) continue;
    const part: Part = {
      type: "text",
      text,
      annotations: [{ type: "speech_metadata", style: personaInstruction(persona, styleInstruction(seg)) }],
    };
    if (cur.length && size + text.length > MAX_CHARS) {
      requests.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(part);
    size += text.length;
  }
  if (cur.length) requests.push(cur);
  return requests;
}

/** Extrai o último bloco de áudio da resposta (formato Interactions; aceita também o formato antigo). */
export function extractGeminiAudio(data: any): string | null {
  const audios: string[] = [];
  for (const step of data?.steps ?? []) {
    if (step?.type !== "model_output") continue;
    for (const c of step.content ?? []) if (c?.type === "audio" && c.data) audios.push(c.data);
  }
  if (audios.length) return audios[audios.length - 1];
  if (data?.output_audio?.data) return data.output_audio.data;
  const inline = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
  return inline?.inlineData?.data ?? null;
}

export async function synthesizeGemini(env: Env, persona: Persona, segments: Segment[]): Promise<Uint8Array[]> {
  const requests = buildGeminiRequests(persona, segments);
  return mapLimit(requests, 2, async (content) => {
    const res = await callProvider("Gemini", API, {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.GEMINI_TTS_MODEL,
        input: [{ type: "user_input", content }],
        response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 },
        generation_config: { speech_config: [{ voice: persona.voz || "Kore" }] },
      }),
    });
    const b64 = extractGeminiAudio(await res.json());
    if (!b64) throw new Error("Gemini não devolveu áudio para este trecho.");
    return stripWavHeader(base64ToBytes(b64));
  });
}
