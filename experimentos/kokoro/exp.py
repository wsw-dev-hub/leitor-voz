# Experimentos de prosódia com o Kokoro (referência rápida em Python; o motor final será em JS).
import json, glob, os, sys
import numpy as np, onnxruntime as ort, espeakng_loader
from phonemizer.backend.espeak.wrapper import EspeakWrapper
EspeakWrapper.set_library(espeakng_loader.get_library_path())
EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
from phonemizer.backend import EspeakBackend

BK = EspeakBackend(language="pt-br", preserve_punctuation=True, with_stress=True, tie="^", language_switch="remove-flags")
E2M = [("a^ɪ","I"),("a^ʊ","W"),("d^z","ʣ"),("d^ʒ","ʤ"),("e^ɪ","A"),("o^ʊ","O"),("ə^ʊ","Q"),("s^s","S"),("t^s","ʦ"),("t^ʃ","ʧ"),("ɔ^ɪ","Y")]
VOCAB = json.load(open("vocab.json"))
SESS = ort.InferenceSession("kokoro-q8.onnx", providers=["CPUExecutionProvider"])
VOZES = {os.path.basename(f)[:-4]: np.fromfile(f, dtype=np.float32).reshape(510, 256) for f in glob.glob("node_modules/kokoro-js/voices/*.bin")}
SR = 24000

def fonemas(t):
    ps = BK.phonemize([t])[0].strip()
    for a, b in E2M: ps = ps.replace(a, b)
    return ps.replace("^", "").replace("-", "")

def sintetiza(ps, voz="pm_alex", vel=1.0, k=1.0, estilo=None):
    ids = [VOCAB[c] for c in ps if c in VOCAB]
    n = min(len(ids), 509)
    s = (estilo if estilo is not None else VOZES[voz][n]).copy()
    if k != 1.0:
        media = np.mean([v[n] for v in VOZES.values()], axis=0)
        s[128:] = media[128:] + k * (s[128:] - media[128:])   # só a metade de prosódia
    out = SESS.run(None, {"input_ids": np.array([[0, *ids, 0]], dtype=np.int64),
                          "style": s[None, :].astype(np.float32), "speed": np.array([vel], dtype=np.float32)})
    return out[0].reshape(-1)

def f0(x, sr=SR):
    """F0 por quadro (YIN simplificado). Retorna só quadros vozeados."""
    fr, hop = 1024, 240
    out = []
    for i in range(0, len(x) - fr, hop):
        q = x[i:i+fr]
        if np.sqrt((q**2).mean()) < 0.02: continue
        d = np.array([np.sum((q[:fr//2] - q[t:t+fr//2])**2) for t in range(1, 400)])
        cmnd = d * np.arange(1, 400) / np.maximum(np.cumsum(d), 1e-9)
        lo = int(sr/350)
        idx = np.where(cmnd[lo:] < 0.15)[0]
        if len(idx): out.append(sr / (lo + idx[0] + 1))
    return np.array(out)

def metricas(x, ps):
    f = f0(x)
    st = 12*np.log2(f/np.median(f)) if len(f) else np.array([0])
    rms = np.sqrt(np.convolve(x**2, np.ones(480)/480, "same"))
    fala = (rms > 0.01).mean() * len(x) / SR
    vogais = sum(c in "aeiouɐɛɔəɪʊæyAIOWYɨ" for c in ps)
    return dict(dur=round(len(x)/SR, 2), f0_med=round(float(np.median(f)), 1) if len(f) else 0,
                faixa_st=round(float(np.percentile(st, 90) - np.percentile(st, 10)), 2),
                desvio_st=round(float(st.std()), 2), silabas_s=round(vogais / max(fala, .1), 2))

if __name__ == "__main__":
    T = "Boa noite, turma! Que alegria ver vocês aqui de novo. Hoje vamos revisar a sequência do segundo bloco."
    ps = fonemas(T)
    print("k (expressividade) -> métricas, voz pm_alex")
    for k in [1.0, 1.25, 1.5, 1.8, 2.2]:
        print(k, metricas(sintetiza(ps, k=k), ps))
    print("pf_dora")
    for k in [1.0, 1.5]:
        print(k, metricas(sintetiza(ps, "pf_dora", k=k), ps))
