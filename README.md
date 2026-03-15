# <img src="icons/speedometer.png" width="40"/> FeedMonitor — Browser Extension Blueprint for Social Media Feed Experiments

A research-ready browser extension for **intercepting, logging, and modifying social media feeds** in real time — without platform cooperation. Designed as a blueprint for researchers running field experiments on X (Twitter). Can be adapted to other platforms.

**Compatibility:** Chrome · Edge · Firefox
**Full methodology:** [feedkit.org/webextensions](https://feedkit.org/webextensions/)

---

## What this is

Platforms like X, Facebook, and Instagram have progressively restricted API access, making large-scale feed experiments nearly impossible without internal collaboration. This extension solves that by running entirely in the participant's browser:

- It **intercepts raw feed JSON** before X's frontend renders it
- Forwards it to **your server** for logging, reranking, filtering, or any other transformation
- Returns the modified response to the page — which renders it as if nothing happened

The approach is naturalistic: participants use their real accounts, real social graphs, and real browsers. The extension operates transparently in the background.

---

## Architecture

The extension is split across two JavaScript contexts, which is a key constraint of browser extension design:

```
┌─────────────────────────────────────────────────────────────┐
│  PAGE CONTEXT (injected.js)                                  │
│  Overrides XMLHttpRequest and fetch.                         │
│  Intercepts feed API responses for subscribed endpoints.     │
│  Fires CustomEvent "ProcessResponse" when a feed arrives.   │
└────────────────────┬────────────────────────────────────────┘
                     │ CustomEvent (window)
┌────────────────────▼────────────────────────────────────────┐
│  CONTENT SCRIPT CONTEXT (logic.js)                           │
│  Receives "ProcessResponse".                                 │
│  POSTs raw feed JSON to your server.                         │
│  Fires CustomEvent "CustomFeedReady" with modified response. │
└────────────────────┬────────────────────────────────────────┘
                     │ CustomEvent (window)
┌────────────────────▼────────────────────────────────────────┐
│  PAGE CONTEXT (injected.js)                                  │
│  Receives "CustomFeedReady".                                 │
│  Replaces XHR/fetch response body with server's version.    │
│  X's frontend renders the modified feed.                     │
└─────────────────────────────────────────────────────────────┘
```

**Why two contexts?** Content scripts run in an isolated sandbox and cannot override the page's `XMLHttpRequest` or `fetch`. `injected.js` is loaded as a `<script>` tag by `launcher.js`, placing it in the page's own JavaScript environment where it can intercept network calls.

### Supported interventions

Working at the network layer — before the frontend touches the data — enables four classes of modifications:

| Type | Description |
|---|---|
| **Rerank** | Reorder posts by a custom objective (toxicity, sentiment, engagement, topic) |
| **Remove** | Exclude specific posts from the rendered feed |
| **Edit** | Modify text, metrics, or attachments before display |
| **Add** | Inject external posts into the feed |

> **Note on up-ranking:** The extension only sees posts the platform has already selected for the participant. Up-ranking items not in the original batch requires pre-fetching additional content via simulated scroll requests.

---

## Repository structure

```
BrowserExtension/
├── manifest.json        # Extension manifest (Manifest V3)
├── config.js            # Global settings: server URL, heartbeat interval
├── launcher.js          # Entry point: assigns user ID, injects injected.js
├── injected.js          # Network interception (XHR + fetch), URL change detection
├── logic.js             # Bridge: sends feed to server, dispatches modified response
├── events.js            # DOM-level behavioural tracking (scroll, visibility, clicks)
└── libs/
    ├── client.js        # HTTP client for all server communication
    ├── utils.js         # Shared helpers (UUID, viewport check, set equality)
    ├── jquery.min.js
    └── timeme.min.js    # Idle / active time tracking
```

### Script loading order (from `manifest.json`)

```
config.js → jquery.min.js → client.js → timeme.min.js → utils.js → events.js → logic.js → launcher.js
```

`injected.js` is loaded separately into the page context by `launcher.js` at runtime.

---

## Quick start

### 1. Load the extension

1. Clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `BrowserExtension/` folder

### 2. Set up the backend

The extension POSTs feed data to your server and expects a JSON response. A minimal Python/Flask backend is included:

```bash
pip install -r requirements.txt
python main.py
```

For production, use a WSGI server (e.g., Gunicorn). In dev mode the extension automatically points to `http://localhost:5000`.

**Required endpoints:**

| Endpoint | Purpose |
|---|---|
| `POST /get_feed` | Receives raw feed JSON, returns modified feed |
| `POST /event` | Receives behavioural events (clicks, visibility, etc.) |

`/get_feed` must return:
```json
{ "feed": { "response": "<modified feed JSON string>" } }
```

### 3. Configure for your study

**`config.js`** — Set your server URL:
```js
server_url: "https://your-study-server.com"
```

**`injected.js`** — Set which API endpoints to intercept:
```js
window.SUBSCRIBED = ["HomeTimeline", "HomeLatestTimeline"];
```
`HomeTimeline` is the algorithmic feed; `HomeLatestTimeline` is the chronological feed.

**`launcher.js`** — Set your condition assignment logic:
```js
Globals["isEnabled"] = true;  // Replace with treatment/control assignment
```

---

## Behavioural events logged

`events.js` logs participant behaviour to your `/event` endpoint. All events include `user_id`, `tab_id`, `url`, and `extension_version`.

| Event | Trigger |
|---|---|
| `RenderedTweets` | New tweets appear in the DOM |
| `TweetVisible` | A tweet enters the viewport |
| `TweetVisible1Sec` | A tweet is still visible after 1 second |
| `TweetVisible3Sec` | A tweet is still visible after 3 seconds |
| `LinkClick` | Participant clicks a link inside a tweet |
| `FavoriteTweet` | Participant likes a post |
| `CreateRetweet` | Participant retweets a post |
| `CreateTweet` | Participant posts a new tweet |
| `Alive` | Heartbeat (configurable interval, default 10 s) |
| `UserLeaveTab` | Participant switches away from the tab |
| `UserReturnOnTab` | Participant returns to the tab |
| `PageUnload` | Page closed; includes total active time |
| `UrlChange` | In-app navigation (SPA route change) |

---

## Design notes for researchers

### Latency
The extension adds one network round-trip to your server on every feed load. The total delay depends on your server's processing time (a simple passthrough adds only the round-trip; a heavy reranking model adds more). 

### Desktop only
Mobile apps use certificate pinning and have no extension runtime, so this approach is desktop-only. Address this in your study design: instruct participants to use a desktop browser, log device type, and compare activity patterns to detect mobile leakage.

### Platform API changes
X's GraphQL endpoint names and response schemas change without notice. Monitor your intercept logs to detect breakage during long deployments.

### Conflict detection
`injected.js` checks at startup whether `XMLHttpRequest` or `fetch` have already been patched by another extension (e.g., an ad blocker or another research tool) and alerts the participant if so. The `window.SUBSCRIBED` guard prevents double-injection if the script is accidentally loaded twice.

### Condition assignment
By default, every participant gets a random UUID on first install. For randomised controlled trials, replace the `isEnabled` logic in `launcher.js` with a server-side or hash-based assignment. See §5.3 of the methods paper for a discussion of participant-ID strategies.

---

## Known limitations

- **Inventory constraint:** The extension can only rerank posts the platform has already selected. It cannot surface content the platform chose not to show.
- **Algorithmic feedback:** Down-ranking reduces engagement signals sent back to the platform, which may cause it to further suppress that content in future sessions — a potential confounder.
- **No mobile coverage:** See above.
- **Platform instability:** Long-running studies require monitoring for API schema changes.

---

## Citation

If you use this code, please cite:

**Methods paper:**
```bibtex
@article{10.1145/3800557,
author = {Piccardi, Tiziano and Saveski, Martin and Jia, Chenyan and Hancock, Jeffrey T. and Tsai, Jeanne and Bernstein, Michael},
title = {Reranking Social Media Feeds: A Practical Guide for Field Experiments},
year = {2026},
publisher = {Association for Computing Machinery},
address = {New York, NY, USA},
doi = {10.1145/3800557},
journal = {Trans. Soc. Comput.}
}
```

**Field study (Science, 2025):**
```bibtex
@article{doi:10.1126/science.adu5584,
  author={Tiziano Piccardi and Martin Saveski and Chenyan Jia and Jeffrey Hancock and Jeanne L. Tsai and Michael S. Bernstein},
  title={Reranking partisan animosity in algorithmic social media feeds alters affective polarization},
  journal={Science},
  year={2025},
  doi={10.1126/science.adu5584}
}
```

---

## Further reading

- Full methodology and design guidance: [feedkit.org/webextensions](https://feedkit.org/webextensions/)
- Method paper: [doi.org/10.1145/3800557](https://doi.org/10.1145/3800557)
- Science paper: [science.org/doi/10.1126/science.adu5584](https://www.science.org/doi/10.1126/science.adu5584)


_NOTE: Repository summary generated by Claude based on the original paper_