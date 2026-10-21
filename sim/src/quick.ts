// 動作確認用：条件・シード・AI を指定して1局を回し、得点と時間を出す
import { installFastClone } from '../fastclone';
installFastClone();
import { DEFAULT_AGENT } from './ai';
import { conditionByName } from './core';
import fs from 'node:fs';
import { DEFAULT_WEIGHTS } from './evaluate';
import { DEFAULT_PARAMS3 } from './evaluate3';
import { playGame } from './play';

const [kind = 'v1', seedArg = '1', cond = 'A', wfile] = process.argv.slice(2);
const ev3 = process.env.EVAL === '3';
const weights = wfile ? JSON.parse(fs.readFileSync(wfile, 'utf8')).weights : ev3 ? DEFAULT_PARAMS3 : DEFAULT_WEIGHTS;
const r = playGame(conditionByName(cond), Number(seedArg), { ...DEFAULT_AGENT, kind: kind as 'v1', weights, chainSub: process.env.CHAIN !== '0', evalVersion: ev3 ? 3 : 1 }, Number(seedArg));
console.log(JSON.stringify({ kind, seed: r.seed, score: r.score, bd: r.breakdown, moves: r.moves.length, ms: Math.round(r.ms), evals: r.evals, hits: r.cacheHits, anomalies: r.anomalies, stats: r.stats, cards: r.cardsPlayed, auto: r.automations, clock: r.clockRound, ports: r.ports, area: r.areaUse }));
for (const rd of r.rounds) console.log(`R${rd.round} score=${rd.scoreAtEnd}\n  ` + rd.actions.join('\n  '));
