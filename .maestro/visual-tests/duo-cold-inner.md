# Duo cold inner-display launch

Run `scripts/test-duo-cold-launch.py` with an active-display-aware `idb` and an
explicit disposable Duo UDID. The script prepares each physical pose before
terminating/launching the app, then checks all three tabs in both appearances.
It includes outer, inner wide and inner tall. Use a fresh output directory.

```sh
python3 scripts/test-duo-cold-launch.py --udid "$DUO_UDID" --idb "$IDB_BINARY" \
  --output test-screenshots/duo-cold-launch
node scripts/check-native-surfaces.cjs test-screenshots/duo-cold-launch
```

For the queue regression, queue a legal book while disconnected on the disposable
simulator and pass `--require-queue`. The script checks the entire queue hit area
against the three navigation targets and Add, in both rail and bottom placement.
The queue must sit above bottom navigation and remain tappable after resizing.

Maestro's current iOS driver captures the inactive outer display when started
on inner wide, returning a black image and incorrect coordinates. Use the
active-display driver for this test; regular iPhone Maestro flows remain valid.

For the generated Library, Reader and Settings screenshots:

- Content fills the usable inner display; no blank right half or clipping at
  the outer-display width.
- The title and content remain readable, and controls stay inside the screen.
- Inner wide: Library, Reader and Settings occupy the system's right rail.
  Library's Add and Uploads occupy the upper rail. No bottom capsule appears.
- Inner tall: the system chooses bottom navigation. Add sits separately to its
  right and Uploads appears in the header. Other destinations hide these actions.
- The Library header's upper edge matches the current appearance.
- Reader uses the same body surface as Library and Settings, with readable text,
  connection instructions, field boundaries and buttons in both appearances.

Also cold-launch outer, and fold outer → inner → outer without terminating the
app. Confirm system placement and the current screen/draft survive each resize.
