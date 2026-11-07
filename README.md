# loco-banco

**I have X GB of VRAM. What's the best model I can run?**

loco-banco benchmarks every model that fits a given VRAM budget on real consumer hardware, at the floor of each tier. Full-precision small models, quantized larger ones, and everything between compete on equal footing: quality, speed, and efficiency.

**Live site:** [locobanco.org](https://locobanco.org) · **Picker:** [picker.locobanco.org](https://picker.locobanco.org)

## How it works

Models are organised by VRAM tier, not model family. Each tier is benchmarked on the worst-in-class GPU for that VRAM level, so if it runs here it runs on your card.

| VRAM | Benchmark GPU |
|---|---|
| 4 GB | GTX 1050 Ti |
| 6 GB | GTX 1060 6 GB |
| 8 GB | RTX 2060 Super |
| 12 GB | RTX 3060 |
| 16 GB | RTX 4060 Ti 16 GB |
| 24 GB | RTX 3090 |
| 32 GB | Tesla V100 32 GB |

Quality tasks come from `lm-evaluation-harness` (MMLU, HellaSwag, GSM8K, TruthfulQA, ARC-Challenge), plus tokens/s, time-to-first-token, peak RAM, and perplexity.

## Quick start

```bash
pip install lm-eval[hf]

lm_eval --model hf \
  --model_args pretrained=HuggingFaceTB/SmolLM2-1.7B-Instruct \
  --tasks mmlu,gsm8k,hellaswag \
  --device cuda:0 --batch_size auto \
  --output_path results/smollm2-1.7b-bf16/
```

Methodology, results, and the benchmark rig are documented at [locobanco.org](https://locobanco.org). Helper scripts live in `scripts/`.

## Licence

MIT. See [LICENSE](LICENSE).
