// OpenAI: um pedido por trecho de estilo, com a personalidade no campo `instructions`.
import { renderPieces, splitText, styleInstruction, type Segment } from "../../shared/markup";
import { personaInstruction } from "../../shared/persona";
import type { Persona } from "../../shared/types";
import { mapLimit, silence } from "../audio";
import { callProvider, type Env } from "../env";

const MAX_CHARS = 3000; // o modelo aceita ~2.000 tokens de entrada por pedido

export async function synthesizeOpenAI(env: Env, persona: Persona, segments: Segment[]): Promise<Uint8Array[]> {
  const jobs: { text: string; instructions: string }[] = [];
  for (const seg of segments) {
    const text = renderPieces(seg.pieces, "fallback");
    if (!text.replace(/[.\s]/g, "")) continue;
    const instructions = personaInstruction(persona, styleInstruction(seg));
    for (const part of splitText(text, MAX_CHARS)) jobs.push({ text: part, instructions });
  }

  const audios = await mapLimit(jobs, 3, async (job) => {
    const res = await callProvider("OpenAI", "https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_TTS_MODEL,
        voice: persona.voz || "coral",
        input: job.text,
        instructions: job.instructions,
        response_format: "pcm", // PCM 16-bit mono 24 kHz, sem cabeçalho
      }),
    });
    return new Uint8Array(await res.arrayBuffer());
  });

  // Pequena respiração entre trechos gerados separadamente
  return audios.flatMap((a, i) => (i < audios.length - 1 ? [a, silence(150)] : [a]));
}
