// Voz do navegador (Web Speech API): grátis e sem chave, útil para testar o texto e as marcações.
// A qualidade depende das vozes instaladas no sistema e não permite baixar o áudio.
import { renderPieces, STYLES, type Segment } from "../shared/markup";
import { ENERGIAS, ENTONACOES, IDADES, RITMOS, SEXOS } from "../shared/perfil";
import type { Persona, VoiceOption } from "../shared/types";
import { perfilPeloNome } from "../shared/voices";

export const browserTtsAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window;

export interface BrowserVoices {
  todas: VoiceOption[];
  /** Só as vozes em português (para a escolha automática). */
  portugues: VoiceOption[];
}

export function browserVoices(): Promise<BrowserVoices> {
  if (!browserTtsAvailable()) return Promise.resolve({ todas: [], portugues: [] });
  const map = (vs: SpeechSynthesisVoice[]): BrowserVoices => {
    const todas = vs
      .slice()
      .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
      .map((v) => {
        const perfil = perfilPeloNome(v.name);
        const simb = perfil.sexo === "feminino" ? " ♀" : perfil.sexo === "masculino" ? " ♂" : "";
        return { id: v.name, label: `${v.name}${simb} (${v.lang})`, ...perfil };
      });
    const pt = new Set(vs.filter((v) => v.lang.toLowerCase().startsWith("pt")).map((v) => v.name));
    return { todas, portugues: todas.filter((v) => pt.has(v.id)) };
  };
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(map(now));
  return new Promise((resolve) => {
    const done = () => resolve(map(speechSynthesis.getVoices()));
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

/** Vozes em português primeiro; vozes "naturais"/online do sistema antes das demais. */
function score(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (v.lang.toLowerCase().startsWith("pt-br")) s += 4;
  else if (v.lang.toLowerCase().startsWith("pt")) s += 3;
  if (/natural|online|neural|premium|enhanced/i.test(v.name)) s += 1;
  return s;
}

export function stopBrowser() {
  if (browserTtsAvailable()) speechSynthesis.cancel();
}

export function speakBrowser(persona: Persona, segments: Segment[], onEnd: () => void) {
  stopBrowser();
  const voice = speechSynthesis.getVoices().find((v) => v.name === persona.voz);
  const idade = IDADES[persona.idade].ajuste;
  const ent = ENTONACOES[persona.entonacao].ajuste;
  const baseRate = RITMOS[persona.ritmo].velocidade * (idade.rate ?? 1) * (ent.rate ?? 1);
  const basePitch = SEXOS[persona.sexo].pitch * (idade.pitch ?? 1) * (ent.pitch ?? 1) * ENERGIAS[persona.energia].pitch;
  const queue = segments
    .map((seg) => {
      const text = renderPieces(seg.pieces, "fallback");
      if (!text.replace(/[.\s]/g, "")) return null;
      const adj = seg.style && !seg.freeStyle ? STYLES[seg.style].browser : {};
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice?.lang ?? "pt-BR";
      if (voice) u.voice = voice;
      u.rate = clamp(baseRate * (adj.rate ?? 1), 0.5, 2);
      u.pitch = clamp(basePitch * (adj.pitch ?? 1), 0, 2);
      u.volume = adj.volume ?? 1;
      return u;
    })
    .filter((u): u is SpeechSynthesisUtterance => !!u);
  if (!queue.length) return onEnd();
  queue[queue.length - 1].onend = onEnd;
  queue[queue.length - 1].onerror = onEnd;
  queue.forEach((u) => speechSynthesis.speak(u));
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
