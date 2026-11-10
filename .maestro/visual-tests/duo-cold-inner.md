# Duo cold inner-display launch

Run `.maestro/manual-flows/duo-cold-inner.yaml` with the physical hinge already
open, in inner wide and inner tall poses, in both light and dark appearance.
The flow terminates and launches the app without resizing the display first.
Pass `-e NATIVE_BAR_PLACEMENT=bottom` for inner tall; the default is `rail` for
inner wide. These expectations reflect the system's observed placement.

For `duo-cold-inner-library`, `duo-cold-inner-reader` and
`duo-cold-inner-settings`:

- Content fills the usable inner display; no blank right half or clipping at
  the outer-display width.
- The title and content remain readable, and controls stay inside the screen.
- Inner wide: Library, Reader and Settings occupy the system's right rail.
  Library's Add and Uploads occupy the upper rail. No bottom capsule appears.
- Inner tall: the system chooses bottom navigation. Add sits separately to its
  right and Uploads appears in the header. Other destinations hide these actions.
- The Library header's upper edge matches the current appearance.

Also cold-launch outer, and fold outer → inner → outer without terminating the
app. Confirm system placement and the current screen/draft survive each resize.
