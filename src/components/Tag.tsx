import type { CSSProperties, ReactNode } from 'react';

function hue(text: string): number {
  let h = 0;
  for (const ch of text.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function Tag({ name, children }: { name: string; children?: ReactNode }) {
  return (
    <span className="tag" style={{ '--h': hue(name) } as CSSProperties}>
      {name}
      {children}
    </span>
  );
}
