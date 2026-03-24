# DCP-RAG

Data Cost Protocol middleware for RAG pipelines. Drop-in encoder layer that converts retrieval metadata to native format, cutting token cost and context pollution between pipeline stages.

## Problem

```
Typical RAG pipeline:

  Query → Vector DB → chunks (NL) → LLM → response
                       ↑
                       metadata, scores, tags — all serialized as natural language
                       token cost, context pollution, parsing ambiguity

Multi-step RAG:

  Step 1 → NL → Step 2 → NL → Step 3
                 ↑ redundant      ↑ error accumulation
```

90%+ of RAG traffic is AI-to-AI. Natural language between stages adds cost for no benefit.

## Solution

```
  Query → Vector DB → chunks → [DCP encoder] → native metadata + original chunks → LLM
                                                 ↑
                                                 positional arrays, schema-typed, zero ambiguity

Multi-step:

  Step 1 → native → Step 2 → native → Step 3
            ↑ 1/5 tokens     ↑ no translation error
```

Chunk text is untouched. Only metadata, scores, routing signals, and inter-stage communication are encoded.

## Quick Start

```python
# Preset — 1 line for supported Vector DBs
encoder = DcpEncoder.from_preset("pinecone")

# Preset + overrides — custom metadata field names
encoder = DcpEncoder.from_preset("qdrant", overrides={
    "section": "payload.heading_text",
})

# Full custom mapping — any DB, any metadata structure
encoder = DcpEncoder(schema="rag-chunk-meta:v1", mapping={
    "source": "metadata.file_path",
    "page":   "metadata.page_num",
    "section": "metadata.heading",
    "score":  "score",
    "chunk_index": "metadata.idx",
})
```

### Framework Integration

```python
# LlamaIndex — node_postprocessor
query_engine = index.as_query_engine(
    node_postprocessors=[DcpNodePostprocessor.from_preset("pinecone")]
)

# LangChain — LCEL pipe
chain = retriever | DcpRunnable.from_preset("qdrant") | prompt | llm

# Haystack — pipeline component
pipeline.add_component("dcp", DcpComponent.from_preset("weaviate"))
pipeline.connect("retriever", "dcp")
pipeline.connect("dcp", "prompt_builder")
```

## Design Principles

1. **Never touch chunk text** — only metadata and inter-stage signals
2. **Schema-typed positional arrays** — no parsing ambiguity, no field name overhead
3. **1-line integration** — DB presets for zero-config; custom mapping for full control
4. **Backward compatible** — original metadata stays intact, DCP fields are additive (`_dcp`, `_dcp_schema`)
5. **LLM boundary only** — reranker/filter/compressor don't use LLM tokens, so DCP sits right before the LLM
6. **Framework agnostic core** — adapters per framework, shared encoder logic

## Architecture

```
Layer 0: DcpSchema       ← Schema definition (fields, types, validation)
Layer 1: FieldMapping     ← metadata key → DCP positional index
Layer 2: Preset           ← Per-DB defaults (Pinecone, Qdrant, Weaviate, Chroma, Milvus)
Layer 3: Adapter          ← Per-framework (LlamaIndex, LangChain, Haystack, Azure)
```

```
dcp-rag/
  core/
    schema.py        ← Schema loader + validator (Layer 0)
    mapping.py       ← FieldMapping definition + resolver (Layer 1)
    encoder.py       ← DcpEncoder: schema + mapping → native array
    presets/         ← DB presets: pinecone, qdrant, weaviate, chroma, milvus (Layer 2)
  adapters/
    llamaindex/      ← DcpNodePostprocessor (Layer 3)
    langchain/       ← DcpRunnable (Layer 3)
    haystack/        ← DcpComponent (Layer 3)
    azure/           ← Azure AI Search Custom Skill — HTTP endpoint (Layer 3)
  schemas/           ← DCP schema definitions for RAG metadata
  docs/              ← Design documents
```

### Where DCP sits in the pipeline

```
search → reranker → filter → compressor → [★ DCP encoder ★] → LLM
                                            ↑
                              only point where tokens cost money
```

Upstream stages (reranker, filter, compressor) are rule-based or small models — no token cost.
Original metadata is preserved for them. DCP is additive:

```python
node.metadata = {
    "source": "docs/auth.md",          # ← untouched for upstream stages
    "page": 12,
    "_dcp": ["docs/auth.md", 12, "JWT Config", 0.92, 3],
    "_dcp_schema": "rag-chunk-meta:v1"  # ← DCP-aware prompt builder uses this
}
```

## Vector DB Presets

| DB | Response structure | Preset handles |
|----|-------------------|----------------|
| **Pinecone** | `{ id, score, metadata: { ... } }` | score mapping, metadata.* passthrough |
| **Qdrant** | `{ id, score, payload: { ... } }` | score mapping, payload.* passthrough |
| **Weaviate** | `{ _additional: { score }, properties: { ... } }` | _additional.score, properties.* |
| **Chroma** | `{ ids, distances, metadatas, documents }` | distance→score conversion, metadatas.* |
| **Milvus** | `{ id, distance, entity: { ... } }` | distance→score conversion, entity.* |

## Schemas

RAG-specific DCP schemas (planned):

| Schema | Purpose | Fields |
|--------|---------|--------|
| `rag-chunk-meta:v1` | Chunk metadata | source, page, section, score, chunk_index |
| `rag-query-hint:v1` | Inter-stage query signal | intent, domain, detail, urgency |
| `rag-result-summary:v1` | Stage result summary | found, count, domain, avg_score |
| `rag-rerank-signal:v1` | Reranking output | chunk_id, original_rank, new_rank, boost_reason |

## Status

v0.1.0 — Core encoder, 5 DB presets, 4 framework adapters. Unit-tested (72 tests) and integration-tested against live Qdrant with 69% token reduction on real data.

## Related

- [DATA_COST_PROTOCOL.md](docs/DATA_COST_PROTOCOL.md) — Full DCP specification (from engram)
- [engram](https://github.com/hiatamaworkshop/engram) — Origin project where DCP was developed

## License

Apache License 2.0

---

Designed by Hiatama Workshop