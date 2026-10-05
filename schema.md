# Swarm log format

JSON input is an object with three nonempty arrays: `agents`, `rooms`, and `messages`. Unknown fields are ignored. Declare every sender, recipient, and room before referencing it.

```json
{
  "agents": [
    {"id": "planner", "name": "Planner"},
    {"id": "builder", "name": "Builder"}
  ],
  "rooms": [{"id": "work", "name": "work"}],
  "messages": [{
    "id": "message-001",
    "timestamp": "2026-01-01T09:05:00Z",
    "sender": "planner",
    "room": "work",
    "recipients": ["builder"],
    "text": "Please build the task list component."
  }]
}
```

| Field | Contract |
| --- | --- |
| Entity `id` | Nonempty string using letters, digits, `_`, `.`, `:`, or `-`. Agent and room IDs must be globally unique and disjoint. |
| Entity `name` | Nonempty display string. Room names are shown with a leading `#`. |
| Agent `speaker_type` | Optional `agent` (default) or `human`. Humans use a distinct color. |
| Message `id` | Unique, nonempty string, retained in inspector and search. |
| `timestamp` | ISO 8601 with seconds and explicit timezone: `2026-01-01T09:05:00Z`, `2026-01-01T20:05:00+11:00`, or fractional seconds. |
| `sender` | Declared agent ID. |
| `room` | Declared room ID, required even for a single recipient. Use a dedicated direct-message room if your harness has no channel for direct messages. |
| `recipients` | Required array of declared agent IDs; `[]` means a room post. Repeated IDs are deduplicated, preserving order. Explicit recipients come from your exporter, not text matching. |
| `text` | String, including empty strings. Displayed as text. |

The converter normalizes timestamps to UTC and sorts messages stably; tied timestamps retain input order. At least one message is required. Recipient IDs may include the sender if your log records self messages. Duplicate message IDs are rejected rather than merged.

For `.jsonl` input, each nonblank line is one message object in the same format. `--agents` and `--rooms` point to JSON files containing the corresponding entity arrays. Errors identify the message index (zero based), or JSONL line number (one based) when parsing fails.

## Browser output

The converter writes a JavaScript file assigning `window.SWARM_DATA`. Its internal message keys are `id`, `created_at` (UTC formatted as `YYYY-MM-DD HH:mm:ss.sss`), `agent_speaker_id`, `room_id`, `recipient_agent_ids`, `content`, `address_matches` (empty), and `speaker_type`. Entity arrays retain `id`, `name`, and `speaker_type`.

Use the converter to create browser output. Directly editing the output bypasses validation. Load it through the single data `<script>` in `index.html` before `viewer.js`. Do not load untrusted JavaScript files as data; import JSON/JSONL with the converter.
