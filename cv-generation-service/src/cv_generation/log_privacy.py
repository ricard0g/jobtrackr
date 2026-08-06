"""Redact candidate content from operational logs while keeping diagnostic reasons."""

from __future__ import annotations

from typing import Any


def issue_reason_for_log(issue: str) -> str:
    """Keep the validation reason; drop candidate-content suffixes after ': '."""
    text = (issue or "").strip()
    if not text:
        return "unknown"
    # Layout/system checks: normalize to a stable category.
    if text.lower().startswith("one-page budget"):
        return "one-page budget"
    if ": " in text:
        reason = text.split(": ", 1)[0].strip()
        return reason or "unknown"
    return text


def summarize_validation_issues_for_log(issues: list[str]) -> dict[str, Any]:
    """Aggregate issue reasons for logging without embedding resume/JD text."""
    counts: dict[str, int] = {}
    for issue in issues:
        reason = issue_reason_for_log(str(issue))
        counts[reason] = counts.get(reason, 0) + 1
    return {"issue_total": len(issues), "issue_counts": counts}


def redact_service_error_for_log(
    *,
    message: str,
    details: dict[str, Any] | None,
) -> tuple[str, dict[str, Any] | None]:
    """Return log-safe message/details; preserve error reason categories, not content."""
    if not details or not isinstance(details.get("issues"), list):
        return message, details

    summary = summarize_validation_issues_for_log(
        [str(item) for item in details["issues"]]
    )
    safe_details = {key: value for key, value in details.items() if key != "issues"}
    safe_details["issues"] = summary
    reasons = list(summary["issue_counts"].keys())
    safe_message = "; ".join(reasons[:5]) if reasons else "validation failed"
    return safe_message, safe_details
