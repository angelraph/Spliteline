#!/usr/bin/env sh
# onchainos keeps its session at $HOME/.onchainos. The container filesystem is
# ephemeral except for the mounted volume at /app/data, so pointing HOME there
# makes a successful login survive redeploys instead of needing to re-pair on
# every boot (see docs/onchainos-login.md for the full story).
set -e

export HOME=/app/data/onchainos-home
mkdir -p "$HOME"

# Login happens in the background so it never blocks the server from binding
# its port — Railway's health check would kill the deploy if startup stalled
# for the up-to-5-minute poll wait below.
(
  if onchainos wallet status 2>/dev/null | grep -q '"loggedIn":true'; then
    echo "[entrypoint] onchainos already has a valid session, skipping login."
  else
    echo "[entrypoint] no valid session — starting login (init phase)..."
    INIT_JSON=$(onchainos wallet login)
    echo "$INIT_JSON"

    SESSION_ID=$(echo "$INIT_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).data.authSessionId)}catch(e){console.log('')}})")
    LOGIN_URL=$(echo "$INIT_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).data.loginUrl)}catch(e){console.log('')}})")

    if [ -z "$SESSION_ID" ]; then
      echo "[entrypoint] login init did not return a session id. Payouts will fail until this is resolved."
    else
      echo "[entrypoint] ==================================================================="
      echo "[entrypoint] OPEN THIS URL WITHIN 5 MINUTES TO AUTHORIZE THE AGENT WALLET:"
      echo "[entrypoint] $LOGIN_URL"
      echo "[entrypoint] ==================================================================="
      echo "[entrypoint] polling for approval in the background (up to 5 minutes)..."
      if onchainos wallet login --phase poll --session-id "$SESSION_ID"; then
        echo "[entrypoint] login completed and persisted."
      else
        echo "[entrypoint] poll did not complete in time. Payouts will fail until login succeeds (redeploy to retry, or the link may still be pollable)."
      fi
    fi
  fi
) &

exec node server.js
