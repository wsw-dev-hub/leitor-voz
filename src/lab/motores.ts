// Motores de voz que rodam no navegador: Kokoro e Piper (ambos ONNX, via onnxruntime-web).
import * as ort from "onnxruntime-web/wasm";
import { KOKORO_MODELO, KOKORO_MODELO_MB, kokoroVozUrl, type VozCatalogo } from "./catalogo";
import { baixar, baixarPartes, type Progresso } from "./download";
import { fonemasKokoro, idsKokoro, idsPiper, ipa } from "./fonemas";
import VOCAB from "./kokoro-vocab.json";

let ortPronto = false;
export function configurarOrt(): { threads: number; isolado: boolean } {
  const isolado = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  if (!ortPronto) {
    const nucleos = navigator.hardwareConcurrency || 2;
    // deixa um núcleo livre para a interface quando há mais de dois
    ort.env.wasm.numThreads = isolado ? Math.min(4, nucleos > 2 ? nucleos - 1 : nucleos) : 1;
    ortPronto = true;
  }
  return { threads: ort.env.wasm.numThreads as number, isolado };
}

/** Parâmetros que o motor de prosódia passa para cada frase. */
export interface ParamsFrase {
  vel: number; // 1 = velocidade original
  // Kokoro
  tom?: number; // 1 = original; <1 mais leve/agudo, >1 mais grave
  doador?: string;
  peso?: number; // 0–0.7: quanto da entonação vem do doador
  // Piper
  ruido?: number; // noise_scale: variação de entonação
  ruidoW?: number; // noise_w: variação de ritmo
}

export interface Motor {
  sampleRate: number;
  gerar(texto: string, p: ParamsFrase): Promise<{ audio: Float32Array; fonemas: string }>;
}

// ------------------------------------------------------------------ Kokoro
let kokoroSessao: ort.InferenceSession | null = null;
const vozesKokoro = new Map<string, Float32Array>();
const REFERENCIA_PT = ["pf_dora", "pm_alex", "pm_santa"];

async function vozKokoro(nome: string): Promise<Float32Array> {
  let v = vozesKokoro.get(nome);
  if (!v) {
    v = new Float32Array(await baixar(kokoroVozUrl(nome)));
    vozesKokoro.set(nome, v);
  }
  return v;
}

export async function carregarKokoro(voz: VozCatalogo, progresso: Progresso): Promise<Motor> {
  if (!kokoroSessao) {
    const modelo = await baixarPartes(KOKORO_MODELO, progresso, KOKORO_MODELO_MB);
    kokoroSessao = await ort.InferenceSession.create(new Uint8Array(modelo), { executionProviders: ["wasm"] });
  }
  await Promise.all([voz.arquivo, ...REFERENCIA_PT].map(vozKokoro));
  const sessao = kokoroSessao;
  return {
    sampleRate: 24000,
    async gerar(texto, p) {
      const fonemas = fonemasKokoro(texto);
      const ids = idsKokoro(fonemas, VOCAB as Record<string, number>);
      const n = Math.min(ids.length, 509);
      const base = await vozKokoro(voz.arquivo);
      const s = base.slice(n * 256, n * 256 + 256);
      // Metade 128–255 do vetor de estilo controla entonação e duração; 0–127 é o timbre (não mexemos).
      if (p.doador && (p.peso ?? 0) > 0) {
        const d = (await vozKokoro(p.doador)).subarray(n * 256, n * 256 + 256);
        for (let i = 128; i < 256; i++) s[i] = (1 - p.peso!) * s[i] + p.peso! * d[i];
      }
      const k = p.tom ?? 1;
      if (k !== 1) {
        const refs = await Promise.all(REFERENCIA_PT.map(vozKokoro));
        for (let i = 128; i < 256; i++) {
          const m = (refs[0][n * 256 + i] + refs[1][n * 256 + i] + refs[2][n * 256 + i]) / 3;
          s[i] = m + k * (s[i] - m);
        }
      }
      const out = await sessao.run({
        input_ids: new ort.Tensor("int64", BigInt64Array.from([0, ...ids, 0].map(BigInt)), [1, ids.length + 2]),
        style: new ort.Tensor("float32", s, [1, 256]),
        speed: new ort.Tensor("float32", Float32Array.from([p.vel]), [1]),
      });
      return { audio: Float32Array.from(Object.values(out)[0].data as Float32Array), fonemas };
    },
  };
}

// ------------------------------------------------------------------ Piper
interface ConfigPiper {
  audio?: { sample_rate?: number };
  inference?: { noise_scale?: number; length_scale?: number; noise_w?: number };
  phoneme_id_map: Record<string, number[]>;
  num_speakers?: number;
}

const piperCache = new Map<string, { sessao: ort.InferenceSession; config: ConfigPiper }>();

export async function padraoPiper(voz: VozCatalogo): Promise<{ ruido: number; ruidoW: number }> {
  const c = piperCache.get(voz.id)?.config;
  return { ruido: c?.inference?.noise_scale ?? 0.667, ruidoW: c?.inference?.noise_w ?? 0.8 };
}

export async function carregarPiper(voz: VozCatalogo, progresso: Progresso): Promise<Motor> {
  let item = piperCache.get(voz.id);
  if (!item) {
    const cfgBuf = await baixar(`${voz.arquivo}.json`);
    const config = JSON.parse(new TextDecoder().decode(cfgBuf)) as ConfigPiper;
    if (!config.phoneme_id_map) throw new Error(`A configuração da voz ${voz.nome} não tem o mapa de fonemas.`);
    const modelo = await baixar(voz.arquivo, progresso, voz.tamanhoMb);
    const sessao = await ort.InferenceSession.create(new Uint8Array(modelo), { executionProviders: ["wasm"] });
    item = { sessao, config };
    piperCache.set(voz.id, item);
  }
  const { sessao, config } = item;
  const lengthBase = config.inference?.length_scale ?? 1;
  return {
    sampleRate: config.audio?.sample_rate ?? 22050,
    async gerar(texto, p) {
      const fonemas = ipa(texto);
      const { ids } = idsPiper(fonemas, config.phoneme_id_map);
      const feeds: Record<string, ort.Tensor> = {
        input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
        input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
        scales: new ort.Tensor(
          "float32",
          Float32Array.from([p.ruido ?? config.inference?.noise_scale ?? 0.667, lengthBase / p.vel, p.ruidoW ?? config.inference?.noise_w ?? 0.8]),
          [3],
        ),
      };
      if ((config.num_speakers ?? 1) > 1) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([0n]), [1]);
      const out = await sessao.run(feeds);
      const t = (out.output ?? Object.values(out)[0]) as ort.Tensor;
      return { audio: Float32Array.from(t.data as Float32Array), fonemas };
    },
  };
}
