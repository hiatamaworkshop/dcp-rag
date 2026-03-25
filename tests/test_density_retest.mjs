/**
 * Test 4 Retest: Schema Density Understanding — JSON array notation only
 *
 * Original Test 4 mixed custom hint notation ($S:id#hash) with JSON arrays.
 * This retest uses consistent JSON array notation across all 3 density levels
 * to isolate DCP comprehension from notation familiarity.
 *
 * Run: node tests/test_density_retest.mjs
 */

import { writeFileSync } from "fs";

const OLLAMA_URL = "http://localhost:11434";
const MODELS = ["phi3:mini", "gemma2:2b", "llama3.2:1b"];
const RUNS = 3;

async function generate(model, prompt) {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0, num_predict: 256 },
      }),
    });
    const data = await resp.json();
    return (data.response || "").trim();
  } catch (e) {
    return `[ERROR: ${e.message}]`;
  }
}

const check = (r) => r.toLowerCase().includes("add") && r.toLowerCase().includes("auth");

// All 3 densities now use JSON array notation consistently
const DENSITIES = {
  abbreviated: `Data with schema header (field names omitted for brevity):
["$S","knowledge:v1"]
["add","auth","jwt migration fix",0.8]
["flag","payment","outdated gateway config",0.3]

What action is being performed in the first row and in which domain? Answer in format: action=X, domain=Y`,

  expanded: `Data with schema header showing field names and types:
["$S","knowledge:v1",4,"action","domain","detail","confidence"]
["add","auth","jwt migration fix",0.8]
["flag","payment","outdated gateway config",0.3]

The fields are: action (add|replace|flag|remove), domain (string), detail (string), confidence (0-1).

What action is being performed in the first row and in which domain? Answer in format: action=X, domain=Y`,

  full: `Data with full schema definition:
["$S","knowledge:v1",4,"action","domain","detail","confidence"]

Field types:
- action: string, one of "add", "replace", "flag", "remove"
- domain: string, the knowledge domain
- detail: string, description of the change
- confidence: number between 0 and 1

Data rows:
["add","auth","jwt migration fix",0.8]
["flag","payment","outdated gateway config",0.3]

What action is being performed in the first row and in which domain? Answer in format: action=X, domain=Y`,
};

// Original notation for comparison
const DENSITIES_ORIGINAL = {
  abbreviated: `Data with schema reference:
$S:knowledge:v1#fcbc [expand:GET /schemas/knowledge:v1]
["add","auth","jwt migration fix",0.8]
["flag","payment","outdated gateway config",0.3]

What action is being performed in the first row and in which domain? Answer in format: action=X, domain=Y`,

  expanded: `Data with schema hint:
$S:knowledge:v1#fcbc [action(add|replace|flag|remove) domain detail confidence:0-1] [expand:GET /schemas/knowledge:v1]
["add","auth","jwt migration fix",0.8]
["flag","payment","outdated gateway config",0.3]

What action is being performed in the first row and in which domain? Answer in format: action=X, domain=Y`,

  full: `Data with full schema definition:
Schema: {"id":"knowledge:v1","fields":["action","domain","detail","confidence"],"types":{"action":{"type":"string","enum":["add","replace","flag","remove"]},"domain":{"type":"string"},"detail":{"type":"string"},"confidence":{"type":"number","min":0,"max":1}}}

["add","auth","jwt migration fix",0.8]
["flag","payment","outdated gateway config",0.3]

What action is being performed in the first row and in which domain? Answer in format: action=X, domain=Y`,
};

async function runDensityTest(model, densities, label) {
  const results = [];
  for (const [density, prompt] of Object.entries(densities)) {
    let passes = 0;
    const responses = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await generate(model, prompt);
      responses.push(r);
      if (check(r)) passes++;
    }
    results.push({
      density,
      pass_rate: `${passes}/${RUNS}`,
      passed: passes > 0,
      sample: responses[0].slice(0, 150),
    });
  }
  return results;
}

async function main() {
  try {
    await fetch(`${OLLAMA_URL}/api/tags`);
  } catch {
    console.error("ERROR: ollama not available");
    process.exit(1);
  }

  const all = {};

  for (const model of MODELS) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`MODEL: ${model}`);
    console.log("=".repeat(60));

    console.log("  Warming up...");
    await generate(model, "Hello");

    console.log("  Running: original notation...");
    const original = await runDensityTest(model, DENSITIES_ORIGINAL, "original");

    console.log("  Running: JSON array notation...");
    const jsonArray = await runDensityTest(model, DENSITIES, "json_array");

    all[model] = { original, json_array: jsonArray };
  }

  // Save raw
  writeFileSync("reports/density_retest_results.json", JSON.stringify(all, null, 2), "utf-8");

  // Print comparison
  console.log("\n" + "=".repeat(80));
  console.log("DENSITY RETEST: Original vs JSON Array Notation");
  console.log("=".repeat(80));

  console.log("\n" + [
    "Model".padEnd(18),
    "Density".padEnd(14),
    "Original".padEnd(12),
    "JSON Array".padEnd(12),
    "Delta",
  ].join(""));
  console.log("-".repeat(70));

  for (const model of MODELS) {
    for (const density of ["abbreviated", "expanded", "full"]) {
      const orig = all[model].original.find((r) => r.density === density);
      const json = all[model].json_array.find((r) => r.density === density);
      const oRate = orig.pass_rate;
      const jRate = json.pass_rate;
      const oNum = parseInt(oRate);
      const jNum = parseInt(jRate);
      const delta = jNum > oNum ? `+${jNum - oNum}` : jNum < oNum ? `${jNum - oNum}` : "=";
      console.log([
        model.padEnd(18),
        density.padEnd(14),
        oRate.padEnd(12),
        jRate.padEnd(12),
        delta,
      ].join(""));
    }
    console.log("");
  }

  // Print samples for failures
  console.log("\n── Failed samples (JSON array notation) ──");
  for (const model of MODELS) {
    for (const r of all[model].json_array) {
      if (!r.passed) {
        console.log(`  ${model} / ${r.density}: ${r.sample}`);
      }
    }
  }

  console.log("\nResults saved to reports/density_retest_results.json");
}

main();
