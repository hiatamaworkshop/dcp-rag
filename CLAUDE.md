## DCP-RAG — Handoff Notes

### What this project is
Data Cost Protocol middleware for RAG pipelines. Drop-in encoder layer that sits between retrieval and LLM generation, converting metadata to native DCP format. Chunk text is never touched — only metadata and inter-stage signals.

### Origin
DCP was designed inside [engram](../engram/) (cross-session memory system). This project extracts the protocol as a standalone RAG middleware. The full DCP spec is in `docs/DATA_COST_PROTOCOL.md`.

### Design decisions made
- **Never touch chunk text** — only metadata (source, score, section) and inter-stage signals (query hints, rerank output)
- **1-line integration** per framework — LlamaIndex `node_postprocessors`, LangChain LCEL pipe, Haystack `@component`
- **Schema-typed positional arrays** — `["docs/auth.md", null, "JWT Config", 0.92, 3]` not `{ source: "docs/auth.md", page: null, ... }`
- **3-layer schema education** — (1) tool/component description embeds schema, (2) errors include schema definition, (3) GET /schemas endpoint for active lookup
- **Backward compatible** — if consumer doesn't support DCP, falls back to original natural language metadata

### Schemas defined (in schemas/)
| Schema | Fields |
|--------|--------|
| `rag-chunk-meta:v1` | source, page, section, score, chunk_index |
| `rag-query-hint:v1` | intent(find\|compare\|summarize\|verify\|expand), domain, detail, urgency |
| `rag-result-summary:v1` | found, count, domain, avg_score |
| `rag-rerank-signal:v1` | chunk_id, original_rank, new_rank, boost_reason |

### What needs to be built
1. **`core/`** — Framework-agnostic encoder/decoder + schema registry (port from engram gateway's `schema-registry.ts`)
2. **`adapters/llamaindex/`** — `DcpMetadataEncoder` as LlamaIndex `NodePostprocessor`
3. **`adapters/langchain/`** — `DcpMetadataEncoder` as LangChain `Runnable`
4. **`adapters/haystack/`** — `DcpMetadataEncoder` as Haystack `@component`
5. **`adapters/azure/`** — HTTP endpoint for Azure AI Search Custom Skill
6. **Benchmark** — token count comparison: NL metadata vs DCP metadata across real RAG results

### Tech stack decision pending
- Python (LlamaIndex, LangChain, Haystack are all Python-first)
- Core encoder could be language-agnostic (JSON schema + positional array = no language dependency)
- Azure adapter is HTTP, framework-independent

### Key reference from engram
- `engram/gateway/src/schema-registry.ts` — schema loading, validation, field type checking
- `engram/gateway/src/gate/gate.ts` — DCP validator pattern (warn → reject phases)
- `engram/gateway/schemas/` — schema JSON format (`$dcp`, `id`, `fields`, `fieldCount`, `types`, `examples`)
- `engram/docs/DATA_COST_PROTOCOL.md` — full spec including escape hatch, non-recommended patterns, multi-agent handshake

### Target users
Teams running LLM processing pipelines — especially multi-step RAG, agent chains, log analysis, ETL with LLM stages. Any system where AI-to-AI intermediate communication is currently natural language.