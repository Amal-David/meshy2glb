# meshy2glb

Local browser viewer for `.meshy` files. Drop one in, get a `.glb` out.

Pure JS — no WASM bundled, no server roundtrip. The whole decoder is
~70 lines using the browser's built-in WebCrypto API. Deploys as
static HTML to GitHub Pages or any static host.

## Run locally

```bash
git clone https://github.com/Amal-David/meshy2glb
cd meshy2glb
./start.sh
```

Open the URL it prints, drag a `.meshy` file onto the page.

## Deploy on GitHub Pages

It's just static HTML/JS — push to a repo, turn on Pages from the
repository settings (Source: `main` branch, root). No build step.

Implementation notes are in [NOTES.md](./NOTES.md).

## Disclaimer

Not affiliated with [meshy.ai](https://meshy.ai). Runs locally;
nothing is uploaded.

## License

[MIT](./LICENSE)
