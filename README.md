# Title Calibration Office

A tongue-in-cheek career path generator for software engineers. Enter a name and get a personally calibrated career: the titles you've held, the one you hold now, and the increasingly grand titles waiting for you.

Ends the "what's the actual difference between Senior and Staff?" conversation by making the answer meaningless in over 14 million ways.

- **Deterministic:** the same name always produces the same career (case and spacing are ignored), so links are shareable: `?name=Ada%20Lovelace`
- **Appeals:** "Request a reorg" reshuffles the path (`&reorg=1`, `&reorg=2`, …)
- **No build step:** plain HTML, CSS, and JavaScript

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

Push to GitHub, then go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, and select `main` / `(root)`.

## Adding titles

All vocabulary lives in `js/titles.js`. Prefixes and roles have a level (`l`) from 0 (just got a laptop) to 9 (has become the org chart). Careers climb through those levels. Modifiers, domains, and the "what changed" lines can be added freely.
