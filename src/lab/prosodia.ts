// Motor de prosódia: texto marcado → frases → motor de voz, com velocidade por trecho, tom,
// expressividade, pausas calculadas, volume por emoção e contagem alinhada ao pulso (BPM).
import { parseMarkup } from "../../shared/markup";
import type { Ajustes } from "./ajustes";
import { aparar, concatenar, finalizar, silencio, volume } from "./audio";
import type { Motor, ParamsFrase } from "./motores";

interface EfeitoEstilo {
  vel?: number;
  ganho?: number;
  pausa?: number;
  tom?: number; // somado ao tom (Kokoro)
  peso?: number; // somado à expressividade (Kokoro) / variação de entonação (Piper)
  pont?: string;
  soprado?: boolean;
  contagem?: boolean;
}

/** Como cada marcação do texto modifica a fala. */
export const ESTILOS: Record<string, EfeitoEstilo> = {
  animado: { vel: 1.06, ganho: 2.5, peso: 0.15, pont: "!" },
  calmo: { vel: 0.9, ganho: -2, pausa: 1.3, peso: -0.15 },
  serio: { vel: 0.95, ganho: 0.5, pont: ".", tom: 0.1 },
  triste: { vel: 0.86, ganho: -4, pausa: 1.4, tom: 0.2, peso: -0.2 },
  sussurrando: { vel: 0.92, ganho: -9, pausa: 1.2, soprado: true },
  gritando: { vel: 1.05, ganho: 5, pont: "!", peso: 0.2 },
  curioso: { vel: 0.97, pont: "?" },
  misterioso: { vel: 0.86, ganho: -3, pausa: 1.5, tom: 0.2 },
  sarcastico: { vel: 0.94, peso: 0.1 },
  contagem: { contagem: true, ganho: 2 },
};

const PAUSA_MS: Record<string, number> = { ".": 380, "!": 340, "?": 420, "…": 650 };
const NUMEROS = /(?<![\p{L}])(um|dois|tr[eê]s|quatro|cinco|seis|sete|oito|[1-8])(?![\p{L}])/giu;

export interface Trecho {
  texto: string;
  estilo: string;
  fonemas: string;
  vel: number;
  ganhoDb: number;
  detalhe: string;
}

function frases(texto: string): string[] {
  return [...texto.matchAll(/[^.!?…\n]+[.!?…]*|\n+/g)].map((m) => m[0]).filter((f) => f.trim() || f.includes("\n"));
}

export async function falar(texto: string, a: Ajustes, motor: Motor, piper: boolean, aoAvancar?: (i: number, n: number) => void) {
  const sr = motor.sampleRate;
  const partes: Float32Array[] = [];
  const trechos: Trecho[] = [];
  const segmentos = a.usarMarcacoes
    ? parseMarkup(texto)
    : [{ style: null, freeStyle: false, rawStyle: null, pieces: [{ kind: "text" as const, text: texto.replace(/\[[^\]]*\]/g, "") }] }];

  const totalFrases = segmentos.reduce((n, s) => n + s.pieces.filter((p) => p.kind === "text").reduce((m, p) => m + frases((p as { text: string }).text).length, 0), 0);
  let feitas = 0;

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  for (const seg of segmentos) {
    const st: EfeitoEstilo = (seg.style && !seg.freeStyle && ESTILOS[seg.style]) || {};
    const ganho = (st.ganho ?? 0) * a.contraste;
    const params: ParamsFrase = piper
      ? {
          vel: a.velocidade * (st.vel ?? 1),
          ruido: clamp(a.variacaoEntonacao + (st.peso ?? 0) * 1.2, 0.1, 1.4),
          ruidoW: a.variacaoRitmo,
        }
      : {
          vel: a.velocidade * (st.vel ?? 1),
          tom: a.tom + (st.tom ?? 0),
          doador: a.doador,
          peso: clamp(a.expressividade + (st.peso ?? 0), 0, 0.8),
        };
    const fatorPausa = (a.pausas * (st.pausa ?? 1)) / Math.sqrt(a.velocidade);
    const detalhe = piper
      ? `entonação ${params.ruido!.toFixed(2)}, ritmo ${params.ruidoW!.toFixed(2)}`
      : `tom ${params.tom!.toFixed(2)}, expressividade ${params.peso!.toFixed(2)}`;

    for (const peca of seg.pieces) {
      if (peca.kind === "event") {
        const ms = peca.key === "pausa" ? 450 : peca.key === "pausa longa" ? 1000 : 220;
        partes.push(silencio(ms * fatorPausa, sr));
        continue;
      }
      const nums = peca.text.match(NUMEROS);
      if (st.contagem && nums && nums.length >= 3) {
        // Contagem no pulso: cada número começa exatamente num tempo
        const beat = (60 / a.bpm) * sr;
        const trilha = new Float32Array(Math.round(beat * (nums.length + 0.5)));
        const fon: string[] = [];
        for (let i = 0; i < nums.length; i++) {
          const { audio, fonemas } = await motor.gerar(`${nums[i]}!`, { ...params, vel: Math.min(1.3, params.vel * 1.1) });
          fon.push(fonemas);
          const v = volume(aparar(audio, sr), sr, ganho + (i === nums.length - 1 ? 1.5 : 0));
          const ini = Math.round(i * beat);
          trilha.set(v.subarray(0, Math.max(0, Math.min(v.length, trilha.length - ini))), ini);
        }
        partes.push(trilha);
        trechos.push({ texto: nums.join(", "), estilo: "contagem", fonemas: fon.join(" | "), vel: params.vel, ganhoDb: ganho, detalhe: `${a.bpm} BPM` });
        feitas += frases(peca.text).length;
        aoAvancar?.(feitas, totalFrases);
        continue;
      }
      for (let f of frases(peca.text)) {
        if (!f.trim()) {
          partes.push(silencio(600 * fatorPausa, sr));
          continue;
        }
        f = f.trim();
        if (st.pont && /[.!?]$/.test(f)) f = f.replace(/[.!?]+$/, st.pont);
        const { audio, fonemas } = await motor.gerar(f, params);
        partes.push(volume(aparar(audio, sr), sr, ganho, st.soprado));
        partes.push(silencio((PAUSA_MS[f.slice(-1)] ?? 300) * fatorPausa, sr));
        trechos.push({ texto: f, estilo: seg.style ?? "base", fonemas, vel: params.vel, ganhoDb: ganho, detalhe });
        aoAvancar?.(++feitas, totalFrases);
      }
    }
  }
  return { audio: finalizar(concatenar(partes)), sampleRate: sr, trechos };
}
