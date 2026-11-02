# Westminster backdrop phone copy (lossy WebP, quality 85)

`Web/public/world/westminster/backdrop-phone.webp` is `backdrop.webp` (lossless, 2,097,278 bytes) re-encoded with Pillow, WebP quality 85, method 6. Same 1672x941 pixels. The original stays in the repo untouched.

- idle / fight, before (lossless) and after (q85): the 375x812 fight camera, same frame, same game code; only the backdrop texture is swapped in the page.
- `zoom-3x-lossless-q90-q85-q80.png`: a 3x crop at the fight camera for quality choice (left to right: lossless, q90, q85, q80).

Measured against the lossless pixels: whole image max 52, mean 2.71, PSNR 36.7 dB, 3.4% of pixels differ by more than 8. In the rendered phone frames (canvas 562x1218): idle max 32, mean 2.0, 3.2% over 8; mid-fight max 36, mean 2.2, 5.0% over 8.
