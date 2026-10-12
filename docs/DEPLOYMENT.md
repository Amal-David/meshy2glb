# GitHub Pages deployment

**Live application:** https://amal-david.github.io/meshy2glb/

The repository already uses GitHub Pages' main-branch static publisher. No new hosting account, backend, custom domain or secret is required. The `.nojekyll` file preserves the static application and its relative module paths.

## Publishing

Merge tested changes into `main`. The existing **pages build and deployment** job publishes the repository root. The **Verify live GitHub Pages** workflow then retries bounded, credentialless GETs until eight application resources match that checkout byte-for-byte. This checks publication and CDN propagation; it is separate from the Chromium functional tests in **Conversion and paint verification**.

To inspect or restore the setting manually: repository **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root)**. Keep HTTPS enabled. Do not change this to the `docs` folder: the application entry point is root `index.html`.

The Chrome extension is optional and requires unpacked installation; publishing the website does not install an extension. Public Meshy URL resolution still depends on upstream browser access/CORS. GitHub Pages does not remove those restrictions.

## Repository About website

On the repository Code page, use the gear beside **About** and set **Website** to:

```text
https://amal-david.github.io/meshy2glb/
```

The equivalent authenticated GitHub CLI command is:

```sh
gh repo edit Amal-David/meshy2glb --homepage 'https://amal-david.github.io/meshy2glb/'
```

That is a repository-settings write, separate from editing the README. The README also contains a prominent live-app link so the deployment is discoverable without relying on the About field.
