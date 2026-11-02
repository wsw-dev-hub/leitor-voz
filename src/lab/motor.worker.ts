// Web Worker: baixa e roda os modelos fora da tela principal, para a interface não travar.
/// <reference lib="webworker" />
import type { Ajustes } from "./ajustes";
import { medir } from "./audio";
import { vozPorId } from "./catalogo";
import { iniciarFonemas } from "./fonemas";
import { carregarKokoro, carregarPiper, configurarOrt, type Motor } from "./motores";
import { falar } from "./prosodia";

export type Pedido =
  | { tipo: "info" }
  | { tipo: "gerar"; id: string; texto: string; ajustes: Ajustes };

export type Resposta =
  | { tipo: "info"; threads: number; isolado: boolean }
  | { tipo: "etapa"; id: string; texto: string; fracao?: number }
  | { tipo: "pronto"; id: string; audio: Float32Array; sampleRate: number; trechos: unknown[]; metricas: ReturnType<typeof medir>; tempoMs: number; carregarMs: number }
  | { tipo: "erro"; id: string; mensagem: string };

const enviar = (r: Resposta, transferir: Transferable[] = []) => (self as unknown as Worker).postMessage(r, transferir);

let fila: Promise<void> = Promise.resolve();

self.onmessage = (ev: MessageEvent<Pedido>) => {
  const p = ev.data;
  if (p.tipo === "info") {
    enviar({ tipo: "info", ...configurarOrt() });
    return;
  }
  fila = fila.then(() => gerar(p)).catch(() => {});
};

async function gerar({ id, texto, ajustes }: Extract<Pedido, { tipo: "gerar" }>) {
  try {
    configurarOrt();
    const voz = vozPorId(ajustes.voz);
    const t0 = performance.now();
    enviar({ tipo: "etapa", id, texto: "Preparando a pronúncia…" });
    await iniciarFonemas();
    const progresso = (r: number, t: number) =>
      enviar({ tipo: "etapa", id, texto: `Baixando a voz ${voz.nome}: ${r.toFixed(0)} de ${Math.max(t, r).toFixed(0)} MB`, fracao: t ? r / t : undefined });
    const motor: Motor = voz.motor === "kokoro" ? await carregarKokoro(voz, progresso) : await carregarPiper(voz, progresso);
    const t1 = performance.now();
    enviar({ tipo: "etapa", id, texto: "Gerando a fala…", fracao: 0 });
    const r = await falar(texto, ajustes, motor, voz.motor === "piper", (i, n) =>
      enviar({ tipo: "etapa", id, texto: `Gerando a fala: frase ${i} de ${n}`, fracao: i / n }),
    );
    const metricas = medir(r.audio, r.sampleRate);
    enviar(
      { tipo: "pronto", id, audio: r.audio, sampleRate: r.sampleRate, trechos: r.trechos, metricas, tempoMs: performance.now() - t1, carregarMs: t1 - t0 },
      [r.audio.buffer],
    );
  } catch (e) {
    enviar({ tipo: "erro", id, mensagem: e instanceof Error ? e.message : String(e) });
  }
}
