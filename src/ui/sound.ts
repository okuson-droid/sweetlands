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

/** 選択権が来たとき（§7.2） */
export function chime(turn: boolean): void {
  if (turn) {
    tone(660, 120, 'sine', 0.07);
    window.setTimeout(() => tone(880, 180, 'sine', 0.07), 120);
  } else tone(740, 160, 'triangle', 0.06);
}
