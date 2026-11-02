// ElevenLabs: as marcações viram tags de áudio em inglês dentro do próprio texto.
import { renderPieces, splitText, STYLES, type Segment } from "../../shared/markup";
import { RITMOS } from "../../shared/perfil";
import { elevenBaseTags, ESTABILIDADE_VALOR } from "../../shared/persona";
import { perfilEleven } from "../../shared/voices";
import type { Persona, VoiceOption } from "../../shared/types";
import { mapLimit } from "../audio";
import { callProvider, type Env } from "../env";

const API = "https://api.elevenlabs.io/v1";

function maxChars(model: string): number {
  // Eleven v4 / Multilingual v2: 10.000 caracteres; Eleven v3: 5.000. Deixamos folga.
  return model.includes("v3") ? 4500 : 9000;
}

/** Monta blocos de texto com tags, repetindo a tag do trecho quando um trecho é cortado. */
export function buildElevenChunks(segments: Segment[], tagsBase: string, limit: number): string[] {
  const pieces: string[] = [];
  for (const seg of segments) {
    let prefix = tagsBase.trim();
    if (seg.style) prefix = seg.freeStyle ? `[${seg.rawStyle}]` : STYLES[seg.style].eleven;
    const body = renderPieces(seg.pieces, "eleven");
    for (const part of splitText(body, limit - prefix.length - 1)) pieces.push(prefix ? `${prefix} ${part}` : part);
  }
  const chunks: string[] = [];
  let buf = "";
  for (const p of pieces) {
    if (buf && buf.length + 1 + p.length > limit) {
      chunks.push(buf);
      buf = p;
    } else buf = buf ? `${buf} ${p}` : p;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export async function synthesizeEleven(env: Env, persona: Persona, segments: Segment[]): Promise<Uint8Array[]> {
  if (!persona.voz) throw new Error("Escolha uma voz da ElevenLabs na persona.");
  const chunks = buildElevenChunks(segments, elevenBaseTags(persona), maxChars(env.ELEVENLABS_MODEL));
  const speed = RITMOS[persona.ritmo].velocidade;

  return mapLimit(chunks, 2, async (text) => {
    const voiceSettings: Record<string, number> = { stability: ESTABILIDADE_VALOR[persona.estabilidade] };
    if (speed !== 1) voiceSettings.speed = speed;
    const url = `${API}/text-to-speech/${encodeURIComponent(persona.voz)}?output_format=pcm_24000`;
    const res = await callProvider("ElevenLabs", url, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: env.ELEVENLABS_MODEL, voice_settings: voiceSettings }),
    });
    return new Uint8Array(await res.arrayBuffer());
  });
}

export async function listElevenVoices(env: Env): Promise<VoiceOption[]> {
  const res = await callProvider("ElevenLabs", `${API}/voices`, { headers: { "xi-api-key": env.ELEVENLABS_API_KEY! } });
  const data = (await res.json()) as { voices?: { voice_id: string; name: string; labels?: Record<string, string> }[] };
  return (data.voices ?? []).map((v) => {
    const extra = [v.labels?.accent, v.labels?.description].filter(Boolean).join(", ");
    const perfil = perfilEleven(v.labels);
    const simb = perfil.sexo === "feminino" ? " ♀" : perfil.sexo === "masculino" ? " ♂" : "";
    return { id: v.voice_id, label: `${v.name}${simb}${extra ? ` ${extra}` : ""}`, ...perfil };
  });
}
