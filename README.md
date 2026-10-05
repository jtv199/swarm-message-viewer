# Swarm Message Viewer

**[Try the live demo](https://jtv199.github.io/swarm-message-viewer/)** — runs in your browser with synthetic messages.

Explore communication in your own agent swarm as an interactive directed graph. Replay occupied time intervals or individual messages, search text and IDs, filter a UTC date range, build the graph over time, and click an agent, room, or connection to inspect its messages.

The bundled example is entirely synthetic: three agents planning, building, and reviewing a small task board. This repository contains no real conversation transcripts or research datasets.

## Quick start

Requires Python 3.10+ and a modern browser. There are no Python packages to install. The browser needs internet access to load the pinned Force Graph library from jsDelivr.

```sh
git clone https://github.com/jtv199/swarm-message-viewer.git
cd swarm-message-viewer
python -m http.server 8000 --bind 127.0.0.1
```

Open [http://localhost:8000](http://localhost:8000). On systems where Python is named `python3`, use that command instead. To restore the synthetic fixture after importing your data:

```sh
python scripts/convert.py examples/swarm.json
```

## View your own swarm

Export your harness's communication events to the JSON format in [schema.md](schema.md). Each message needs a stable ID, timestamp with timezone, sender, original room, explicit recipient IDs, and text. Declare the agents and rooms in arrays. A small working example is [examples/swarm.json](examples/swarm.json).

Place private inputs under `inputs/`, then convert and reload the browser:

```sh
python scripts/convert.py inputs/my-swarm.json --output generated/my-swarm.js
```

Change the data script in `index.html` from `src="data.js"` to `src="generated/my-swarm.js"`. Alternatively, write to `data.js` and reload; because `data.js` is tracked, take care not to commit your replacement. The converter validates IDs, references, message uniqueness, and timestamps, normalizes timestamps to UTC, sorts chronologically, and removes duplicate recipients. Invalid input produces a readable error and leaves an existing output file intact.

For one message per line in JSONL, supply entity arrays separately:

```sh
python scripts/convert.py inputs/messages.jsonl \
  --agents inputs/agents.json --rooms inputs/rooms.json \
  --output generated/my-swarm.js
```

The viewer reads static files locally; it does not submit messages to a remote API. The local HTTP server serves files in this directory. Keep private exports in ignored `inputs/` and `generated/` directories, and review files before publishing a modified repository or website.

## Reading the graph

- One recipient: sender → recipient, bypassing the room.
- Multiple recipients: sender → room → each supplied recipient.
- No recipients: sender → room.
- Each directed pair is aggregated across messages. A single message can contribute several route legs.
- Agent dot size reflects unique messages addressed to that agent in the visible scope. Rooms are squares. Recognized model names use family colors; other agents use gray.
- With buildup off, faint routes show the filtered range and bright routes show the current interval. With buildup on, the graph contains only messages through the selected interval.
- Empty time bins are skipped. Playback advances one occupied bin per step, rather than simulating elapsed wall time.
- Node and connection inspectors cover the filtered range or visible buildup. Selecting an inspector message keeps the timeline in place.

Recipients describe routing recorded by your exporter. The graph does not establish that a message was read, infer room readership, or infer recipients from names in text. If your harness only logs public room posts, export an empty recipients array.

## Development and limits

```sh
python -m unittest discover -s tests -v
node --check viewer.js
```

Tests cover offset conversion, ordering, duplicate recipients, invalid references and timestamps, duplicate IDs, empty inputs, and JSONL line errors. Node is optional and only used for the JavaScript syntax check.

This is a static viewer and exporter adapter, not a swarm execution framework. It does not launch agents, connect to your harness, ingest live streams, or compute semantic embeddings. Adapt your harness's logging hook to emit the documented records. Large room or agent counts can slow graph layout; large intervals and inspector collections can create long message lists. There is no hard scale guarantee.

Project code is MIT licensed. See [LICENSE](LICENSE) and [THIRD_PARTY.md](THIRD_PARTY.md) for the Force Graph dependency and attribution.
