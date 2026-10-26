---
name: blueprint-architecture
description: Draw a system architecture diagram in a technical-drawing blueprint style - services, databases, queues, caches and clients laid out automatically, with labelled request and event flows and moving data-flow dots - from a description or by reading a repository. Outputs an HTML page, an SVG and a PNG. Use when someone wants an architecture diagram, a system design drawing, a service map or a data-flow diagram.
---

# Blueprint Architecture Diagram

A system drawn like an engineering sheet: a gridded blueprint (or a light "whiteprint"), every component as a labelled shape by kind, arrows for requests and dashed arrows for events, dashed zones for groups, a legend and a title block. You (or the person) describe the system as `diagram.json`; a script lays it out with [dagre](https://github.com/dagrejs/dagre) (bundled, nothing to install) and draws:

- **`out/index.html`**: the diagram with a dot travelling along every connection and the event lines flowing. Opens from disk, scales to the window.
- **`out/diagram.svg`**: the same drawing without the motion, for docs, wikis and slides.
- **`out/diagram.png`**: a still at twice the size, from headless Chrome, for anywhere images go.

## What you need

- Node.js 18 or newer. Building needs nothing else.
- Chrome, Chromium or Edge for the PNG. The script finds it in the usual places; set `CHROME_PATH` if it doesn't.
- Internet access when the diagram is opened or exported, for the JetBrains Mono font from Google Fonts (it falls back to the system monospace font without it).

This skill's folder is `<skill>` below: the folder this SKILL.md is in.

## Steps

### 1. Find the system

When the person describes the system, use their words. When you're asked to read a repository, gather evidence before drawing anything, and only draw what you found:

1. **Deployables**: `docker-compose*.yml` services, Kubernetes `Deployment`s, Helm charts, `Procfile`s, serverless configs (`serverless.yml`, `vercel.json`, `wrangler.toml`), Terraform resources, and apps in a monorepo (`apps/`, `services/`, `packages/*` with a start script).
2. **Data stores and brokers**: images and managed resources (postgres, mysql, mongo, redis, kafka, rabbitmq, sqs, s3), and connection settings like `DATABASE_URL`, `REDIS_URL`, `KAFKA_BROKERS`, bucket names.
3. **Connections**: HTTP clients and base URLs pointing at other services, gRPC stubs, queue producers and consumers (topic and queue names), `depends_on`, outgoing calls to third parties (Stripe, an LLM API, email providers).
4. **Callers**: web and mobile apps, CLIs, cron jobs, webhooks.

Keep 5 to 20 nodes. Merge replicas and small helpers into the service they belong to; split into several sheets (`"sheet": "02 / 03"`) rather than cramming. Note anything you inferred rather than found, and tell the person.

### 2. Write `diagram.json`

```json
{
  "title": "Order service · v2",
  "subtitle": "System architecture · from /services and docker-compose.yml · 21 Oct 2026",
  "sheet": "01 / 01",
  "direction": "LR",
  "theme": "blueprint",
  "groups": [{ "id": "core", "label": "Order platform" }],
  "nodes": [
    {
      "id": "gateway",
      "label": "API gateway",
      "sub": "auth · rate limit",
      "kind": "service"
    },
    {
      "id": "orders",
      "label": "Order service",
      "sub": "v2 · Go · 6 pods",
      "kind": "service",
      "group": "core",
      "focus": true
    },
    {
      "id": "db",
      "label": "Postgres",
      "sub": "orders · stock",
      "kind": "database"
    },
    {
      "id": "bus",
      "label": "Event bus",
      "sub": "Kafka · 3 topics",
      "kind": "queue"
    }
  ],
  "edges": [
    { "from": "gateway", "to": "orders", "label": "POST /orders" },
    { "from": "orders", "to": "db", "label": "SQL" },
    { "from": "orders", "to": "bus", "label": "order.created", "async": true }
  ]
}
```

| Field           | What it is                                                                                                                  | Limit |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | ----- |
| `title`         | Name of the system or view (required); also goes in the title block                                                         | 60    |
| `subtitle`      | What the drawing shows and where it came from: sources and date                                                             | 100   |
| `sheet`         | Sheet number in the title block, e.g. `"02 / 03"` (default `01 / 01`)                                                       | –     |
| `direction`     | `LR` left to right (default, suits request flows) or `TB` top to bottom (pipelines)                                         | –     |
| `theme`         | `blueprint` (dark blue, default), `whiteprint` (light), or colours: `{ "paper", "line", "accent", "dim" }` as hex           | –     |
| `groups`        | Zones drawn around their nodes: `{ "id", "label" }`                                                                         | –     |
| `nodes[].id`    | Letters, digits, `-` or `_`; edges refer to it (required)                                                                   | –     |
| `nodes[].label` | Name on the node (required)                                                                                                 | 28    |
| `nodes[].sub`   | Second line: language, runtime, scale, what it holds                                                                        | 36    |
| `nodes[].kind`  | Shape: `service` (default), `client`, `database`, `queue`, `cache`, `storage`, `function`, `external` (third party, dashed) | –     |
| `nodes[].group` | A group id                                                                                                                  | –     |
| `nodes[].focus` | `true` draws it in the accent colour: the thing the diagram is about                                                        | –     |
| `edges[]`       | `{ "from", "to" }` node ids, in the direction data or control flows                                                         | –     |
| `edges[].label` | Protocol, endpoint, topic or verb: `HTTPS`, `POST /orders`, `order.created`                                                 | 24    |
| `edges[].async` | `true` for events, queues and anything fire-and-forget (dashed, flowing)                                                    | –     |

Tips:

- Label edges with what actually travels: an endpoint, a topic, a table, a verb. Leave a label off only when it adds nothing.
- Point edges the way requests go (caller to callee) and events go (producer to queue to consumer).
- Mark one node `focus` at most.
- Up to 40 nodes are allowed, but past about 20 the drawing gets hard to read.

### 3. Build and check

```bash
node <skill>/scripts/build.mjs diagram.json out
```

It checks the file and lists every problem at once (an edge to a node that doesn't exist, a label over its limit), then writes `out/index.html` and `out/diagram.svg`. Open `out/index.html` and check:

- every node from step 1 is there, and nothing you didn't find,
- edges point the right way and their labels are readable,
- groups contain the right nodes.

If the layout is tangled, try the other `direction`, or reorder `nodes` and `edges`: the layout starts from their order.

### 4. Export the PNG

```bash
node <skill>/scripts/export-png.mjs out/index.html
```

It writes `out/diagram.png` at twice the drawing's size; add `--scale=1` for the actual size.

### 5. Hand it off

Give the person `out/index.html` (animated), `out/diagram.svg` and `out/diagram.png`, plus `diagram.json` so the drawing can be updated when the system changes: edit the JSON and run steps 3 and 4 again. If the diagram belongs in the repository, a `docs/architecture/` folder with the JSON and the SVG is a good home; the SVG renders in GitHub and most wikis.

## Troubleshooting

- **`build: fix diagram.json first`**: each line names the node or edge and what to change.
- **The PNG step says no Chrome was found**: set `CHROME_PATH`, or open `out/index.html` and screenshot it.
- **Text is in a different monospace font**: the page couldn't reach Google Fonts. Install JetBrains Mono (free) to match offline.
- **Edges cross a lot**: switch `direction`, move the node that's tangled earlier or later in `nodes`, or split the system into two sheets.

## Files

- `scripts/build.mjs`: checks `diagram.json`, lays it out and draws the HTML and SVG. No dependencies to install.
- `scripts/export-png.mjs`: saves the PNG with headless Chrome.
- `vendor/dagre.esm.js`: the dagre graph layout library (MIT), bundled so nothing needs installing; its licence is `vendor/LICENSE-dagre.txt`.
- `examples/order-service/` (blueprint, left to right) and `examples/rag-pipeline/` (whiteprint, top to bottom): finished `diagram.json` files. The previews on Lookbk are drawn from these.
- `NOTICE.md`: third-party software and fonts this skill uses.
