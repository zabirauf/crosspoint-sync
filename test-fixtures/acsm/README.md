# ACSM fixture

`Gettysburg-Loan.acsm` is a synthetic Adobe ADEPT fulfillment token. It has
the element structure of a library-loan `.acsm` (root `fulfillmentToken`,
`operatorURL`, `resourceItemInfo` metadata, `hmac`) with placeholder UUIDs, an
`example.invalid` operator and an invalid signature. It cannot be fulfilled
by a real content server.

`npm run test:acsm` uploads it to the mock reader (`--protected-content`),
whose simulated Protected Content plugin writes the public-domain
`Gettysburg-Address.epub` fixture beside it. See
`docs/analysis/acsm-protected-content-2026-11-21.md`.
