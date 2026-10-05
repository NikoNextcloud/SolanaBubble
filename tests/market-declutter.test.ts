import assert from "node:assert/strict";
import test from "node:test";

import { declutterMarketNodes } from "../lib/market/declutter";

test("declutter separates overlapping planets while keeping their coordinate anchors", () => {
  const source = [
    { mint: "A", x: 300, y: 220, r: 42 },
    { mint: "B", x: 300, y: 220, r: 38 },
    { mint: "C", x: 306, y: 223, r: 34 },
  ];

  const result = declutterMarketNodes(source, {
    gap: 36,
    maxDisplacement: 150,
    iterations: 24,
    anchorStrength: .045,
  });

  for (const node of result) {
    const original = source.find((item) => item.mint === node.mint);
    assert.ok(original);
    assert.equal(node.anchorX, original.x);
    assert.equal(node.anchorY, original.y);
    assert.ok(node.displacement <= 150.001);
  }

  for (let i = 0; i < result.length; i += 1) {
    for (let j = i + 1; j < result.length; j += 1) {
      const a = result[i];
      const b = result[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(distance >= a.r + b.r + 24, `${a.mint}/${b.mint} should be visually separated`);
    }
  }
});

test("declutter is deterministic for the same coordinate cluster", () => {
  const source = [
    { mint: "MINT-1", x: 500, y: 300, r: 30 },
    { mint: "MINT-2", x: 500, y: 300, r: 30 },
  ];

  const first = declutterMarketNodes(source);
  const second = declutterMarketNodes(source);

  assert.deepEqual(first, second);
});
