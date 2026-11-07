type Size = { width: number; height: number };

const DEFAULT_CROP_PADDING = 16;

export function fitCropFrame(canvas: Size, aspectRatio: number, padding = DEFAULT_CROP_PADDING): Size {
  const width = Math.max(1, canvas.width - padding * 2);
  const height = Math.max(1, canvas.height - padding * 2);
  const frameWidth = Math.min(width, height * aspectRatio);
  return { width: frameWidth, height: frameWidth / aspectRatio };
}

// Offset is stored in fractions of the frame, so resizing preserves the crop.
export function getSourceCrop(image: Size, frame: Size, zoom: number, offset: { x: number; y: number }) {
  const displayScale = Math.max(frame.width / image.width, frame.height / image.height) * zoom;
  const width = Math.min(image.width, frame.width / displayScale);
  const height = Math.min(image.height, frame.height / displayScale);
  return {
    originX: Math.max(0, Math.min(image.width - width, image.width / 2 - offset.x * frame.width / displayScale - width / 2)),
    originY: Math.max(0, Math.min(image.height - height, image.height / 2 - offset.y * frame.height / displayScale - height / 2)),
    width,
    height,
  };
}
