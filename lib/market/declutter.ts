export type DeclutterNode = {
  mint: string;
  x: number;
  y: number;
  r: number;
};

export type DeclutteredNode<T extends DeclutterNode> = T & {
  anchorX: number;
  anchorY: number;
  displacement: number;
};

function stableAngle(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967295) * Math.PI * 2;
}

export function declutterMarketNodes<T extends DeclutterNode>(
  input: T[],
  options?: {
    gap?: number;
    maxDisplacement?: number;
    iterations?: number;
    anchorStrength?: number;
  },
): DeclutteredNode<T>[] {
  const gap = Math.max(0, options?.gap ?? 34);
  const maxDisplacement = Math.max(0, options?.maxDisplacement ?? 150);
  const iterations = Math.max(1, Math.round(options?.iterations ?? 18));
  const anchorStrength = Math.max(0, Math.min(1, options?.anchorStrength ?? 0.055));

  const nodes = input
    .map((node) => ({
      ...node,
      anchorX: node.x,
      anchorY: node.y,
      displacement: 0,
    }))
    .sort((a, b) => a.mint.localeCompare(b.mint));

  const pullToAnchor = (node: DeclutteredNode<T>) => {
    node.x += (node.anchorX - node.x) * anchorStrength;
    node.y += (node.anchorY - node.y) * anchorStrength;
  };

  const clampDisplacement = (node: DeclutteredNode<T>) => {
    const dx = node.x - node.anchorX;
    const dy = node.y - node.anchorY;
    const distance = Math.hypot(dx, dy);
    if (distance > maxDisplacement && distance > 0) {
      const ratio = maxDisplacement / distance;
      node.x = node.anchorX + dx * ratio;
      node.y = node.anchorY + dy * ratio;
    }
  };

  for (let pass = 0; pass < iterations; pass += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const minimum = a.r + b.r + gap;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);

        if (distance >= minimum) continue;

        if (distance < 0.001) {
          const angle = stableAngle(`${a.mint}:${b.mint}`);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }

        const overlap = minimum - distance;
        const ux = dx / distance;
        const uy = dy / distance;
        const shift = overlap * 0.52;

        a.x -= ux * shift;
        a.y -= uy * shift;
        b.x += ux * shift;
        b.y += uy * shift;
      }
    }

    for (const node of nodes) {
      pullToAnchor(node);
      clampDisplacement(node);
    }
  }

  for (const node of nodes) {
    node.displacement = Math.hypot(node.x - node.anchorX, node.y - node.anchorY);
  }

  return nodes;
}
