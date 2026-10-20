// 音（ui_design §8.2）。音声ファイルは使わず Web Audio で合成する
import type { GameEvent } from '../game/types';

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean): void {
  enabled = v;
}

function tone(freq: number, ms: number, type: OscillatorType = 'sine', gain = 0.08, slide = 0): void {
  if (!enabled || typeof window === 'undefined') return;
  try {
    ctx = ctx ?? new AudioContext();
    // 端末によっては、操作の前に作った AudioContext が止まったままになるため、鳴らすたびに再開を試みる
    if (ctx.state === 'suspended') void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, ctx.currentTime + ms / 1000);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000);
  } catch {
    /* 音が出せない環境では鳴らさない */
  }
}

export function sound(e: GameEvent): void {
  switch (e.t) {
    case 'disc':
      return tone(220, 90, 'triangle');
    case 'tile':
      return tone(330, 80, 'square', 0.03);
    case 'flip':
      return tone(500, 140, 'sine', 0.05, 300);
    case 'road':
      return tone(880, 50, 'square', 0.025);
    case 'building':
      return tone(160, 110, 'triangle');
    case 'rabbit':
      return tone(600, 120, 'sine', 0.06, 400);
    case 'food':
    case 'industry':
    case 'pros':
      return tone(700, 40, 'sine', 0.03);
    case 'card':
      return e.reason === 'play' ? tone(420, 120, 'sawtooth', 0.02, -120) : tone(1200, 60, 'sine', 0.02, -500);
    case 'pass':
      return tone(523, 260, 'sine', 0.05);
    case 'drawArea':
      return tone(1320, 160, 'sine', 0.04, 400);
  }
}

/** 自分の手番の知らせの音量（効果音よりはっきり大きくする。持ち主の指示 2026-10-17） */
const TURN_GAIN = 0.35;

/** 選択権が来たとき（§7.2）。手番が来たときは、上がる4音を2回、大きな音で鳴らす */
export function chime(turn: boolean): void {
  if (turn) {
    const notes = [523, 659, 784, 1047];
    for (let r = 0; r < 2; r++)
      notes.forEach((f, i) => {
        window.setTimeout(() => {
          tone(f, 220, 'triangle', TURN_GAIN);
          tone(f * 2, 160, 'sine', TURN_GAIN / 4); // 倍音を重ねて、小さなスピーカーでも聞こえやすくする
        }, r * 650 + i * 120);
      });
  } else tone(740, 160, 'triangle', 0.08);
}
