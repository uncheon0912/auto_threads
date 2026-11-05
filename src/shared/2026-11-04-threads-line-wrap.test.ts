import { describe, expect, it } from 'vitest';
import { formatThreadsPostText, wrapThreadsLines } from './threads-text';

describe('readable Threads line breaks',()=>{
  it('wraps long sentences at word boundaries and preserves blank paragraphs',()=>{
    const text='릴스 찍느라 가게 일이 밀리면 난 촬영부터 줄이겠어. 손님이 자주 묻는 질문 세 개를 한 번에 찍고 나눠 올려봐.';
    const result=formatThreadsPostText(text);
    expect(result).toContain('\n\n');
    expect(result).toContain('릴스 찍느라 가게 일이 밀리면\n난 촬영부터 줄이겠어.');
    expect(result.split('\n').every(line=>line.length<=16)).toBe(true);
    expect(result.replace(/\s+/g,' ')).toBe(text);
    expect(formatThreadsPostText(result)).toBe(result);
  });
  it('preserves existing paragraphs, links, numbers, and affiliate disclosures',()=>{
    const text='이미 나눈 줄\n그대로 유지\n\n확인 https://example.com/long/path/keep?t=123.45\n\n※ 이 포스팅은 쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다 ※';
    const result=wrapThreadsLines(text);
    expect(result).toContain('이미 나눈 줄\n그대로 유지\n\n');
    expect(result).toContain('https://example.com/long/path/keep?t=123.45');
    expect(result).toContain('※ 이 포스팅은 쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다 ※');
    expect(wrapThreadsLines(result)).toBe(result);
  });
});
