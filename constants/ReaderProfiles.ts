/** Portrait dimensions. CrossPoint 2.0.0 pins Free-Ink/freeink-sdk at
 * 5e94fe7480f019c89fbf691aef87523eb1b46704; BoardConfig.h XTEINK_X3 is
 * 792x528 in the panel's native landscape orientation (X4 is 800x480).
 */
export interface ReaderProfile {
  readonly model: 'X3' | 'X4';
  readonly width: number;
  readonly height: number;
}

const X3: ReaderProfile = Object.freeze({ model: 'X3', width: 528, height: 792 });
const X4: ReaderProfile = Object.freeze({ model: 'X4', width: 480, height: 800 });

export function getReaderProfile(model?: string): ReaderProfile | null {
  // Preserve the original X4 output for older firmware without a model field.
  if (!model?.trim()) return X4;
  switch (model.trim().toUpperCase()) {
    case 'X3': return X3;
    case 'X4': return X4;
    default: return null;
  }
}

export function getReaderName(model: string | undefined, hostname: string): string {
  if (!model?.trim()) return hostname;
  const profile = getReaderProfile(model);
  return profile ? `XTEink ${profile.model}` : `CrossPoint (${model.trim()})`;
}
