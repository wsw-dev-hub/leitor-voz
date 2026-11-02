// Linguagem de marcação do editor.
//
// O usuário escreve tags entre colchetes no meio do texto:
//   [animado] Bem-vindos à aula! [risada] Hoje vamos [pausa] dançar. [sussurrando] É segredo. [normal] Vamos lá.
//
// - Tags de ESTILO valem do ponto em que aparecem até a próxima tag de estilo (ou [normal]).
// - Tags de EVENTO acontecem num ponto só (risada, suspiro, pausa...).
// - Tags desconhecidas viram estilo livre: o texto da tag é usado como instrução
//   (ex.: [voz de locutor de rádio]) e é repassado como está para a ElevenLabs.

export interface StyleDef {
  label: string;
  /** Tag equivalente na ElevenLabs (em inglês). */
  eleven: string;
  /** Descrição em linguagem natural para OpenAI/Gemini. */
  instrucao: string;
  /** Ajustes para a voz do navegador. */
  browser: { rate?: number; pitch?: number; volume?: number };
}

export interface EventDef {
  label: string;
  eleven: string;
  gemini: string;
  /** O que entra no texto para motores sem eventos (OpenAI / navegador). */
  fallback: string;
}

export const STYLES: Record<string, StyleDef> = {
  animado: { label: "Animado", eleven: "[excited]", instrucao: "com empolgação, energia alta e sorriso na voz", browser: { rate: 1.1, pitch: 1.2 } },
  calmo: { label: "Calmo", eleven: "[calm]", instrucao: "com calma, voz tranquila e acolhedora", browser: { rate: 0.9, pitch: 0.95 } },
  serio: { label: "Sério", eleven: "[serious]", instrucao: "em tom sério e firme", browser: { rate: 0.95, pitch: 0.9 } },
  triste: { label: "Triste", eleven: "[sad]", instrucao: "com tristeza, voz mais baixa e lenta", browser: { rate: 0.85, pitch: 0.8 } },
  sussurrando: { label: "Sussurrando", eleven: "[whispers]", instrucao: "sussurrando, bem baixinho e próximo", browser: { rate: 0.9, volume: 0.5 } },
  gritando: { label: "Gritando", eleven: "[shouts]", instrucao: "gritando, com muita intensidade", browser: { rate: 1.1, pitch: 1.3, volume: 1 } },
  curioso: { label: "Curioso", eleven: "[curious]", instrucao: "com curiosidade, como quem faz uma descoberta", browser: { pitch: 1.1 } },
  misterioso: { label: "Misterioso", eleven: "[mysteriously]", instrucao: "em tom misterioso e suspense", browser: { rate: 0.85, pitch: 0.85 } },
  sarcastico: { label: "Sarcástico", eleven: "[sarcastic]", instrucao: "com sarcasmo e ironia", browser: { pitch: 1.05 } },
  contagem: { label: "Contagem", eleven: "[rhythmic][emphatic]", instrucao: "marcando o ritmo como professor de dança, cada número bem acentuado e no tempo, como uma contagem musical", browser: { rate: 0.95, pitch: 1.1 } },
};

export const EVENTS: Record<string, EventDef> = {
  risada: { label: "Risada", eleven: "[laughs]", gemini: "<laugh>", fallback: "" },
  suspiro: { label: "Suspiro", eleven: "[sighs]", gemini: "<sigh>", fallback: "" },
  pausa: { label: "Pausa", eleven: "...", gemini: "<short pause>", fallback: "..." },
  "pausa longa": { label: "Pausa longa", eleven: "... ...", gemini: "<long pause>", fallback: "... ..." },
  tosse: { label: "Tosse", eleven: "[clears throat]", gemini: "<cough>", fallback: "" },
  surpresa: { label: "Surpresa", eleven: "[gasps]", gemini: "<gasp>", fallback: "" },
};

export const RESET_TAG = "normal";

/** Remove acentos e normaliza para comparar tags ("Sério" → "serio"). */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export type Piece =
  | { kind: "text"; text: string }
  | { kind: "event"; key: string; raw: string };

export interface Segment {
  /** null = estilo base da persona; string = chave em STYLES ou estilo livre. */
  style: string | null;
  /** true se `style` não está em STYLES (estilo livre escrito pelo usuário). */
  freeStyle: boolean;
  /** Texto original da tag de estilo (para repassar à ElevenLabs quando livre). */
  rawStyle: string | null;
  pieces: Piece[];
}

const TAG_RE = /\[([^\[\]\n]{1,60})\]/g;

/** Divide o texto em segmentos de estilo, com eventos dentro de cada segmento. */
export function parseMarkup(input: string): Segment[] {
  const segments: Segment[] = [];
  let current: Segment = { style: null, freeStyle: false, rawStyle: null, pieces: [] };
  let last = 0;

  const pushText = (t: string) => {
    if (!t) return;
    const prev = current.pieces[current.pieces.length - 1];
    if (prev && prev.kind === "text") prev.text += t;
    else current.pieces.push({ kind: "text", text: t });
  };
  const startSegment = (style: string | null, freeStyle: boolean, rawStyle: string | null) => {
    if (hasContent(current)) segments.push(current);
    current = { style, freeStyle, rawStyle, pieces: [] };
  };

  for (const m of input.matchAll(TAG_RE)) {
    pushText(input.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const raw = m[1];
    const key = normalizeTag(raw);
    if (key === RESET_TAG) startSegment(null, false, null);
    else if (key in EVENTS) current.pieces.push({ kind: "event", key, raw });
    else if (key in STYLES) startSegment(key, false, raw);
    else startSegment(raw.trim(), true, raw.trim());
  }
  pushText(input.slice(last));
  if (hasContent(current)) segments.push(current);

  // Limpa espaços nas bordas e descarta segmentos vazios
  return segments
    .map((s) => ({ ...s, pieces: trimPieces(s.pieces) }))
    .filter(hasContent);
}

function hasContent(s: Segment): boolean {
  return s.pieces.some((p) => p.kind === "event" || p.text.trim().length > 0);
}

function trimPieces(pieces: Piece[]): Piece[] {
  const out = pieces.map((p) => ({ ...p }));
  const first = out[0];
  if (first?.kind === "text") first.text = first.text.replace(/^\s+/, "");
  const lastP = out[out.length - 1];
  if (lastP?.kind === "text") lastP.text = lastP.text.replace(/\s+$/, "");
  return out.filter((p) => p.kind === "event" || p.text.length > 0);
}

/** Instrução em linguagem natural para o estilo de um segmento (OpenAI/Gemini). */
export function styleInstruction(seg: Segment): string | null {
  if (!seg.style) return null;
  return seg.freeStyle ? seg.style : STYLES[seg.style].instrucao;
}

/** Texto do segmento com eventos convertidos para o formato do motor. */
export function renderPieces(pieces: Piece[], mode: "eleven" | "gemini" | "fallback"): string {
  return pieces
    .map((p) => {
      if (p.kind === "text") return p.text;
      const ev = EVENTS[p.key];
      const out = mode === "eleven" ? ev.eleven : mode === "gemini" ? ev.gemini : ev.fallback;
      return out ? ` ${out} ` : " ";
    })
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Texto único no formato da ElevenLabs (tags em inglês, inline). */
export function renderForEleven(segments: Segment[], tagsBase: string): string {
  const base = tagsBase.trim();
  const parts = segments.map((seg) => {
    let prefix = base;
    if (seg.style) prefix = seg.freeStyle ? `[${seg.rawStyle}]` : STYLES[seg.style].eleven;
    const body = renderPieces(seg.pieces, "eleven");
    return prefix ? `${prefix} ${body}` : body;
  });
  return parts.join(" ").trim();
}

/** Texto limpo, sem nenhuma marcação (contagem de caracteres, voz do navegador). */
export function plainText(segments: Segment[]): string {
  return segments.map((s) => renderPieces(s.pieces, "fallback")).join(" ").trim();
}

/**
 * Divide um texto longo em blocos de até `max` caracteres, cortando em fim de frase
 * (ou, em último caso, em espaço). Cada motor tem um limite por requisição.
 */
export function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?…\n]+[.!?…]*[\s\n]*|[\n]+/g) ?? [text];
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + s).length <= max) {
      buf += s;
      continue;
    }
    if (buf.trim()) chunks.push(buf.trim());
    buf = "";
    if (s.length <= max) {
      buf = s;
    } else {
      // Frase gigante: corta em espaços
      let rest = s;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(" ", max);
        if (cut < max * 0.5) cut = max;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut);
      }
      buf = rest;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}
