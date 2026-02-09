export interface ClipImage {
  originalUrl: string;
  localPath: string; // relative path within App Group: shared-clips/<uuid>/<filename>
  mimeType: string;
}

export interface ClipManifest {
  id: string;
  type: 'clip';
  title: string;
  author: string;
  sourceUrl: string;
  htmlPath: string; // relative path: shared-clips/<uuid>.html
  images: ClipImage[];
  clippedAt: number;
}
