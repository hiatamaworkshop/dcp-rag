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

## Target Frameworks

| Framework | Integration Point | Method |
|-----------|------------------|--------|
| **LlamaIndex** | `node_postprocessors` | `DcpMetadataEncoder()` in postprocessor list |
| **LangChain** | LCEL pipe | `retriever \| DcpMetadataEncoder() \| prompt \| llm` |
| **Haystack** | Pipeline graph | `@component` between retriever and prompt_builder |
| **Azure AI Search** | Custom Skill | HTTP endpoint as Skillset |
| **AWS Bedrock** | Decomposed mode | `Retrieve` API → encoder → own LLM call |

## Design Principles

1. **Never touch chunk text** — only metadata and inter-stage signals
2. **Schema-typed positional arrays** — no parsing ambiguity, no field name overhead
3. **1-line integration** — single postprocessor/component addition
4. **Backward compatible** — falls back to natural language if consumer doesn't support DCP
5. **Framework agnostic core** — adapters per framework, shared encoder logic

## Architecture

```
dcp-rag/
  core/           ← Framework-agnostic encoder/decoder + schema registry
  adapters/
    llamaindex/   ← LlamaIndex node_postprocessor
    langchain/    ← LangChain Runnable
    haystack/     ← Haystack @component
    azure/        ← Azure AI Search Custom Skill (HTTP)
  schemas/        ← DCP schema definitions for RAG metadata
  docs/           ← Design documents
```

## Schemas

RAG-specific DCP schemas (planned):

| Schema | Purpose | Fields |
|--------|---------|--------|
| `rag-chunk-meta:v1` | Chunk metadata | source, page, section, score, chunk_index |
| `rag-query-hint:v1` | Inter-stage query signal | intent, domain, detail, urgency |
| `rag-result-summary:v1` | Stage result summary | found, count, domain, avg_score |
| `rag-rerank-signal:v1` | Reranking output | chunk_id, original_rank, new_rank, boost_reason |

## Status

Project initialized. Design phase.

## Related

- [DATA_COST_PROTOCOL.md](docs/DATA_COST_PROTOCOL.md) — Full DCP specification (from engram)
- [engram](https://github.com/hiatamaworkshop/engram) — Origin project where DCP was developed

## License

Apache License 2.0

---

Designed by Hiatama Workshop