#!/usr/bin/env python3
"""Release image coordinates, tag policy, and GHCR workflow contract."""

from __future__ import annotations

import argparse
import os
import re
import sys

REGISTRY = "ghcr.io"
PACKAGE_ROOT = "jobtrackr"
SERVICES = ("frontend", "backend", "cv-generation")
SHA_TAG_PREFIX = "sha-"
FULL_SHA = re.compile(r"^[0-9a-f]{40}$")
DOCKER_TAG = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$")
LONG_LIVED_SECRET = re.compile(r"secrets\.([A-Z][A-Z0-9_]+)")
COMPOSE_UP_BUILD = re.compile(r"compose(?:\s+\\\n\s+)?up[^\n]*--build|\bup --build\b")


def image_repository(owner: str, service: str) -> str:
    if service not in SERVICES:
        raise ValueError("unknown release service %s" % service)
    cleaned_owner = owner.strip().lower()
    if not cleaned_owner:
        raise ValueError("registry owner is required")
    return "%s/%s/%s/%s" % (REGISTRY, cleaned_owner, PACKAGE_ROOT, service)


def immutable_tag(commit_sha: str) -> str:
    sha = commit_sha.strip().lower()
    if sha.startswith(SHA_TAG_PREFIX):
        sha = sha[len(SHA_TAG_PREFIX) :]
    if not FULL_SHA.match(sha):
        raise ValueError("rollback tags require the full 40-character commit SHA")
    return SHA_TAG_PREFIX + sha


def moving_branch_tag(branch: str | None) -> str | None:
    if not branch:
        return None
    raw = branch.strip()
    if not raw or raw == "HEAD":
        return None
    if FULL_SHA.match(raw.lower()) or raw.lower().startswith(SHA_TAG_PREFIX):
        return None
    sanitized = re.sub(r"[^A-Za-z0-9_.-]+", "-", raw).strip("-").lower()
    if not sanitized or not DOCKER_TAG.match(sanitized):
        return None
    if sanitized.startswith(SHA_TAG_PREFIX) and FULL_SHA.match(sanitized[len(SHA_TAG_PREFIX) :]):
        return None
    return sanitized


def image_ref(owner: str, service: str, tag: str) -> str:
    return "%s:%s" % (image_repository(owner, service), tag)


def coords(*, owner: str, commit_sha: str, branch: str | None = None) -> dict[str, str]:
    tag = immutable_tag(commit_sha)
    values = {
        "immutable_tag": tag,
        "frontend_image": image_ref(owner, "frontend", tag),
        "backend_image": image_ref(owner, "backend", tag),
        "cv_generation_image": image_ref(owner, "cv-generation", tag),
    }
    moving = moving_branch_tag(branch)
    if moving:
        values["branch_tag"] = moving
    return values


def validate_workflow_text(text: str) -> list[str]:
    errors: list[str] = []
    if "name:" not in text or "jobs:" not in text:
        errors.append("workflow is missing a GitHub Actions job graph")
        return errors

    if "pull_request" not in text:
        errors.append("workflow must run verification on pull_request")
    if "workflow_dispatch" not in text:
        errors.append("workflow must allow manual workflow_dispatch publication")
    if "branches:" not in text or "main" not in text:
        errors.append("workflow must publish automatically on push to main")

    if "permissions:" not in text:
        errors.append("workflow must declare scoped permissions")
    if not re.search(r"contents:\s*read", text):
        errors.append("workflow must use contents: read")
    if not re.search(r"packages:\s*write", text):
        errors.append("publish job must use packages: write")
    if re.search(r"contents:\s*write", text):
        errors.append("workflow must not request contents: write")

    if "secrets.GITHUB_TOKEN" not in text:
        errors.append("workflow must authenticate to GHCR with GITHUB_TOKEN")
    for match in LONG_LIVED_SECRET.finditer(text):
        name = match.group(1)
        if name != "GITHUB_TOKEN":
            errors.append("workflow uses long-lived secret %s; use GITHUB_TOKEN" % name)

    if "ghcr.io" not in text:
        errors.append("workflow must publish to ghcr.io")

    for service in SERVICES:
        if service not in text:
            errors.append("workflow must build the %s image independently" % service)

    if "release-smoke" not in text:
        errors.append("workflow must run release-smoke before publication")
    if not re.search(r"needs:\s*\[[^\]]*(release-smoke|compose-config)", text) and "needs: release-smoke" not in text:
        if "needs:" not in text:
            errors.append("publish must depend on verification jobs")

    if "pull_request" in text and "if:" in text:
        publish_if = _job_if(text, "publish")
        if publish_if is None:
            errors.append("publish job must be skipped unless a supported publication event succeeds")
        elif "pull_request" in publish_if and "github.event_name != 'pull_request'" not in publish_if and "github.event_name == 'push'" not in publish_if and "workflow_dispatch" not in publish_if:
            errors.append("publish job if-condition does not exclude pull requests")
        elif publish_if is not None and "pull_request" not in publish_if:
            if "workflow_dispatch" not in publish_if or "push" not in publish_if:
                errors.append("publish job must allow push to main and workflow_dispatch only")

    publish_needs = _job_needs(text, "publish")
    if "release-smoke" not in publish_needs:
        errors.append("publish must wait for release-smoke")

    smoke_needs = _job_needs(text, "release-smoke")
    for required in ("compose-config", "backend-tests", "backend-image", "frontend-image", "cv-generation-image"):
        if required not in smoke_needs:
            errors.append("release-smoke must wait for %s" % required)

    if "release-smoke.sh" not in text:
        errors.append("workflow must start release smoke from the prebuilt-image script")
    if re.search(r"docker compose[^\n]*up[^\n]*--build", text):
        errors.append("workflow must not rebuild images during release smoke or publish")

    return errors


def validate_smoke_script(text: str) -> list[str]:
    errors: list[str] = []
    for name in (
        "JOBTRACKR_FRONTEND_IMAGE",
        "JOBTRACKR_BACKEND_IMAGE",
        "JOBTRACKR_CV_GENERATION_IMAGE",
    ):
        if name not in text:
            errors.append("release smoke must require %s" % name)
    if "--no-build" not in text:
        errors.append("release smoke must start Compose without rebuilding")
    if COMPOSE_UP_BUILD.search(text):
        errors.append("release smoke must not pass --build to Compose")
    if "full-stack-smoke.py" not in text:
        errors.append("release smoke must reuse the full-stack origin checks")
    return errors


def validate_release_docs(text: str, *, owner: str = "ricard0g") -> list[str]:
    errors: list[str] = []
    lowered = text.lower()
    for service in SERVICES:
        coordinate = image_repository(owner, service)
        if coordinate not in text:
            errors.append("release docs must identify %s" % coordinate)
    if "sha-" not in lowered:
        errors.append("release docs must identify the immutable sha- tag")
    if "rollback" not in lowered:
        errors.append("release docs must say the branch tag is not the rollback identity")
    if "workflow_dispatch" not in lowered:
        errors.append("release docs must list workflow_dispatch as a publication event")
    if "pull request" not in lowered:
        errors.append("release docs must say pull requests do not publish")
    if "github_token" not in lowered:
        errors.append("release docs must identify GITHUB_TOKEN as the registry credential")
    if "gemini" not in lowered:
        errors.append("release docs must say deterministic verification does not call Gemini")
    return errors


def _job_block(text: str, job: str) -> str | None:
    match = re.search(r"(?m)^  %s:\n" % re.escape(job), text)
    if not match:
        return None
    start = match.end()
    next_job = re.search(r"(?m)^  [A-Za-z0-9_-]+:\n", text[start:])
    end = start + next_job.start() if next_job else len(text)
    return text[start:end]


def _job_header(text: str, job: str) -> str:
    block = _job_block(text, job) or ""
    return block.split("steps:", 1)[0]


def _job_needs(text: str, job: str) -> set[str]:
    header = _job_header(text, job)
    match = re.search(r"needs:\s*\[([^\]]+)\]", header)
    if match:
        return {item.strip(" '\"") for item in match.group(1).split(",") if item.strip()}
    match = re.search(r"needs:\s*([A-Za-z0-9_-]+)", header)
    if match:
        return {match.group(1)}
    return set()


def _job_if(text: str, job: str) -> str | None:
    match = re.search(r"if:\s*(.+)", _job_header(text, job))
    if not match:
        return None
    return match.group(1).strip().strip("'\"")


def write_github_output(path: str, values: dict[str, str]) -> None:
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write("%s=%s\n" % (key, value))


def emit_coords(values: dict[str, str]) -> None:
    for key, value in values.items():
        print("%s=%s" % (key, value))


def self_test() -> None:
    frontend = image_repository("Ricard0G", "frontend")
    if frontend != "ghcr.io/ricard0g/jobtrackr/frontend":
        raise SystemExit("expected lowercase GHCR frontend repository, got %s" % frontend)
    backend = image_repository("ricard0g", "backend")
    if backend != "ghcr.io/ricard0g/jobtrackr/backend":
        raise SystemExit("expected backend repository, got %s" % backend)
    cv_generation = image_repository("ricard0g", "cv-generation")
    if cv_generation != "ghcr.io/ricard0g/jobtrackr/cv-generation":
        raise SystemExit("expected CV Generation repository, got %s" % cv_generation)

    try:
        image_repository("ricard0g", "postgres")
    except ValueError:
        pass
    else:
        raise SystemExit("postgres is not a published application image")

    sha = "0123456789abcdef0123456789abcdef01234567"
    tag = immutable_tag(sha)
    if tag != "sha-0123456789abcdef0123456789abcdef01234567":
        raise SystemExit("expected immutable sha- prefix tag, got %s" % tag)
    if immutable_tag("SHA-0123456789ABCDEF0123456789ABCDEF01234567") != tag:
        raise SystemExit("immutable tags must normalize SHA case")

    try:
        immutable_tag("0123456")
    except ValueError as exc:
        if "40-character" not in str(exc):
            raise SystemExit("short SHA rejection should mention full 40-character SHA")
    else:
        raise SystemExit("short SHA must not be a rollback tag")

    if moving_branch_tag("main") != "main":
        raise SystemExit("main must be a moving discovery tag")
    if moving_branch_tag("feature/full-containerization-services") != "feature-full-containerization-services":
        raise SystemExit("branch tags must sanitize slashes")
    if moving_branch_tag(tag) is not None:
        raise SystemExit("moving branch tags must not reuse the immutable SHA identity")
    if moving_branch_tag("") is not None or moving_branch_tag("HEAD") is not None:
        raise SystemExit("empty or HEAD refs must not produce a moving tag")

    values = coords(owner="ricard0g", commit_sha=sha, branch="main")
    if values["frontend_image"] != "ghcr.io/ricard0g/jobtrackr/frontend:" + tag:
        raise SystemExit("frontend image coordinate was %s" % values["frontend_image"])
    if values["backend_image"] != "ghcr.io/ricard0g/jobtrackr/backend:" + tag:
        raise SystemExit("backend image coordinate was %s" % values["backend_image"])
    if values["cv_generation_image"] != "ghcr.io/ricard0g/jobtrackr/cv-generation:" + tag:
        raise SystemExit("CV Generation image coordinate was %s" % values["cv_generation_image"])
    if values["branch_tag"] != "main":
        raise SystemExit("branch discovery tag was %s" % values["branch_tag"])
    if values["immutable_tag"] == values["branch_tag"]:
        raise SystemExit("moving branch tag must not be the rollback identity")

    good_workflow = """
name: Release images
on:
  push:
    branches:
      - main
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  compose-config:
    runs-on: ubuntu-latest
  backend-tests:
    runs-on: ubuntu-latest
  backend-image:
    runs-on: ubuntu-latest
  frontend-image:
    runs-on: ubuntu-latest
  cv-generation-image:
    runs-on: ubuntu-latest
  release-smoke:
    needs: [compose-config, backend-tests, backend-image, frontend-image, cv-generation-image]
    runs-on: ubuntu-latest
    steps:
      - run: ./scripts/acceptance/release-smoke.sh
  publish:
    needs: [release-smoke]
    if: github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && github.ref == 'refs/heads/main')
    permissions:
      contents: read
      packages: write
    steps:
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
"""
    errors = validate_workflow_text(good_workflow)
    if errors:
        raise SystemExit("self-test expected a valid workflow to pass: %s" % errors)

    secret_workflow = good_workflow.replace("secrets.GITHUB_TOKEN", "secrets.GHCR_TOKEN")
    errors = validate_workflow_text(secret_workflow)
    if not any("GHCR_TOKEN" in error for error in errors):
        raise SystemExit("self-test expected a long-lived GHCR secret to fail: %s" % errors)

    rebuild_workflow = good_workflow.replace(
        "./scripts/acceptance/release-smoke.sh",
        "docker compose --profile full up --build",
    )
    errors = validate_workflow_text(rebuild_workflow)
    if not any("rebuild" in error or "release-smoke" in error for error in errors):
        raise SystemExit("self-test expected Compose --build during release to fail: %s" % errors)

    unscoped = good_workflow.replace("contents: read\n", "contents: write\n", 1)
    errors = validate_workflow_text(unscoped)
    if not any("contents: write" in error for error in errors):
        raise SystemExit("self-test expected contents: write to fail: %s" % errors)

    no_publish_gate = good_workflow.replace("needs: [release-smoke]", "needs: [backend-image]")
    errors = validate_workflow_text(no_publish_gate)
    if not any("release-smoke" in error for error in errors):
        raise SystemExit("self-test expected publish without smoke to fail: %s" % errors)

    good_smoke = """
JOBTRACKR_FRONTEND_IMAGE=${JOBTRACKR_FRONTEND_IMAGE:?}
JOBTRACKR_BACKEND_IMAGE=${JOBTRACKR_BACKEND_IMAGE:?}
JOBTRACKR_CV_GENERATION_IMAGE=${JOBTRACKR_CV_GENERATION_IMAGE:?}
compose up --no-build -d --wait
python3 scripts/acceptance/full-stack-smoke.py
"""
    errors = validate_smoke_script(good_smoke)
    if errors:
        raise SystemExit("self-test expected a valid release smoke script to pass: %s" % errors)

    rebuild_smoke = good_smoke.replace("up --no-build", "up --build")
    errors = validate_smoke_script(rebuild_smoke)
    if not any("--build" in error or "without rebuilding" in error for error in errors):
        raise SystemExit("self-test expected release smoke --build to fail: %s" % errors)

    good_docs = """
Frontend: ghcr.io/ricard0g/jobtrackr/frontend
Backend: ghcr.io/ricard0g/jobtrackr/backend
CV Generation: ghcr.io/ricard0g/jobtrackr/cv-generation
Immutable tag: sha-<commit>. Do not use the moving branch tag for rollback.
Pull requests verify and never publish. Push to main and workflow_dispatch publish.
Authenticate with GITHUB_TOKEN. Deterministic CI does not call Gemini.
"""
    errors = validate_release_docs(good_docs)
    if errors:
        raise SystemExit("self-test expected release docs to pass: %s" % errors)
    errors = validate_release_docs(good_docs.replace("ghcr.io/ricard0g/jobtrackr/frontend", "jobtrackr-frontend:local"))
    if not any("frontend" in error for error in errors):
        raise SystemExit("self-test expected docs missing the frontend coordinate to fail: %s" % errors)

    print("release image policy self-test passed")


def _read(path: str) -> str:
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def main(argv: list[str]) -> int:
    if argv[1:] == ["--self-test"]:
        self_test()
        return 0

    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    coords_parser = sub.add_parser("coords", help="print GHCR image coordinates")
    coords_parser.add_argument("--owner", default=os.environ.get("GITHUB_REPOSITORY_OWNER", ""))
    coords_parser.add_argument("--sha", default=os.environ.get("GITHUB_SHA", ""))
    coords_parser.add_argument("--branch", default=os.environ.get("GITHUB_REF_NAME", ""))
    coords_parser.add_argument("--github-output", default="")

    validate_parser = sub.add_parser("validate-workflow", help="validate the GHCR workflow contract")
    validate_parser.add_argument("path")

    smoke_parser = sub.add_parser("validate-smoke", help="validate the release smoke script contract")
    smoke_parser.add_argument("path")

    docs_parser = sub.add_parser("validate-docs", help="validate release documentation")
    docs_parser.add_argument("path")

    args = parser.parse_args(argv[1:])
    if args.command == "coords":
        values = coords(owner=args.owner, commit_sha=args.sha, branch=args.branch or None)
        emit_coords(values)
        if args.github_output:
            write_github_output(args.github_output, values)
        return 0

    if args.command == "validate-workflow":
        errors = validate_workflow_text(_read(args.path))
    elif args.command == "validate-smoke":
        errors = validate_smoke_script(_read(args.path))
    else:
        errors = validate_release_docs(_read(args.path))
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("%s is valid" % args.path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
