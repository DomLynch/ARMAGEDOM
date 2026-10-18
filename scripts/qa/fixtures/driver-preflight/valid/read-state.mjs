export const readState=page=>page.evaluate(()=>({weapon:globalThis.__qa?.game?.player?.weapon,rifle:globalThis.__qa?.game?.rifle}));
