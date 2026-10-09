from pathlib import Path

p=Path('components/MarketWaveMap.module.css')
lines=p.read_text().splitlines()
control=[line for line in lines if line.startswith(':global(.wave-motion-control')]
assert len(control)==2, 'expected two global motion control rules'
kept=[line for line in lines if not line.startswith(':global(.wave-motion-control')]
p.write_text('\n'.join(kept)+'\n')
p=Path('app/globals.css')
s=p.read_text()
assert '.wave-motion-control{' not in s
rules=[line.replace(':global(.wave-motion-control select)', '.wave-motion-control select').replace(':global(.wave-motion-control)', '.wave-motion-control') for line in control]
s+='\n/* Unified Map motion preference control. */\n'+'\n'.join(rules)+'\n'
p.write_text(s)
p=Path('components/MarketMap.tsx')
s=p.read_text().replace('  const pulsesEnabled=motion.enabled;\n','').replace('  const reducedMotion=motion.reduced;\n','')
p.write_text(s)
p=Path('.github/workflows/ci.yml')
s=p.read_text().replace('            /tmp/solanabubble-desktop.png\n','            /tmp/solanabubble-desktop.png\n            /tmp/solanabubble-motion-proof.png\n')
p.write_text(s)
Path('scripts/finish_wave_styles.py').unlink()
Path('.github/workflows/finish-wave-styles.yml').unlink()
print('Motion styling and artifacts corrected; full CI still required.')
