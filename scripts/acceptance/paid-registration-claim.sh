# shellcheck shell=bash
# Sourced by Compose smokes. Requires a `compose` function and POSTGRES_USER/POSTGRES_DB in the env.
# Seeds a paid Registration Claim and exports the email and token full-stack-smoke.py registers with.

seed_paid_registration_claim() {
  local seed_sql
  seed_sql="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fixtures/paid-registration-claim.sql"
  JOBTRACKR_REGISTRATION_EMAIL="full-stack-$(python3 -c 'import uuid; print(uuid.uuid4().hex[:10])')@example.test"
  JOBTRACKR_REGISTRATION_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
  export JOBTRACKR_REGISTRATION_EMAIL JOBTRACKR_REGISTRATION_TOKEN

  compose exec -T postgres psql -q -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -v email="$JOBTRACKR_REGISTRATION_EMAIL" \
    -v token="$JOBTRACKR_REGISTRATION_TOKEN" \
    -f - <"$seed_sql"
}
