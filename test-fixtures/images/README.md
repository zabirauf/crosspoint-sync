# Synthetic crop fixture

`crop-asymmetric.png` is a locally generated 1200×800 RGBA test pattern of color/gradient bands and asymmetric crossing lines. It contains no third-party or private material. Its distinct landmarks make an off-center crop's source region easy to compare across window shapes.

For Android native testing, copy it to the emulator's Pictures directory, scan it into MediaStore, then select it through the app's Sleep Background photo-picker action. The picker produces an app-readable copy; an arbitrary external-file URI is not equivalent to this import path.
