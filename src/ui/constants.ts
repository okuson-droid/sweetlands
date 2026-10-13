// 入力のしきい値（ui_design §2-4：定数ファイルに集める）
export const DRAG_START_PX = 6; // これ以上動いたらドラッグとみなす
export const LONG_PRESS_MS = 450; // タッチの長押しで拡大
export const CLICK_SWALLOW_MS = 500; // タップで持ち上げた直後のクリックを捨てる時間（画面が切り替わって別の要素に当たるのを防ぐ）
export const HOVER_ZOOM_MS = 350; // マウスを重ねてから拡大までの待ち
export const REASON_TOAST_MS = 2400; // できない理由の表示時間
export const NOTICE_MS = 1400; // 「あなたの手番です」の表示時間
export const SNAP_PX = 22; // 道駒の受け皿に吸い付く距離
export const PLAYBACK_MAX_MS = 2000; // 1回の演出の上限
export const NARROW_WIDTH = 1280; // これ未満は狭い画面の表示
