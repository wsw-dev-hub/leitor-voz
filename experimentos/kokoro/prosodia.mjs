// Motor de prosódia para o Kokoro (protótipo em JS puro: roda no Node e no navegador).
// Texto marcado → trechos → frases → Kokoro frase a frase, com velocidade, tom, expressividade,
// pausas e volume controlados; contagens musicais alinhadas a um pulso (BPM).
import fs from "node:fs";
import * as ort from "onnxruntime-web";
import createEphone, { roa } from "ephone";
import { parseMarkup } from "../../shared/markup.ts";

const SR = 24000;
const VOCAB = JSON.parse(fs.readFileSync(new URL("./vocab.json", import.meta.url), "utf8"));
const E2M = [["aɪ", "I"], ["aʊ", "W"], ["dz", "ʣ"], ["dʒ", "ʤ"], ["eɪ", "A"], ["oʊ", "O"], ["əʊ", "Q"], ["ts", "ʦ"], ["tʃ", "ʧ"], ["ɔɪ", "Y"]];

// ---------------------------------------------------------------- perfis
const RITMO = { 1: 0.82, 2: 0.9, 3: 0.96, 4: 1.04, 5: 1.12 };
const IDADE_K = { crianca: 0.6, jovem: 0.8, adulto: 1.0, maduro: 1.3, idoso: 1.6 }; // tom: <1 mais agudo/leve, >1 mais grave
// Expressividade: mistura a "prosódia" (entonação/duração) de uma voz doadora do mesmo sexo, sem mudar o timbre.
// Doadoras escolhidas por medição: maior variação de tom sem deslocar o tom médio.
const ENERGIA = {
  masculino: {
    baixa: { doador: "am_michael", peso: 0.3, ganho: -2 },
    media: { doador: "em_santa", peso: 0.25, ganho: 0 },
    alta: { doador: "am_puck", peso: 0.4, ganho: 2 },
  },
  feminino: {
    baixa: { doador: "af_heart", peso: 0.3, ganho: -2 },
    media: { doador: "ef_dora", peso: 0.25, ganho: 0 },
    alta: { doador: "if_sara", peso: 0.4, ganho: 2 },
  },
};
const ENTONACAO = {
  conversa: { vel: 1.0, pausa: 1.0 },
  narrador: { vel: 0.95, pausa: 1.3 },
  professor: { vel: 0.98, pausa: 1.15 },
  locutor: { vel: 1.04, pausa: 0.9, peso: 0.1 },
  acolhedor: { vel: 0.9, pausa: 1.45, ganho: -2, peso: -0.1 },
  dramatico: { vel: 0.92, pausa: 1.6, peso: 0.15 },
  jornalistico: { vel: 1.0, pausa: 1.0, peso: -0.1 },
  infantil: { vel: 0.97, pausa: 1.2, peso: 0.15, k: -0.15 },
};
// Estilo de cada trecho marcado no texto
const ESTILO = {
  animado: { vel: 1.06, ganho: 2.5, peso: 0.15, pont: "!" },
  calmo: { vel: 0.9, ganho: -2, pausa: 1.3, peso: -0.15 },
  serio: { vel: 0.95, ganho: 0.5, pont: ".", k: 0.1 },
  triste: { vel: 0.86, ganho: -4, pausa: 1.4, k: 0.2, peso: -0.2 },
  sussurrando: { vel: 0.92, ganho: -9, pausa: 1.2, suave: true },
  gritando: { vel: 1.05, ganho: 5, pont: "!", peso: 0.2 },
  curioso: { vel: 0.97, pont: "?" },
  misterioso: { vel: 0.86, ganho: -3, pausa: 1.5, k: 0.2 },
  sarcastico: { vel: 0.94, peso: 0.1 },
  contagem: { contagem: true, ganho: 2 },
};
const PAUSA_MS = { ".": 380, "!": 340, "?": 420, "…": 650, ",": 0, "\n": 600 };
const NUMEROS = /\b(um|dois|tr[eê]s|quatro|cinco|seis|sete|oito|[1-8])\b/giu;

// ---------------------------------------------------------------- modelo
let sessao, ephone;
const vozes = {};
export async function carregar(modelo = "kokoro-q8.onnx") {
  ort.env.wasm.numThreads = 4;
  sessao = await ort.InferenceSession.create(fs.readFileSync(new URL(modelo, import.meta.url)), { executionProviders: ["wasm"] });
  ephone = await createEphone(roa);
  ephone.setVoice("pt-BR");
}
function voz(nome) {
  vozes[nome] ??= new Float32Array(fs.readFileSync(new URL(`node_modules/kokoro-js/voices/${nome}.bin`, import.meta.url)).buffer.slice(0));
  return vozes[nome];
}

export function fonemas(texto) {
  // O ephone troca ";" e ":" por "," e "."; fonemizamos por partes e devolvemos a pontuação original
  const partes = texto.split(/([;:])/);
  let f = "";
  for (let i = 0; i < partes.length; i += 2) {
    let p = ephone.textToIpa(partes[i]).trim();
    if (partes[i + 1]) p = p.replace(/[,.]$/, "") + partes[i + 1];
    f += (f ? " " : "") + p;
  }
  for (const [a, b] of E2M) f = f.replaceAll(a, b);
  return f.replaceAll("-", "").trim();
}

/** Monta o vetor de estilo: timbre da voz base + prosódia misturada com o doador + ajuste de tom (k). */
function estilo(base, n, doador, peso, k) {
  const s = voz(base).slice(n * 256, n * 256 + 256);
  if (doador && peso > 0) {
    const d = voz(doador).subarray(n * 256, n * 256 + 256);
    for (let i = 128; i < 256; i++) s[i] = (1 - peso) * s[i] + peso * d[i];
  }
  if (k !== 1) {
    // referência: média das três vozes em português (prosódia "neutra")
    const refs = ["pf_dora", "pm_alex", "pm_santa"].map((v) => voz(v).subarray(n * 256, n * 256 + 256));
    for (let i = 128; i < 256; i++) {
      const m = (refs[0][i] + refs[1][i] + refs[2][i]) / 3;
      s[i] = m + k * (s[i] - m);
    }
  }
  return s;
}

async function kokoro(fon, { base, doador, peso, k, vel }) {
  const ids = [...fon].map((c) => VOCAB[c]).filter((x) => x !== undefined).slice(0, 510);
  const n = Math.min(ids.length, 509);
  const out = await sessao.run({
    input_ids: new ort.Tensor("int64", BigInt64Array.from([0, ...ids, 0].map(BigInt)), [1, ids.length + 2]),
    style: new ort.Tensor("float32", estilo(base, n, doador, peso, k), [1, 256]),
    speed: new ort.Tensor("float32", Float32Array.from([vel]), [1]),
  });
  return Float32Array.from(Object.values(out)[0].data);
}

// ---------------------------------------------------------------- áudio
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(x.length, 1));
const db = (g) => Math.pow(10, g / 20);
const silencio = (ms) => new Float32Array(Math.round((SR * ms) / 1000));

/** Corta o silêncio das pontas, mantendo 25 ms, e aplica fades curtos contra estalos. */
function aparar(x) {
  const lim = 0.012, janela = 240;
  let i = 0, j = x.length;
  while (i < j - janela && rms(x.subarray(i, i + janela)) < lim) i += janela;
  while (j > i + janela && rms(x.subarray(j - janela, j)) < lim) j -= janela;
  const y = x.slice(Math.max(0, i - 600), Math.min(x.length, j + 600));
  const f = Math.min(200, y.length / 4);
  for (let t = 0; t < f; t++) { y[t] *= t / f; y[y.length - 1 - t] *= t / f; }
  return y;
}

/** Volume: normaliza a fala para -20 dBFS RMS (só partes com voz) e aplica o ganho do estilo. */
function volume(x, ganhoDb, suave) {
  const blocos = [];
  for (let i = 0; i + 480 <= x.length; i += 480) { const r = rms(x.subarray(i, i + 480)); if (r > 0.02) blocos.push(r); }
  const atual = blocos.length ? Math.sqrt(blocos.reduce((s, r) => s + r * r, 0) / blocos.length) : rms(x);
  const g = (db(-20) / Math.max(atual, 1e-4)) * db(ganhoDb);
  const y = x.map((v) => v * g);
  if (suave) { // "sussurro": tira graves e corpo (passa-altas simples) para soar mais soprado
    let ant = 0, antY = 0;
    for (let i = 0; i < y.length; i++) { const v = y[i]; antY = 0.94 * (antY + v - ant); ant = v; y[i] = antY * 1.4; }
  }
  return y;
}

/** Limitador suave e normalização final de pico em -1 dBFS. */
function finalizar(x) {
  const y = x.map((v) => Math.tanh(v * 1.4) / Math.tanh(1.4));
  const pico = y.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const g = db(-1) / Math.max(pico, 1e-4);
  return y.map((v) => v * g);
}

// ---------------------------------------------------------------- texto → fala
function frases(texto) {
  return [...texto.matchAll(/[^.!?…\n]+[.!?…]*|\n+/g)].map((m) => m[0]).filter((f) => f.trim() || f.includes("\n"));
}

export async function falar(textoMarcado, persona) {
  const ent = ENTONACAO[persona.entonacao] ?? ENTONACAO.conversa;
  const tabela = ENERGIA[persona.sexo === "feminino" ? "feminino" : "masculino"];
  const en = tabela[persona.energia] ?? tabela.media;
  const base = persona.voz ?? (persona.sexo === "feminino" ? "pf_dora" : "pm_alex");
  const velBase = RITMO[persona.ritmo] * ent.vel;
  const kBase = IDADE_K[persona.idade] ?? 1;
  const bpm = persona.bpm ?? 100;
  const partes = [];
  const log = [];

  for (const seg of parseMarkup(textoMarcado)) {
    const st = (seg.style && ESTILO[seg.style]) || {};
    const p = {
      base,
      doador: en.doador,
      peso: Math.min(0.6, Math.max(0, en.peso + (ent.peso ?? 0) + (st.peso ?? 0))),
      k: kBase + (ent.k ?? 0) + (st.k ?? 0),
      vel: velBase * (st.vel ?? 1),
    };
    const ganho = en.ganho + (ent.ganho ?? 0) + (st.ganho ?? 0);
    const fatorPausa = (ent.pausa ?? 1) * (st.pausa ?? 1) / Math.sqrt(velBase);

    for (const peca of seg.pieces) {
      if (peca.kind === "event") {
        const ms = peca.key === "pausa" ? 450 : peca.key === "pausa longa" ? 1000 : 220;
        partes.push(silencio(ms * fatorPausa));
        continue;
      }
      if (st.contagem && peca.text.match(NUMEROS)?.length >= 3) {
        // Contagem no pulso: cada número começa exatamente num tempo do compasso
        const beat = (60 / bpm) * SR;
        const nums = peca.text.match(NUMEROS);
        const trilha = new Float32Array(Math.round(beat * (nums.length + 0.5)));
        for (let i = 0; i < nums.length; i++) {
          const a = volume(aparar(await kokoro(fonemas(nums[i] + "!"), { ...p, vel: Math.min(1.25, p.vel * 1.1) })), ganho + (i === nums.length - 1 ? 1.5 : 0));
          trilha.set(a.subarray(0, Math.min(a.length, trilha.length - Math.round(i * beat))), Math.round(i * beat));
        }
        partes.push(trilha);
        log.push({ trecho: nums.join(" "), estilo: "contagem", bpm });
        continue;
      }
      for (let f of frases(peca.text)) {
        if (!f.trim()) { partes.push(silencio(PAUSA_MS["\n"] * fatorPausa)); continue; }
        f = f.trim();
        if (st.pont && /[.!?]$/.test(f)) f = f.replace(/[.!?]+$/, st.pont);
        const fon = fonemas(f);
        const audio = volume(aparar(await kokoro(fon, p)), ganho, st.suave);
        partes.push(audio);
        const fim = f.slice(-1);
        partes.push(silencio((PAUSA_MS[fim] ?? 300) * fatorPausa));
        log.push({ trecho: f.slice(0, 40), estilo: seg.style ?? "base", vel: +p.vel.toFixed(2), k: +p.k.toFixed(2), expressividade: +p.peso.toFixed(2), ganho_db: ganho });
      }
    }
  }
  const total = partes.reduce((n, a) => n + a.length, 0);
  const saida = new Float32Array(total);
  let o = 0;
  for (const a of partes) { saida.set(a, o); o += a.length; }
  return { audio: finalizar(saida), log };
}

export function salvarWav(arquivo, x) {
  const pcm = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(arquivo, Buffer.concat([h, pcm]));
}
