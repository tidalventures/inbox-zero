# Railway self-hosting

This branch has not been deployed. These are instructions for a later, human-operated deployment. Keep secrets in Railway variables or a local secret manager, never in this public repository. Restrict access to Railway, Google Cloud and OpenRouter accounts and back up Postgres and the encryption secrets.

## Architecture

Use Railway Postgres, Railway Redis, a private redis-http service, and three services built from this repository with `docker/Dockerfile.prod`: web, worker and cron. The root `railway.toml` selects that Dockerfile. Give each service its own dashboard start command, because one configuration file cannot define three independently running services. Web runs `/app/docker/scripts/start.sh`, which attempts migrations at startup. Check the logs: the existing script continues even if migration fails. Worker runs `/app/docker/scripts/start-worker.sh`. Cron runs `/app/docker/scripts/start-railway-cron.sh`. Do not set Railway cron scheduling on the continuously running cron service. Only web needs a public domain. Use Railway private networking for the other services and avoid exposing Redis or redis-http publicly.

The app needs both protocols: `REDIS_URL` is a Redis TCP URL for BullMQ and ioredis, while `REDIS_HTTP_URL` and `REDIS_HTTP_TOKEN` are for the Upstash-compatible HTTP API. Railway Redis alone does not provide that HTTP API. The recommended single-user default is Railway Redis plus a private `hiett/serverless-redis-http` image service. Set its `SRH_MODE=env`, `SRH_CONNECTION_STRING` to the Railway Redis private TCP URL, and `SRH_TOKEN` to the same random value as `REDIS_HTTP_TOKEN`. Use its private HTTP URL with port 80 for `REDIS_HTTP_URL`. Alternatively use an Upstash Redis database providing both TCP and REST credentials, and omit the helper. Keep the HTTP token secret even on the private network.

The cron service waits for web and calls scheduled actions and automation jobs every 15 minutes, bulk recovery every 10 minutes, Gmail watch renewal every 6 hours, and all four retention endpoints daily. Retention configuration determines what is deleted. Digest, summary, meeting and follow-up jobs are optional and are not in this loop; see [the self-hosting schedule](docs/hosting/self-hosting.mdx) if enabling those features.

## Variables

Set these on web and worker, using Railway service references for private URLs. Cron only needs `INTERNAL_API_URL` and the same `CRON_SECRET`. Use one stable set of values across services and restarts. For `NEXT_PUBLIC_*` settings, the image replaces build placeholders on web startup; set them as runtime variables before first boot.

```dotenv
NODE_ENV=production
NEXT_PUBLIC_BASE_URL=https://YOUR-RAILWAY-ORIGIN
DATABASE_URL=postgresql://USER:PASSWORD@PRIVATE-POSTGRES-HOST:5432/DATABASE
DIRECT_URL=postgresql://USER:PASSWORD@PRIVATE-POSTGRES-HOST:5432/DATABASE
REDIS_URL=redis://USER:PASSWORD@PRIVATE-REDIS-HOST:6379
REDIS_HTTP_URL=http://PRIVATE-REDIS-HTTP-HOST:80
REDIS_HTTP_TOKEN=GENERATE_RANDOM_SECRET
QUEUE_BACKEND=bullmq
INTERNAL_API_URL=http://PRIVATE-WEB-HOST:3000
INTERNAL_API_KEY=GENERATE_RANDOM_SECRET
CRON_SECRET=GENERATE_RANDOM_SECRET
AUTH_SECRET=GENERATE_RANDOM_SECRET
AUTH_ALLOWED_EMAILS=james@tidalvc.com
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_PUBSUB_TOPIC_NAME=projects/YOUR_PROJECT_ID/topics/YOUR_TOPIC
GOOGLE_PUBSUB_VERIFICATION_TOKEN=GENERATE_RANDOM_SECRET
EMAIL_ENCRYPT_SECRET=GENERATE_RANDOM_SECRET
EMAIL_ENCRYPT_SALT=GENERATE_RANDOM_SALT
API_KEY_SALT=GENERATE_RANDOM_SECRET
LLM_API_KEY=YOUR_OPENROUTER_KEY
DEFAULT_LLMS=openrouter:openai/gpt-6-luna
ECONOMY_LLMS=openrouter:openai/gpt-6-luna
NANO_LLMS=openrouter:openai/gpt-6-luna
CHAT_LLMS=openrouter:openai/gpt-6-luna
DRAFT_LLMS=openrouter:openai/gpt-6-luna
NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true
NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED=false
```

Generate each independent secret with `openssl rand -hex 32`, and the encryption salt with `openssl rand -hex 16`. Do not rotate or lose `EMAIL_ENCRYPT_SECRET` or `EMAIL_ENCRYPT_SALT` without a token migration: existing encrypted tokens depend on both. Legacy plaintext tokens remain readable and become encrypted when rewritten. Set `AUTH_ALLOWED_EMAILS` before web starts: production signup is denied if both allowlists are empty. Leave `AUTH_ALLOWED_EMAIL_DOMAINS` unset for the single account. Existing accounts are not removed by changing the signup policy. Leave `MCP_SERVER_ENABLED`, `NEXT_PUBLIC_EXTERNAL_API_ENABLED`, `NEXT_PUBLIC_CLEANER_ENABLED`, `WEBHOOK_ALLOW_PRIVATE_IPS` and `MCP_ALLOW_PRIVATE_IPS` unset or false. Keep `AUTO_ENABLE_ORG_ANALYTICS` unset or false.

Leave all of these telemetry and marketing variables unset:

```text
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_API_HOST
NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID
POSTHOG_API_SECRET
POSTHOG_PROJECT_ID
POSTHOG_FEEDBACK_SURVEY_ID
POSTHOG_FEEDBACK_SURVEY_QUESTION_ID
POSTHOG_LLM_EVALS_APPROVED_EMAILS
NEXT_PUBLIC_SENTRY_DSN
SENTRY_AUTH_TOKEN
SENTRY_ORGANIZATION
SENTRY_PROJECT
AXIOM_TOKEN
AXIOM_DATASET
AXIOM_AUDIT_TOKEN
AXIOM_AUDIT_DATASET
NEXT_PUBLIC_AXIOM_TOKEN
NEXT_PUBLIC_AXIOM_DATASET
TINYBIRD_TOKEN
TINYBIRD_DELETE_TOKEN
NEXT_PUBLIC_CRISP_WEBSITE_ID
DUB_API_KEY
NEXT_PUBLIC_DUB_REFER_DOMAIN
NEXT_PUBLIC_GTM_ID
NEXT_PUBLIC_CONVERSION_ANALYTICS_SCRIPT_URL
CONVERSION_ANALYTICS_SERVER_URL
CONVERSION_ANALYTICS_SERVER_SECRET
BRAINTRUST_API_KEY
GITHUB_MARKETING_TOKEN
```

## Human setup, later

1. Allow roughly 15 minutes to create a Railway project, connect this repository and select this branch after you have committed and pushed it. Add Railway Postgres and Redis, then add the private redis-http image service described above. Enable durable storage and backups appropriate to your Railway plan.
2. Allow 20 minutes to create three services from the same repository, using the Dockerfile in `railway.toml`. Set the web, worker and cron start commands as above in each service's dashboard. Create a public HTTPS domain for web and set private `INTERNAL_API_URL` to the web service's private address and port. Set the variables above, using private service references for database and Redis. Set `PORT=3000` on web if needed for the private address. Start web first and inspect migration and startup logs; then start worker and cron. Never run a database migration against an unintended database.
3. Allow 20 to 40 minutes for Google Cloud. In the Tidal Workspace project, enable Gmail API and Pub/Sub API, configure the OAuth consent screen as **Internal**, and create a Web application OAuth client. Set the authorised JavaScript origin to `{ORIGIN}`, replacing it everywhere with the exact public Railway HTTPS origin, with no trailing slash. Add both authorised redirect URIs: `{ORIGIN}/api/auth/callback/google` and `{ORIGIN}/api/google/linking/callback`. Add these scopes:
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.settings.basic`

   Set the client ID and secret in Railway. Optional Calendar and Drive permissions and callbacks are documented in [Google OAuth](docs/hosting/google-oauth.mdx).
4. Allow 15 minutes for Pub/Sub. Create a topic and grant `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher role on that topic. Create a push subscription with endpoint `{ORIGIN}/api/google/webhook?token={GOOGLE_PUBSUB_VERIFICATION_TOKEN}`, substituting the same generated token used in Railway. Set the full topic name and token in Railway. See [Google Pub/Sub setup](docs/hosting/google-pubsub.mdx). Treat the endpoint URL as a secret because it contains the token.
5. Allow 10 minutes to create an OpenRouter API key, set `LLM_API_KEY` and all five model variables above, and set a sensible provider spending limit. The suggested model is the inexpensive starting option documented in the app; change it if quality is insufficient.
6. After web is healthy and Google settings are in place, sign in as `james@tidalvc.com`. Confirm Gmail authorisation, worker connectivity, the Pub/Sub subscription and watch renewal in logs. Allow 10 to 15 minutes, excluding provider propagation.
7. Allow 20 minutes to create labels and rules, then run the split seed as below. Review the results and rules in the app before relying on them.

## James's split inbox

Create Gmail labels for Important, Calendar, News and Pitch first, or reuse the app's existing Calendar system rule and its Gmail label. Avoid confusing Gmail's built-in importance marker with a custom Important label: pick the label explicitly. In the assistant, create enabled label actions and review their behaviour using these starter instructions:

- **Important:** Label personal correspondence from founders, investors, LPs and portfolio contacts that needs James's attention or response. Use the message and relationship context; do not treat every message from a company domain as important.
- **News:** Label newsletters, publications, media digests and informational articles sent for reading, rather than personal requests.
- **Pitch:** Label unsolicited founder pitches and deal introductions proposing an investment or a meeting to discuss one. An existing portfolio discussion can be Important instead.
- **Calendar:** Reuse the Calendar system rule where available, or label invitations, scheduling changes and meeting notifications.

Rules can overlap. Inspect examples and priorities in the assistant, and adjust to suit; labels and rules normally affect future processed mail, so historical mail may need separate labelling. The GitHub and Notion senders mirror the prepared split library. Tidal Internal uses the exact `@tidalvc.com` sender domain. All remains available, and Gmail's built-in Other tab is the residual of configured splits, not a separate stored split. Existing splits such as Unread also affect Other; remove any unwanted splits in the UI.

Obtain the four actual Gmail label **IDs**, not their display names, from the Gmail API `users.labels.list` for the signed-in account, using an authorised Google API client or OAuth Playground. Treat access tokens as secrets. From a trusted local checkout with dependencies installed, provide the same application environment and a securely reachable database URL, then run from the repository root:

```sh
pnpm --filter inbox-zero-ai exec tsx scripts/seed-railway-splits.ts james@tidalvc.com IMPORTANT_LABEL_ID CALENDAR_LABEL_ID NEWS_LABEL_ID PITCH_LABEL_ID
```

Replace each ID with its actual value. The script targets the specified account and creates missing named splits; it reports duplicates without changing them and stops on the split limit. It does not create Gmail labels or AI rules. It does not delete existing splits, so review any existing definitions before rerunning. The production image does not include this source script; run it from the checkout, with the database accessed securely and without saving real credentials in the repository.
