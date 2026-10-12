// 動作確認用：条件・シード・AI を指定して1局を回し、得点と時間を出す
import { installFastClone } from '../fastclone';
installFastClone();
import { DEFAULT_AGENT } from './ai';
import { conditionByName } from './core';
import { DEFAULT_WEIGHTS } from './evaluate';
import { playGame } from './play';

const [kind = 'v1', seedArg = '1', cond = 'A'] = process.argv.slice(2);
const r = playGame(conditionByName(cond), Number(seedArg), { ...DEFAULT_AGENT, kind: kind as 'v1', weights: DEFAULT_WEIGHTS }, 1);
console.log(JSON.stringify({ kind, seed: r.seed, score: r.score, bd: r.breakdown, moves: r.moves.length, ms: Math.round(r.ms), evals: r.evals, anomalies: r.anomalies, cards: r.cardsPlayed, auto: r.automations, clock: r.clockRound, ports: r.ports, area: r.areaUse }));
for (const rd of r.rounds) console.log(`R${rd.round} score=${rd.scoreAtEnd}\n  ` + rd.actions.join('\n  '));
