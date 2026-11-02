// Download de modelos com progresso e cache persistente no navegador (Cache Storage).

const CACHE = "lab-voz-modelos-v1";

export type Progresso = (recebidoMb: number, totalMb: number) => void;

async function abrirCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE);
  } catch {
    return null; // navegador sem Cache Storage (ou modo privado): baixa sempre
  }
}

export async function baixar(url: string, aoProgredir?: Progresso, tamanhoEstimadoMb = 0): Promise<ArrayBuffer> {
  const cache = await abrirCache();
  const guardado = await cache?.match(url);
  if (guardado) {
    const buf = await guardado.arrayBuffer();
    aoProgredir?.(buf.byteLength / 1e6, buf.byteLength / 1e6);
    return buf;
  }

  let res: Response;
  try {
    res = await fetch(url, { mode: "cors" });
  } catch {
    throw new Error(`Não foi possível baixar ${nomeArquivo(url)}. Verifique a conexão com a internet.`);
  }
  if (!res.ok) throw new Error(`O servidor respondeu ${res.status} ao baixar ${nomeArquivo(url)}.`);

  const total = Number(res.headers.get("content-length")) / 1e6 || tamanhoEstimadoMb;
  let buf: ArrayBuffer;
  if (res.body && aoProgredir) {
    const leitor = res.body.getReader();
    const partes: Uint8Array[] = [];
    let recebido = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value);
      recebido += value.length;
      aoProgredir(recebido / 1e6, Math.max(total, recebido / 1e6));
    }
    const junto = new Uint8Array(recebido);
    let o = 0;
    for (const p of partes) {
      junto.set(p, o);
      o += p.length;
    }
    buf = junto.buffer;
  } else {
    buf = await res.arrayBuffer();
  }

  try {
    await cache?.put(url, new Response(buf.slice(0), { headers: { "Content-Type": "application/octet-stream" } }));
  } catch {
    /* sem espaço: segue sem guardar */
  }
  return buf;
}

/** Baixa várias partes e junta num só buffer, com progresso somado. */
export async function baixarPartes(urls: string[], aoProgredir?: Progresso, totalMb = 0): Promise<ArrayBuffer> {
  const feitos = new Array(urls.length).fill(0);
  const bufs = await Promise.all(
    urls.map((u, i) =>
      baixar(u, (r) => {
        feitos[i] = r;
        aoProgredir?.(feitos.reduce((a, b) => a + b, 0), totalMb);
      }),
    ),
  );
  const total = bufs.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of bufs) {
    out.set(new Uint8Array(b), o);
    o += b.byteLength;
  }
  return out.buffer;
}

export async function limparCache(): Promise<void> {
  try {
    await caches.delete(CACHE);
  } catch {
    /* nada a limpar */
  }
}

const nomeArquivo = (url: string) => decodeURIComponent(url.split("/").pop() ?? url);
