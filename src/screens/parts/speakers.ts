/** Speaker name -> colour index, in order of first appearance. */
export function speakerIndex(segments: { speaker?: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of segments) if (s.speaker && !map.has(s.speaker)) map.set(s.speaker, map.size);
  return map;
}
