# TrendPhoto Generator — Bot specification

**Archetype:** custom

**Voice:** warm and encouraging — write every user-facing message, button label, error, and empty state in this voice.

Telegram bot that generates single trend JPEG photos based on user-provided keywords and style filters, with order history and owner notifications for new requests/errors.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram users seeking quick free photo generation
- Casual content creators

## Success criteria

- User receives final JPEG within 5 minutes
- History retains 90 days of user photos
- Owner notified of every new order and error

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Show welcome message and instructions
- **Создать новое фото** (button, actor: user, callback: new_request:start) — Initiate photo generation flow
  - inputs: comma-separated keywords, style selection
  - outputs: JPEG file, history entry
- **Мои фото** (button, actor: user, callback: history:view) — Show user's photo history with download/delete options

## Flows

### photo_generation
_Trigger:_ new_request:start

1. Request keywords via ForceReply
2. Show style filter buttons
3. Generate and deliver JPEG
4. Save to history

_Data touched:_ Request, Photo

### history_management
_Trigger:_ history:view

1. Load user's 90-day history
2. Display thumbnails with actions
3. Handle download/delete requests

_Data touched:_ Photo

### error_notification
_Trigger:_ generation_error

1. Log error details
2. Send owner alert with order ID

_Data touched:_ Request

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Where order notifications and errors are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **User** _(retention: persistent)_ — Telegram account with usage limits and history
  - fields: user_id, telegram_chat_id, request_count
- **Request** _(retention: session)_ — Active photo generation request
  - fields: request_id, user_id, tags, style, status, timestamp
- **Photo** _(retention: persistent)_ — Generated JPEG and metadata
  - fields: photo_id, user_id, file_url, tags, style, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging and file delivery
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Receive new order notifications
- Receive error alerts with order IDs

## Notifications

- New order alert with request ID
- Error alert with request ID and summary

## Permissions & privacy

- Store photos for 90 days
- Require explicit user consent for history retention
- Limit to 5 requests/day per user

## Edge cases

- Invalid keyword formatting
- Style selection timeout
- Image generation API failures

## Required tests

- End-to-end photo generation flow from keywords to download
- History persistence across sessions
- Owner notification reliability

## Assumptions

- Default 5 style filters provided
- 90-day retention policy applied
- 5 requests/day rate limit
