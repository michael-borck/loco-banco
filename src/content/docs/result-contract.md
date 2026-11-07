---
title: "Result contract"
description: "The shared shape for LocoLabo benchmark results, and how to validate it."
---

LocoBanco, LocoFósil, LocoMusa, and the GPU Picker all read the same result shape. One contract means a result can move between projects without a translation layer, and the picker can plot anything that conforms.

## The file

The canonical dataset is [`src/data/picker-data.json`](https://github.com/michael-borck/loco-banco/blob/main/src/data/picker-data.json). The schema is [`src/data/results.schema.json`](https://github.com/michael-borck/loco-banco/blob/main/src/data/results.schema.json). The picker at [locobanco.org/picker](/picker/) is built from the same file.

## Confidence

Every result carries a `confidence` field. This is the most important part of the contract.

| Value | Meaning | Requirement |
|---|---|---|
| `measured` | The harness ran on this exact card | A `source_run_id` pointing at the raw run |
| `community` | An external contributor supplied it | A source in `notes` |
| `estimated` | Inferred from specs, no run | Nothing; rendered as an open dot |

A result without a trace is not a measurement. The current picker dataset is placeholder data, so every value is marked `estimated` until real runs replace it.

## Shape

```json
{
  "schema_version": "0.1",
  "generated_at": "2026-04-18",
  "benchmarks": [
    { "id": "llama_3_1_8b_q4_km_tps", "display_name": "…", "higher_is_better": true }
  ],
  "gpus": [
    {
      "id": "gtx_950_2gb",
      "display_name": "GTX 950",
      "vram_gb": 2,
      "cc": 5.2,
      "results": {
        "llama_3_1_8b_q4_km_tps": {
          "value": 12.4,
          "confidence": "estimated",
          "notes": "Inferred from bandwidth"
        }
      }
    }
  ]
}
```

## Validate

```bash
npm run validate:results
```

The validator checks required fields, unique benchmark ids, that every result points at a declared benchmark, and that confidence is one of the three allowed values. It warns when a result claims `measured` without a `source_run_id`, and when a dataset described as placeholder contains measured values.

The validator is dependency-free so it can run in CI before the site builds.
