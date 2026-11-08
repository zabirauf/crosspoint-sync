# Clipper regression fixture

`substack-images.html` is a synthetic article with the `picture` / `img`
structure and JSON `data-attrs` metadata used by Substack. Its text and image
addresses are invented; no article content or third-party images are stored.

The old committed Android extractor promotes the compact JSON metadata into an
image URL. This fixture catches that regression; the captured public article
also reproduced it in the original Safari pipeline. Both current pipelines
retain the actual source URLs after the Defuddle 0.19.6 update.

Run `npm run test:clipper`. The test uses Chromium with external requests
blocked, then packages local PNG fixture bytes into an EPUB and checks the
chapter's image references and embedded bytes. No device or internet access
is needed once the dependencies and Puppeteer browser are installed.
