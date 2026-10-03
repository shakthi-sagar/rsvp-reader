/// <reference lib="webworker" />
import type { TextBlock } from '../book/types';
import { tokenize } from './tokenizer';

self.onmessage = (e: MessageEvent<{ blocks: TextBlock[] }>) => {
  try {
    const r = tokenize(e.data.blocks);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ ok: true, result: r }, [
      r.flags.buffer,
      r.paragraph.buffer,
      r.paragraphSection.buffer,
      r.sentenceStarts.buffer,
      r.blockStart.buffer,
    ]);
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ ok: false, error: String(err) });
  }
};
