# Offline queue above native bottom navigation

Run `.maestro/manual-flows/native-queue-clearance.yaml` on a disposable regular
iPhone with one legal EPUB queued while disconnected. Keep its saved reader
address offline so the fixture remains queued. This standalone flow preserves
permissions and opens/closes the queue in both appearances.

- The entire queue row is above the native navigation capsule and the separate
  Add button. Its label and chevron remain visible, with a gap below the row.
- Tapping the row opens Uploads; closing it restores the queue and navigation.
- Reader, Library and Settings use the same body background in each appearance.
- Reader's status, instructions, address label, field boundary and button text
  stay readable. The field's focus border remains visible.

The generated `native-surface-*-queue-*.png` captures also run through
`scripts/check-native-surfaces.cjs` to compare body pixels with the actual theme.
For Duo, use `scripts/test-duo-cold-launch.py --require-queue`, which checks
measured queue/control rectangles on the active display across all three poses.
