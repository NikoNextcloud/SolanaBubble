import { test } from "node:test";
import assert from "node:assert/strict";

import { positionQuickActions } from "../lib/market/quick-actions";
import { fomoTokenUrl, gmgnTokenUrl } from "../lib/token-links";

const mint = "DNSnAA99jrVUCg4GvL6LEVfFHBnGpnWA2k3CkRvZpump";

test("token quick actions preserve the selected mint", () => {
  assert.equal(fomoTokenUrl(mint), `https://fomo.family/coin?address=${mint}&chainId=1399811149`);
  assert.equal(gmgnTokenUrl(mint), `https://gmgn.ai/sol/token/${mint}`);
});

test("quick actions stay inside every map edge after pan and zoom", () => {
  const viewportWidth = 390;
  const viewportHeight = 560;
  const cases = [
    { nodeX: -100, nodeY: 220, viewX: 0, viewY: 0, scale: 1 },
    { nodeX: 900, nodeY: 220, viewX: 0, viewY: 0, scale: 1 },
    { nodeX: 180, nodeY: -100, viewX: -80, viewY: -120, scale: 2.4 },
    { nodeX: 180, nodeY: 900, viewX: 40, viewY: 80, scale: 0.6 },
  ];

  for (const input of cases) {
    const result = positionQuickActions({
      ...input,
      nodeRadius: 45,
      viewportWidth,
      viewportHeight,
      preferredWidth: 176,
      panelHeight: 52,
    });
    assert.ok(result.left >= 8);
    assert.ok(result.left + result.width <= viewportWidth - 8);
    assert.ok(result.top >= 8);
    assert.ok(result.top + 52 <= viewportHeight - 8);
  }
});
