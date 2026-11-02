# Experimento: voz neural local (Kokoro) com motor de prosódia

Protótipo da voz que roda no próprio aparelho, sem API. Ainda não está ligado ao app.

- `prosodia.mjs`: texto marcado → frases → Kokoro, com velocidade por trecho, tom por idade,
  expressividade (mistura da prosódia de uma voz doadora do mesmo sexo), pausas por pontuação,
  volume por estilo e contagem alinhada ao BPM. JavaScript puro: roda no Node e no navegador.
- `render.mjs`: gera as amostras (aula, relaxamento, história).
- `exp*.py` e `medir.py`: medições de tom, variação de entonação, ritmo, pausas e volume.

## Preparar

```bash
npm i onnxruntime-web ephone kokoro-js kokoro-q8-shards --ignore-scripts
cat node_modules/kokoro-q8-shards/kokoro-q8.part*.bin > kokoro-q8.onnx
node --experimental-strip-types render.mjs
```

Licenças: modelo Kokoro Apache-2.0; `ephone` (espeak-ng) GPL-3.0.
