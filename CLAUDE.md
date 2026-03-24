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

### Core architecture: 4-layer design

```
Layer 0: DcpSchema      — schema definition (fields, types, validation)
Layer 1: FieldMapping    — metadata key → DCP positional index mapping
Layer 2: Preset          — per-DB default FieldMapping (Pinecone, Qdrant, Weaviate, Chroma, Milvus)
Layer 3: Adapter         — per-framework connector (LlamaIndex, LangChain, Haystack, Azure)
```

Layer 1 (FieldMapping) is the core innovation. Each Vector DB has different response structures:
```
Pinecone:  { id, score, values, metadata: { ... } }
Weaviate:  { _additional: { score, distance }, properties: { ... } }
Qdrant:    { id, score, payload: { ... } }
Chroma:    { ids, distances, metadatas, documents }
Milvus:    { id, distance, entity: { ... } }
```

And metadata inside is user-defined — no universal schema exists.

### Mapping strategy: developer-defined + DB presets

```python
# (1) Preset — 1 line for supported DBs
encoder = DcpEncoder.from_preset("pinecone")

# (2) Preset + overrides — for custom metadata field names
encoder = DcpEncoder.from_preset("qdrant", overrides={
    "section": "payload.heading_text",
})

# (3) Full custom mapping — any DB, any metadata structure
encoder = DcpEncoder(schema="rag-chunk-meta:v1", mapping={
    "source": "metadata.file_path",
    "page": "metadata.page_num",
    "section": "metadata.heading",
    "score": "score",
    "chunk_index": "metadata.idx",
})
```

### Insertion point: LLM boundary only

reranker, filter, compressor are rule-based or small models — no token cost problem.
DCP encoder sits at the **single point where tokens cost money**: right before the LLM.

```
search → reranker → filter → compressor → [★ DCP encoder ★] → LLM
                                            only here
```

Existing metadata stays intact for upstream stages. DCP is additive, not destructive:
```python
node.metadata = {
    "source": "docs/auth.md",          # ← untouched, upstream stages use this
    "page": 12,
    "_dcp": ["docs/auth.md", 12, "JWT Config", 0.92, 3],
    "_dcp_schema": "rag-chunk-meta:v1"  # ← DCP-aware prompt builder uses this
}
```

### What needs to be built
1. **`core/schema.py`** — Schema loader + validator (Layer 0)
2. **`core/mapping.py`** — FieldMapping definition + resolver (Layer 1)
3. **`core/encoder.py`** — DcpEncoder: schema + mapping → native array (ties Layer 0-1)
4. **`core/presets/`** — DB presets: pinecone, qdrant, weaviate, chroma, milvus (Layer 2)
5. **`adapters/llamaindex/`** — `DcpNodePostprocessor` (Layer 3)
6. **`adapters/langchain/`** — `DcpRunnable` (Layer 3)
7. **`adapters/haystack/`** — `DcpComponent` (Layer 3)
8. **`adapters/azure/`** — HTTP Custom Skill endpoint (Layer 3)
9. **Benchmark** — token count: NL metadata vs DCP across real RAG results

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