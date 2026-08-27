#!/usr/bin/env python3
"""Validate the VPS operator lifecycle runbook and helper scripts.

The seam is the documented public interface: update, rollback, backup, restore,
persistence, recovery, Generated CV acceptance, and troubleshooting. Dump and
restore must address the Compose postgres service, not a fixed container name.
Committed examples must stay placeholders. This script never talks to Docker,
Cloudflare, or a VPS.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HEADING = re.compile(r"^(#{2,3})\s+(.+?)\s*$", re.M)
FENCE = re.compile(r"```(?:bash|sh)?\n(.*?)```", re.S)
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
JWTISH = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
CF_TOKEN = re.compile(r"\b(cfk_|v1\.0-[A-Za-z0-9_-]{20,})")
GITHUB_TOKEN = re.compile(r"\b(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{8,}")
AKIA = re.compile(r"\bAKIA[0-9A-Z]{16}\b")
PEM = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")
FIXED_PG_CONTAINER = re.compile(r"docker\s+exec\s+[A-Za-z0-9_.-]*postgres[A-Za-z0-9_.-]*")
PLACEHOLDER_EMAIL_SUFFIXES = (".example.test", ".example.com")
EXAMPLE_RELATIVE_PATHS = (
    ".env.example",
    ".env.compose.example",
    ".env.vps.example",
    "scripts/acceptance/vps.fixture.env",
    "scripts/acceptance/full-stack.fixture.env",
    "scripts/acceptance/backend-container.fixture.env",
    "scripts/acceptance/frontend-container.fixture.env",
    "config/nginx/vps-system.conf",
    "config/cloudflared/config.example.yml",
)
DUMP_SCRIPT_RELATIVE = "scripts/db-dump-local-pg.sh"
RESTORE_SCRIPT_RELATIVE = "scripts/db-restore-dump.sh"
BACKUP_WRAPPER_RELATIVE = "scripts/vps-backup.sh"
RESTORE_WRAPPER_RELATIVE = "scripts/vps-restore.sh"


def _headings(text: str) -> list[tuple[int, str, int]]:
    found: list[tuple[int, str, int]] = []
    for match in HEADING.finditer(text):
        found.append((len(match.group(1)), match.group(2).strip().lower(), match.start()))
    return found


def _section(text: str, needle: str) -> str:
    headings = _headings(text)
    for index, (level, title, start) in enumerate(headings):
        if needle in title:
            if index + 1 < len(headings):
                end = headings[index + 1][2]
                for later_index in range(index + 1, len(headings)):
                    later_level, _, later_start = headings[later_index]
                    if later_level <= level:
                        end = later_start
                        break
                else:
                    end = len(text)
            else:
                end = len(text)
            return text[start:end]
    return ""


def _has_heading(text: str, *needles: str) -> bool:
    titles = [title for _, title, _ in _headings(text)]
    return any(any(needle in title for needle in needles) for title in titles)


def _code_blocks(text: str) -> list[str]:
    return [match.group(1) for match in FENCE.finditer(text)]


def _command_lines(text: str) -> list[str]:
    lines: list[str] = []
    for block in _code_blocks(text):
        for raw in block.splitlines():
            stripped = raw.strip()
            if stripped and not stripped.startswith("#"):
                lines.append(stripped)
    return lines


def validate_runbook(text: str) -> list[str]:
    errors: list[str] = []
    required_headings = (
        ("update",),
        ("rollback",),
        ("backup",),
        ("restore",),
        ("persistence",),
        ("recovery",),
        ("troubleshooting",),
        ("generated cv", "operator acceptance"),
    )
    for needles in required_headings:
        if not _has_heading(text, *needles):
            errors.append("runbook is missing a %s heading" % " / ".join(needles))

    update = _section(text, "update")
    if update:
        if "sha-" not in update or "immutable" not in update.lower():
            errors.append("update procedure must select an immutable sha- release tag")
        if "pull" not in update:
            errors.append("update procedure must pull images")
        if "--no-build" not in update:
            errors.append("update procedure must recreate with --no-build")
        if "--wait" not in update:
            errors.append("update procedure must wait for health")
        if "logs" not in update.lower():
            errors.append("update procedure must inspect logs")
        if "127.0.0.1" not in update:
            errors.append("update procedure must include a loopback smoke check")
        if "https://" not in update.lower() and "public hostname" not in update.lower():
            errors.append("update procedure must include a public-hostname smoke check")
        if "force-recreate" in update and "only changed" not in update.lower():
            errors.append("update procedure must recreate only changed services, not force-recreate everything")

    rollback = _section(text, "rollback")
    if rollback:
        if "sha-" not in rollback or "previous" not in rollback.lower():
            errors.append("rollback procedure must select the previous immutable sha- tag")
        if "jobtrackr_pgdata" not in rollback:
            errors.append("rollback procedure must keep the PostgreSQL volume jobtrackr_pgdata")
        for command in _command_lines(rollback):
            lowered = command.lower()
            if "down" in lowered and "-v" in lowered:
                errors.append("rollback procedure must not delete volumes with compose down -v")
            if "volume rm" in lowered or "volume rename" in lowered:
                errors.append("rollback procedure must not delete or rename the PostgreSQL volume")

    backup = _section(text, "backup")
    if backup:
        lowered = backup.lower()
        if "flyway" not in lowered and "migration" not in lowered:
            errors.append("backup procedure must create a recovery point before Flyway migrations")
        if "postgres" not in lowered:
            errors.append("backup procedure must address the Compose postgres service")
        if FIXED_PG_CONTAINER.search(backup):
            errors.append("backup procedure addresses a fixed PostgreSQL container name")
        if "compose" not in lowered:
            errors.append("backup procedure must use Compose rather than a fixed container name")

    restore = _section(text, "restore")
    if restore:
        lowered = restore.lower()
        if "same" not in lowered or "vps" not in lowered:
            errors.append("restore procedure must cover the same VPS")
        if "replacement" not in lowered:
            errors.append("restore procedure must cover a replacement VPS")
        if "docker volume create" not in restore and "volume create" not in lowered:
            errors.append("replacement-VPS restore must create the external volume explicitly")
        if "postgres" not in lowered:
            errors.append("restore procedure must address the Compose postgres service")
        if FIXED_PG_CONTAINER.search(restore):
            errors.append("restore procedure addresses a fixed PostgreSQL container name")

    persistence = _section(text, "persistence")
    if persistence:
        lowered = persistence.lower()
        if "postgresql" not in lowered:
            errors.append("persistence guidance must identify PostgreSQL")
        if "application state" not in lowered:
            errors.append("persistence guidance must say PostgreSQL stores application state")
        if "queue" not in lowered:
            errors.append("persistence guidance must say PostgreSQL stores durable generation and cleanup queues")
        if "r2" not in lowered:
            errors.append("persistence guidance must identify R2")
        if "base cv" not in lowered:
            errors.append("persistence guidance must say R2 stores Base CVs")
        if "generated cv" not in lowered:
            errors.append("persistence guidance must say R2 stores Generated CVs")
        if "preview" not in lowered:
            errors.append("persistence guidance must say R2 stores cached previews")

    recovery = _section(text, "recovery")
    if recovery:
        lowered = recovery.lower()
        if "postgresql" not in lowered or "r2" not in lowered:
            errors.append("recovery guidance must require both PostgreSQL and R2")
        if "image" not in lowered or "delete" not in lowered:
            errors.append("recovery guidance must say replacing images does not delete PostgreSQL or R2")

    generated = _section(text, "generated cv") or _section(text, "operator acceptance")
    if generated:
        lowered = generated.lower()
        if "gemini" not in lowered:
            errors.append("operator acceptance must require configured Gemini credentials")
        if "r2" not in lowered:
            errors.append("operator acceptance must require configured R2 credentials")
        if "browser" not in lowered:
            errors.append("operator acceptance must create a Generated CV through the protected browser application")
        if "credential" not in lowered and "secret" not in lowered:
            errors.append("operator acceptance must warn against placing credentials in command output")

    troubleshooting = _section(text, "troubleshooting")
    if troubleshooting:
        lowered = troubleshooting.lower()
        topics = (
            ("unhealthy", "health"),
            ("migrat",),
            ("proxy", "cookie"),
            ("gotenberg",),
            ("cv generation", "readiness", "ready"),
            ("r2",),
            ("ghcr",),
            ("volume",),
            ("log",),
        )
        for needles in topics:
            if not any(needle in lowered for needle in needles):
                errors.append("troubleshooting does not cover %s" % " / ".join(needles))

    return errors


def validate_db_script(text: str, name: str) -> list[str]:
    errors: list[str] = []
    if "docker compose" not in text:
        errors.append("%s does not call docker compose" % name)
    if "COMPOSE_FILE" not in text:
        errors.append("%s does not honor COMPOSE_FILE for the VPS Compose definition" % name)
    if "COMPOSE_ENV_FILE" not in text:
        errors.append("%s does not honor COMPOSE_ENV_FILE" % name)
    if not re.search(r"exec\s+-T\s+postgres\b", text):
        errors.append("%s does not exec the Compose postgres service" % name)
    if FIXED_PG_CONTAINER.search(text) or re.search(r"jobtrackr-postgres-1", text):
        errors.append("%s addresses a fixed PostgreSQL container name" % name)
    return errors


def validate_vps_wrapper(text: str, name: str, target_script: str) -> list[str]:
    errors: list[str] = []
    if "docker-compose.vps.yml" not in text:
        errors.append("%s must select docker-compose.vps.yml" % name)
    if ".env.vps" not in text:
        errors.append("%s must select .env.vps" % name)
    if target_script not in text:
        errors.append("%s must call %s" % (name, target_script))
    if "jobtrackr-postgres-1" in text:
        errors.append("%s addresses a fixed PostgreSQL container name" % name)
    return errors


def validate_placeholders(text: str, label: str) -> list[str]:
    errors: list[str] = []
    if JWTISH.search(text) or CF_TOKEN.search(text) or GITHUB_TOKEN.search(text) or AKIA.search(text):
        errors.append("%s contains a credential-shaped token; use placeholders only" % label)
    if PEM.search(text):
        errors.append("%s contains a private key; use placeholders only" % label)
    for match in EMAIL.finditer(text):
        address = match.group(0)
        if not any(address.endswith(suffix) for suffix in PLACEHOLDER_EMAIL_SUFFIXES):
            errors.append("%s contains an email address; use placeholders only" % label)
            break
    return errors


def _sample_runbook() -> str:
    return """
# Deploy JobTrackr on a VPS

## Update

Select the next immutable `sha-` tag. Pull images, then recreate only changed services:

```bash
docker compose -f docker-compose.vps.yml --env-file .env.vps pull
docker compose -f docker-compose.vps.yml --env-file .env.vps up --no-build -d --wait
```

Inspect logs, then smoke the loopback origin and the public hostname:

```bash
docker compose -f docker-compose.vps.yml --env-file .env.vps logs --tail=100 backend
curl -fsS http://127.0.0.1:18080/health
curl -fsS https://jobtrackr.example.test/health
```

## Rollback

Select the previous immutable `sha-` tag and restore the application containers. Do not delete or rename `jobtrackr_pgdata`.

```bash
docker compose -f docker-compose.vps.yml --env-file .env.vps pull
docker compose -f docker-compose.vps.yml --env-file .env.vps up --no-build -d --wait
```

## Backup

Create a PostgreSQL recovery point before Flyway migrations. Address the Compose `postgres` service:

```bash
./scripts/vps-backup.sh db/dumps/pre-deploy.dump
```

## Restore

### Same VPS

Restore into the Compose `postgres` service, then start the application containers.

### Replacement VPS

Create the external volume, start postgres, restore, then start the rest:

```bash
docker volume create jobtrackr_pgdata
./scripts/vps-restore.sh db/dumps/pre-deploy.dump
```

## Persistence

PostgreSQL stores application state and the durable generation and cleanup queues.
R2 stores Base CVs, Generated CVs, and cached previews.

## Recovery

Complete recovery requires both PostgreSQL and R2. Replacing application images does not delete either data store.

## Operator acceptance: Generated CV

After valid Gemini and R2 credentials are configured, create one real Generated CV through the protected browser application. Do not place those credentials in command output.

## Troubleshooting

Unhealthy dependencies, Flyway migrations, proxy and cookie errors, Gotenberg conversion, CV Generation readiness, R2 access, GHCR pulls, volume mistakes, and log inspection.
"""


def _sample_dump_script() -> str:
    return """
# Honors native COMPOSE_FILE and COMPOSE_ENV_FILE.
compose() {
  if [ -n "${COMPOSE_ENV_FILE:-}" ]; then
    docker compose --env-file "$COMPOSE_ENV_FILE" "$@"
  else
    docker compose "$@"
  fi
}
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
"""


def _sample_backup_wrapper() -> str:
    return """
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.vps.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-$ROOT_DIR/.env.vps}"
exec "$ROOT_DIR/scripts/db-dump-local-pg.sh" "$@"
"""


def self_test() -> None:
    good = _sample_runbook()
    errors = validate_runbook(good)
    if errors:
        raise SystemExit("self-test expected a valid runbook to pass: %s" % errors)

    missing_update = good.replace("## Update", "## Patch")
    errors = validate_runbook(missing_update)
    if not any("update" in error for error in errors):
        raise SystemExit("self-test expected a missing update heading to fail: %s" % errors)

    no_wait = good.replace("up --no-build -d --wait", "up --no-build -d")
    errors = validate_runbook(no_wait)
    if not any("wait" in error for error in errors):
        raise SystemExit("self-test expected a missing --wait to fail: %s" % errors)

    destructive = good.replace(
        "docker compose -f docker-compose.vps.yml --env-file .env.vps up --no-build -d --wait\n```\n\n## Backup",
        "docker compose -f docker-compose.vps.yml --env-file .env.vps down -v\n```\n\n## Backup",
    )
    errors = validate_runbook(destructive)
    if not any("down -v" in error for error in errors):
        raise SystemExit("self-test expected rollback down -v to fail: %s" % errors)

    named_container = good.replace(
        "./scripts/vps-backup.sh db/dumps/pre-deploy.dump",
        "docker exec jobtrackr-postgres-1 pg_dump -U jobtrackr_app",
    )
    errors = validate_runbook(named_container)
    if not any("fixed PostgreSQL container name" in error for error in errors):
        raise SystemExit("self-test expected a fixed postgres container name to fail: %s" % errors)

    no_r2 = good.replace("R2 stores Base CVs, Generated CVs, and cached previews.", "")
    errors = validate_runbook(no_r2)
    if not any("R2" in error for error in errors):
        raise SystemExit("self-test expected missing R2 persistence to fail: %s" % errors)

    dump = _sample_dump_script()
    errors = validate_db_script(dump, "dump")
    if errors:
        raise SystemExit("self-test expected a valid dump script to pass: %s" % errors)

    fixed = dump.replace("compose exec -T postgres", "docker exec jobtrackr-postgres-1")
    errors = validate_db_script(fixed, "dump")
    if not any("fixed PostgreSQL container name" in error or "postgres service" in error for error in errors):
        raise SystemExit("self-test expected dump container name to fail: %s" % errors)

    wrapper = _sample_backup_wrapper()
    errors = validate_vps_wrapper(wrapper, "vps-backup.sh", "db-dump-local-pg.sh")
    if errors:
        raise SystemExit("self-test expected a valid backup wrapper to pass: %s" % errors)

    leaked = "GOOGLE_AI_API_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30abpayloadxx"
    errors = validate_placeholders(leaked, "example")
    if not any("credential-shaped token" in error for error in errors):
        raise SystemExit("self-test expected a JWT-shaped example to fail: %s" % errors)
    if "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" in " ".join(errors):
        raise SystemExit("self-test leaked a token value: %s" % errors)

    clean_example = "GOOGLE_AI_API_KEY=replace-with-vps-gemini-key\nR2_ENDPOINT=https://YOUR_ACCOUNT_ID.eu.r2.cloudflarestorage.com\n"
    errors = validate_placeholders(clean_example, "example")
    if errors:
        raise SystemExit("self-test expected placeholders to pass: %s" % errors)

    print("vps operator lifecycle validator self-test passed")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def validate_repository(root: Path) -> list[str]:
    errors: list[str] = []
    runbook = root / "docs" / "deploying-vps.md"
    if not runbook.is_file():
        return ["missing docs/deploying-vps.md"]
    errors.extend(validate_runbook(_read(runbook)))
    errors.extend(validate_placeholders(_read(runbook), "docs/deploying-vps.md"))

    dump = root / DUMP_SCRIPT_RELATIVE
    restore = root / RESTORE_SCRIPT_RELATIVE
    backup = root / BACKUP_WRAPPER_RELATIVE
    restore_wrapper = root / RESTORE_WRAPPER_RELATIVE
    for path, label in (
        (dump, DUMP_SCRIPT_RELATIVE),
        (restore, RESTORE_SCRIPT_RELATIVE),
        (backup, BACKUP_WRAPPER_RELATIVE),
        (restore_wrapper, RESTORE_WRAPPER_RELATIVE),
    ):
        if not path.is_file():
            errors.append("missing %s" % label)

    if dump.is_file():
        errors.extend(validate_db_script(_read(dump), DUMP_SCRIPT_RELATIVE))
    if restore.is_file():
        errors.extend(validate_db_script(_read(restore), RESTORE_SCRIPT_RELATIVE))
    if backup.is_file():
        errors.extend(validate_vps_wrapper(_read(backup), BACKUP_WRAPPER_RELATIVE, "db-dump-local-pg.sh"))
    if restore_wrapper.is_file():
        errors.extend(validate_vps_wrapper(_read(restore_wrapper), RESTORE_WRAPPER_RELATIVE, "db-restore-dump.sh"))

    for relative in EXAMPLE_RELATIVE_PATHS:
        path = root / relative
        if not path.is_file():
            errors.append("missing example %s" % relative)
            continue
        errors.extend(validate_placeholders(_read(path), relative))
    return errors


def main(argv: list[str]) -> int:
    if argv[1:] == ["--self-test"]:
        self_test()
        return 0

    root = Path(argv[1]) if len(argv) == 2 else Path.cwd()
    errors = validate_repository(root)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("vps operator lifecycle runbook, dump/restore scripts, and examples are valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
