#!/usr/bin/env node
/**
 * Validate the shared benchmark result dataset without external dependencies.
 * Checks the contract that LocoBanco, LocoFósil, LocoMusa, and the GPU picker share.
 *
 * Usage: npm run validate:results
 */
import { readFileSync } from 'node:fs';

const file = new URL('../src/data/picker-data.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));

const CONFIDENCE = new Set(['measured', 'community', 'estimated']);
const errors = [];
const warnings = [];

function requireString(obj, key, where) {
  if (typeof obj[key] !== 'string' || obj[key].length === 0) {
    errors.push(`${where}: "${key}" must be a non-empty string`);
  }
}

if (typeof data.schema_version !== 'string') errors.push('schema_version must be a string');
if (typeof data.generated_at !== 'string') errors.push('generated_at must be a string');
if (!Array.isArray(data.benchmarks)) errors.push('benchmarks must be an array');
if (!Array.isArray(data.gpus)) errors.push('gpus must be an array');

const benchmarkIds = new Set();
for (const [i, b] of (data.benchmarks ?? []).entries()) {
  const where = `benchmarks[${i}]`;
  requireString(b, 'id', where);
  requireString(b, 'display_name', where);
  if (typeof b.higher_is_better !== 'boolean') errors.push(`${where}: higher_is_better must be boolean`);
  if (benchmarkIds.has(b.id)) errors.push(`${where}: duplicate benchmark id "${b.id}"`);
  benchmarkIds.add(b.id);
}

let resultCount = 0;
const confidenceCount = { measured: 0, community: 0, estimated: 0 };
for (const [i, g] of (data.gpus ?? []).entries()) {
  const where = `gpus[${i}] (${g.id ?? 'no id'})`;
  requireString(g, 'id', where);
  requireString(g, 'display_name', where);
  if (typeof g.vram_gb !== 'number') errors.push(`${where}: vram_gb must be a number`);
  if (typeof g.cc !== 'number') errors.push(`${where}: cc must be a number`);
  if (typeof g.results !== 'object' || g.results === null || Array.isArray(g.results)) {
    errors.push(`${where}: results must be an object`);
    continue;
  }
  for (const [benchmarkId, result] of Object.entries(g.results)) {
    const rwhere = `${where}.results.${benchmarkId}`;
    resultCount += 1;
    if (!benchmarkIds.has(benchmarkId)) {
      errors.push(`${rwhere}: benchmark id is not declared in benchmarks`);
    }
    if (typeof result.value !== 'number' || Number.isNaN(result.value)) {
      errors.push(`${rwhere}: value must be a number`);
    }
    if (!CONFIDENCE.has(result.confidence)) {
      errors.push(`${rwhere}: confidence must be one of ${[...CONFIDENCE].join(', ')}`);
    } else {
      confidenceCount[result.confidence] += 1;
    }
    if (result.confidence === 'measured' && !result.source_run_id) {
      warnings.push(`${rwhere}: measured result has no source_run_id`);
    }
  }
}

const datasetSaysPlaceholder = /placeholder|hand-authored/i.test(data.notes ?? '');
if (datasetSaysPlaceholder && confidenceCount.measured > 0) {
  warnings.push(
    `${confidenceCount.measured} results are marked "measured" but the dataset notes describe placeholder data`
  );
}

console.log(`LocoLabo result contract v${data.schema_version}`);
console.log(`  ${benchmarkIds.size} benchmarks, ${data.gpus?.length ?? 0} GPUs, ${resultCount} results`);
console.log(`  confidence: ${confidenceCount.measured} measured, ${confidenceCount.community} community, ${confidenceCount.estimated} estimated`);

for (const warning of warnings) console.warn(`  WARN  ${warning}`);
for (const error of errors) console.error(`  ERROR ${error}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}

console.log(warnings.length > 0 ? `\nValid with ${warnings.length} warning(s).` : '\nValid.');
