// Utilidades de áudio: todos os motores devolvem PCM 16-bit mono 24 kHz,
// que juntamos e embrulhamos num WAV.

export const SAMPLE_RATE = 24000;

export function silence(ms: number, sampleRate = SAMPLE_RATE): Uint8Array {
  const samples = Math.round((sampleRate * ms) / 1000);
  return new Uint8Array(samples * 2);
}

/** Se vier um WAV completo, devolve só os dados PCM do bloco "data". */
export function stripWavHeader(bytes: Uint8Array): Uint8Array {
  const isRiff = bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF";
  if (!isRiff) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(pos, pos + 4));
    const size = view.getUint32(pos + 4, true);
    if (id === "data") return bytes.subarray(pos + 8, Math.min(bytes.length, pos + 8 + size));
    pos += 8 + size + (size % 2);
  }
  return bytes.subarray(44);
}

export function pcmToWav(chunks: Uint8Array[], sampleRate = SAMPLE_RATE): Uint8Array {
  const dataLen = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(44 + dataLen);
  const v = new DataView(out.buffer);
  const ascii = (off: number, s: string) => [...s].forEach((ch, i) => v.setUint8(off + i, ch.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, 36 + dataLen, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true); // tamanho do bloco fmt
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits por amostra
  ascii(36, "data");
  v.setUint32(40, dataLen, true);
  let off = 44;
  for (const c of chunks) {
    // PCM 16-bit precisa de número par de bytes
    out.set(c.length % 2 ? c.subarray(0, c.length - 1) : c, off);
    off += c.length - (c.length % 2);
  }
  return off === out.length ? out : fixLength(out, off);
}

function fixLength(buf: Uint8Array, end: number): Uint8Array {
  const out = buf.subarray(0, end);
  const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
  v.setUint32(4, end - 8, true);
  v.setUint32(40, end - 44, true);
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Executa tarefas em paralelo com limite, preservando a ordem do resultado. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
