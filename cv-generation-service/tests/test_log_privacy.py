"""Log privacy helpers — keep diagnostic reasons, drop candidate content."""

from __future__ import annotations

from cv_generation.log_privacy import (
    issue_reason_for_log,
    redact_service_error_for_log,
    summarize_validation_issues_for_log,
)


def test_issue_reason_strips_candidate_content_suffix():
    assert (
        issue_reason_for_log("skill not in evidence: Kubernetes")
        == "skill not in evidence"
    )
    assert (
        issue_reason_for_log("metric not grounded in evidence: grew revenue 40%")
        == "metric not grounded in evidence"
    )
    assert (
        issue_reason_for_log(
            "values alignment behaviour not grounded in evidence: Mentored juniors weekly"
        )
        == "values alignment behaviour not grounded in evidence"
    )


def test_issue_reason_keeps_reason_only_messages():
    assert issue_reason_for_log("full_name is required") == "full_name is required"
    assert (
        issue_reason_for_log("values alignment requires JD value statements")
        == "values alignment requires JD value statements"
    )


def test_issue_reason_normalizes_one_page_budget():
    assert (
        issue_reason_for_log(
            "one-page budget: rendered CV page count could not be verified; densify failed"
        )
        == "one-page budget"
    )


def test_summarize_validation_issues_counts_reasons_without_content():
    summary = summarize_validation_issues_for_log(
        [
            "skill not in evidence: Kubernetes",
            "skill not in evidence: Rust",
            "employer not in evidence: Acme Corp",
            "full_name is required",
        ]
    )
    assert summary == {
        "issue_total": 4,
        "issue_counts": {
            "skill not in evidence": 2,
            "employer not in evidence": 1,
            "full_name is required": 1,
        },
    }
    blob = str(summary)
    assert "Kubernetes" not in blob
    assert "Rust" not in blob
    assert "Acme Corp" not in blob


def test_redact_service_error_replaces_issues_details_and_joined_message():
    message = (
        "skill not in evidence: Kubernetes; "
        "metric not grounded in evidence: grew revenue 40%"
    )
    details = {
        "issues": [
            "skill not in evidence: Kubernetes",
            "metric not grounded in evidence: grew revenue 40%",
        ],
        "structured_sections": {"experience": 1},
    }
    safe_message, safe_details = redact_service_error_for_log(
        message=message,
        details=details,
    )
    assert "Kubernetes" not in safe_message
    assert "40%" not in safe_message
    assert "skill not in evidence" in safe_message
    assert "metric not grounded in evidence" in safe_message
    assert safe_details is not None
    assert safe_details["structured_sections"] == {"experience": 1}
    assert safe_details["issues"]["issue_total"] == 2
    assert "Kubernetes" not in str(safe_details)


def test_redact_service_error_leaves_non_issue_errors_intact():
    message = "Base CV file is empty"
    details = {"structured_sections": {"experience": 0, "education": 0, "projects": 0}}
    safe_message, safe_details = redact_service_error_for_log(
        message=message,
        details=details,
    )
    assert safe_message == message
    assert safe_details == details
