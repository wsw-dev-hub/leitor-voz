import wave, sys, numpy as np
from exp import f0
SR = 24000

def ler(f):
    w = wave.open(f); return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768

def trechos(x, lim=0.015, min_sil=0.12):
    """Divide em blocos de fala separados por silêncios de pelo menos min_sil s."""
    r = np.sqrt(np.convolve(x**2, np.ones(240)/240, "same")) > lim
    blocos, ini, sil = [], None, 0
    for i in range(0, len(r), 240):
        if r[i]:
            if ini is None: ini = i
            sil = 0
        elif ini is not None:
            sil += 240
            if sil >= min_sil * SR: blocos.append((ini, i - sil)); ini, sil = None, 0
    if ini is not None: blocos.append((ini, len(x)))
    return blocos

def relatorio(nome):
    x = ler(nome)
    f = f0(x); st = 12 * np.log2(f / np.median(f))
    b = trechos(x)
    fala = sum(e - s for s, e in b) / SR
    pausas = [(b[i+1][0] - b[i][1]) / SR for i in range(len(b) - 1)]
    niveis = [20*np.log10(np.sqrt((x[s:e]**2).mean()) + 1e-9) for s, e in b]
    return dict(duracao=round(len(x)/SR, 1), fala_s=round(fala, 1),
                pausas=len(pausas), pausa_media_ms=int(1000*np.mean(pausas)) if pausas else 0,
                tom_med_hz=round(float(np.median(f))), variacao_tom_st=round(float(np.percentile(st, 90) - np.percentile(st, 10)), 1),
                volume_min_max_db=(round(min(niveis), 1), round(max(niveis), 1)), cortes=int((np.abs(x) > 0.995).sum()))

for n in sys.argv[1:]:
    print(n, relatorio(n))
