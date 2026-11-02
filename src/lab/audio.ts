// Utilidades de áudio do laboratório: volume, aparar silêncio, WAV e medições.

export const db = (g: number) => Math.pow(10, g / 20);

export function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(x.length, 1));
}

export const silencio = (ms: number, sr: number) => new Float32Array(Math.max(0, Math.round((sr * ms) / 1000)));

/** Corta silêncio das pontas (mantendo 25 ms) e aplica fades curtos contra estalos. */
export function aparar(x: Float32Array, sr: number): Float32Array {
  const janela = Math.round(sr / 100);
  const lim = 0.012;
  let i = 0;
  let j = x.length;
  while (i < j - janela && rms(x.subarray(i, i + janela)) < lim) i += janela;
  while (j > i + janela && rms(x.subarray(j - janela, j)) < lim) j -= janela;
  const margem = Math.round(sr * 0.025);
  const y = x.slice(Math.max(0, i - margem), Math.min(x.length, j + margem));
  const f = Math.min(Math.round(sr * 0.008), Math.floor(y.length / 4));
  for (let t = 0; t < f; t++) {
    y[t] *= t / f;
    y[y.length - 1 - t] *= t / f;
  }
  return y;
}

/** Normaliza a fala para -20 dBFS (só trechos com voz) e aplica o ganho pedido. */
export function volume(x: Float32Array, sr: number, ganhoDb: number, soprado = false): Float32Array {
  const bloco = Math.round(sr / 50);
  let soma = 0;
  let n = 0;
  for (let i = 0; i + bloco <= x.length; i += bloco) {
    const r = rms(x.subarray(i, i + bloco));
    if (r > 0.02) {
      soma += r * r;
      n++;
    }
  }
  const atual = n ? Math.sqrt(soma / n) : rms(x);
  const g = (db(-20) / Math.max(atual, 1e-4)) * db(ganhoDb);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] * g;
  if (soprado) {
    // "sussurro": passa-altas simples, tira o corpo da voz
    let ant = 0;
    let antY = 0;
    for (let i = 0; i < y.length; i++) {
      const v = y[i];
      antY = 0.94 * (antY + v - ant);
      ant = v;
      y[i] = antY * 1.4;
    }
  }
  return y;
}

/** Limitador suave + normalização de pico em -1 dBFS. */
export function finalizar(x: Float32Array): Float32Array {
  const k = Math.tanh(1.4);
  let pico = 0;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    y[i] = Math.tanh(x[i] * 1.4) / k;
    pico = Math.max(pico, Math.abs(y[i]));
  }
  const g = db(-1) / Math.max(pico, 1e-4);
  for (let i = 0; i < y.length; i++) y[i] *= g;
  return y;
}

export function concatenar(partes: Float32Array[]): Float32Array {
  const out = new Float32Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function wav(x: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const txt = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF");
  v.setUint32(4, 36 + x.length * 2, true);
  txt(8, "WAVE");
  txt(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  txt(36, "data");
  v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), true);
  return new Blob([buf], { type: "audio/wav" });
}

// ------------------------------------------------------------------ medições

export interface Metricas {
  duracaoS: number;
  falaS: number;
  pausas: number;
  pausaMediaMs: number;
  tomMedioHz: number;
  variacaoTomSt: number; // faixa entre os percentis 10 e 90, em semitons
  volumeMinDb: number;
  volumeMaxDb: number;
}

/** Frequência fundamental por quadro (YIN simplificado), só em quadros com voz. */
export function f0(x: Float32Array, sr: number): number[] {
  // reduz para ~12 kHz para medir mais rápido
  const passo = Math.max(1, Math.round(sr / 12000));
  const s = sr / passo;
  const y = new Float32Array(Math.floor(x.length / passo));
  for (let i = 0; i < y.length; i++) y[i] = x[i * passo];
  const quadro = Math.round(s * 0.04);
  const hop = Math.round(s * 0.01);
  const minLag = Math.floor(s / 350);
  const maxLag = Math.floor(s / 60);
  const meio = Math.floor(quadro / 2);
  const out: number[] = [];
  const d = new Float32Array(maxLag + 1);
  for (let i = 0; i + quadro + maxLag < y.length; i += hop) {
    let e = 0;
    for (let t = 0; t < quadro; t++) e += y[i + t] * y[i + t];
    if (Math.sqrt(e / quadro) < 0.02) continue;
    let acum = 0;
    let achou = -1;
    for (let lag = 1; lag <= maxLag; lag++) {
      let soma = 0;
      for (let t = 0; t < meio; t++) {
        const dif = y[i + t] - y[i + t + lag];
        soma += dif * dif;
      }
      d[lag] = soma;
      acum += soma;
      const cmnd = (soma * lag) / Math.max(acum, 1e-9);
      if (lag >= minLag && cmnd < 0.15) {
        achou = lag;
        break;
      }
    }
    if (achou > 0) out.push(s / achou);
  }
  return out;
}

const percentil = (v: number[], p: number) => {
  if (!v.length) return 0;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor((p / 100) * o.length))];
};

export function medir(x: Float32Array, sr: number): Metricas {
  // Trechos de fala separados por silêncios de pelo menos 120 ms
  const passo = Math.round(sr / 100);
  const blocos: [number, number][] = [];
  let ini = -1;
  let sil = 0;
  for (let i = 0; i + passo <= x.length; i += passo) {
    const voz = rms(x.subarray(i, i + passo)) > 0.015;
    if (voz) {
      if (ini < 0) ini = i;
      sil = 0;
    } else if (ini >= 0) {
      sil += passo;
      if (sil >= sr * 0.12) {
        blocos.push([ini, i - sil]);
        ini = -1;
        sil = 0;
      }
    }
  }
  if (ini >= 0) blocos.push([ini, x.length]);
  const pausas = blocos.slice(1).map(([s], k) => (s - blocos[k][1]) / sr);
  const niveis = blocos.map(([s, e]) => 20 * Math.log10(rms(x.subarray(s, e)) + 1e-9));
  const f = f0(x, sr);
  const med = percentil(f, 50) || 1;
  const st = f.map((v) => 12 * Math.log2(v / med));
  return {
    duracaoS: x.length / sr,
    falaS: blocos.reduce((n, [s, e]) => n + (e - s), 0) / sr,
    pausas: pausas.length,
    pausaMediaMs: pausas.length ? (1000 * pausas.reduce((a, b) => a + b, 0)) / pausas.length : 0,
    tomMedioHz: f.length ? med : 0,
    variacaoTomSt: f.length ? percentil(st, 90) - percentil(st, 10) : 0,
    volumeMinDb: niveis.length ? Math.min(...niveis) : -99,
    volumeMaxDb: niveis.length ? Math.max(...niveis) : -99,
  };
}
