"""LangGraph CV generation workflow."""

from __future__ import annotations

import logging
from typing import Any

from langgraph.graph import END, StateGraph

from cv_generation.graph import nodes
from cv_generation.graph.state import GraphState
from cv_generation.models.canonical_cv import CanonicalCV
from cv_generation.models.errors import ErrorCode, ServiceError
from cv_generation.models.specification import OutputFormat
from cv_generation.providers.base import DraftingProvider

logger = logging.getLogger(__name__)


class GenerationResult:
    def __init__(
        self,
        *,
        content: bytes,
        content_type: str,
        filename: str,
        model_id: str,
        workflow_version: str,
        canonical_cv: CanonicalCV | None = None,
    ) -> None:
        self.content = content
        self.content_type = content_type
        self.filename = filename
        self.model_id = model_id
        self.workflow_version = workflow_version
        self.canonical_cv = canonical_cv


def _route_after_validate(state: GraphState) -> str:
    if state.get("needs_revision"):
        return "revise"
    return "render"


def build_graph(provider: DraftingProvider):
    graph = StateGraph(GraphState)

    graph.add_node("extract", nodes.node_extract)
    graph.add_node("normalize", nodes.node_normalize_evidence)
    graph.add_node("merge", nodes.node_merge_user_evidence)
    graph.add_node("analyze_jd", nodes.node_analyze_jd)
    graph.add_node("draft", lambda s: nodes.node_draft(s, provider))
    graph.add_node("validate", nodes.node_validate)
    graph.add_node("revise", lambda s: nodes.node_revise(s, provider))
    graph.add_node("render", nodes.node_render)
    graph.add_node("verify", nodes.node_verify)

    graph.set_entry_point("extract")
    graph.add_edge("extract", "normalize")
    graph.add_edge("normalize", "merge")
    graph.add_edge("merge", "analyze_jd")
    graph.add_edge("analyze_jd", "draft")
    graph.add_edge("draft", "validate")
    graph.add_conditional_edges(
        "validate",
        _route_after_validate,
        {"revise": "revise", "render": "render"},
    )
    graph.add_edge("revise", "validate")
    graph.add_edge("render", "verify")
    graph.add_edge("verify", END)

    return graph.compile()


def run_generation(
    *,
    provider: DraftingProvider,
    base_cv_bytes: bytes,
    filename: str | None,
    content_type: str | None,
    job_description: str,
    additional_information: str | None,
    output_format: OutputFormat,
    correlation_id: str,
    workflow_version: str,
    max_extracted_chars: int = 100_000,
    max_revisions: int = 2,
) -> GenerationResult:
    compiled = build_graph(provider)
    initial: GraphState = {
        "base_cv_bytes": base_cv_bytes,
        "filename": filename,
        "content_type": content_type,
        "job_description": job_description,
        "additional_information": additional_information,
        "output_format": output_format,
        "correlation_id": correlation_id,
        "max_extracted_chars": max_extracted_chars,
        "max_revisions": max_revisions,
        "revision_count": 0,
        "validation_issues": [],
        "needs_revision": False,
    }

    try:
        final: dict[str, Any] = compiled.invoke(initial)
    except ServiceError:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Workflow failed correlation_id=%s", correlation_id)
        raise ServiceError(
            ErrorCode.INTERNAL_ERROR,
            f"Generation workflow failed: {exc}",
        ) from exc

    content = final.get("rendered_bytes")
    if not content:
        raise ServiceError(ErrorCode.INTERNAL_ERROR, "Workflow produced no document")

    return GenerationResult(
        content=content,
        content_type=str(final.get("content_type_out") or "application/octet-stream"),
        filename=str(final.get("filename_out") or "cv.bin"),
        model_id=str(final.get("model_id") or provider.model_id),
        workflow_version=workflow_version,
        canonical_cv=final.get("canonical_cv"),
    )
