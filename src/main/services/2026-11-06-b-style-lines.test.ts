import { describe, expect, it, vi } from 'vitest';
import { AutomationPipeline } from './pipeline';

function setup(bodies: string[]) {
  const pipeline = new AutomationPipeline({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const account = { writingInstructions: '', forbiddenExpressions: '' };
  const reply = '댓글 내용';
  let attempt = 0;
  let lastBody = '';
  vi.spyOn(pipeline as any, 'profile').mockReturnValue({});
  vi.spyOn(pipeline as any, 'progress').mockImplementation(() => {});
  const reject = vi.spyOn(pipeline as any, 'reject').mockReturnValue(undefined);
  const agent = vi.spyOn(pipeline as any, 'agent').mockImplementation(async (role: unknown) => {
    if (role === 'writer') {
      lastBody = bodies[Math.min(attempt++, bodies.length - 1)];
      return { decision: 'PASS', vetoes: [], sourceUrls: [], content: JSON.stringify({ body: lastBody, reply }) };
    }
    return { decision: 'PASS', vetoes: [], sourceUrls: [], content: JSON.stringify({ body: lastBody, reply }) };
  });
  return { pipeline, account, agent, reject, reply };
}
const lines = (count: number) => Array.from({ length: count }, (_, index) => `줄${index + 1}`).join('\n');

describe('B style body line tolerance', () => {
  it.each([4, 5, 6])('accepts %i nonblank lines after formatting and runs review', async count => {
    const body = lines(count);
    const { pipeline, account, agent, reply } = setup([body]);
    await expect(pipeline['createThreadSplit'](account as never, 'run', '원문')).resolves.toEqual({ body, reply });
    expect(agent.mock.calls.map(call => call[0])).toEqual(['writer', 'orchestrator']);
  });
  it('retries a seven-line body and accepts a six-line revision', async () => {
    const { pipeline, account, agent, reply } = setup([lines(7), lines(6)]);
    await expect(pipeline['createThreadSplit'](account as never, 'run', '원문')).resolves.toEqual({ body: lines(6), reply });
    expect(agent.mock.calls.map(call => call[0])).toEqual(['writer', 'writer', 'orchestrator']);
    expect(agent.mock.calls[1][1]).toContain('최대 6줄');
  });
  it('shortens the previous body on the third attempt and still runs independent review', async () => {
    const { pipeline, account, agent, reply } = setup([lines(7), lines(7), lines(6)]);
    await expect(pipeline['createThreadSplit'](account as never, 'run', '원문')).resolves.toEqual({ body: lines(6), reply });
    expect(agent.mock.calls.map(call => call[0])).toEqual(['writer', 'writer', 'writer', 'orchestrator']);
    expect(agent.mock.calls[2][1]).toContain('previousDraft');
    expect(agent.mock.calls[2][1]).toContain('줄7');
    expect(agent.mock.calls[2][1]).toContain('댓글 내용');
  });
  it('rejects after three seven-line attempts without an endless loop', async () => {
    const { pipeline, account, agent, reject } = setup([lines(7)]);
    await expect(pipeline['createThreadSplit'](account as never, 'run', '원문')).resolves.toBeUndefined();
    expect(agent).toHaveBeenCalledTimes(3);
    expect(reject).toHaveBeenCalledWith('run', expect.stringContaining('최대 6줄'));
  });
  it('does not extend retries when failure is unrelated to line count', async () => {
    const { pipeline, account, agent, reject } = setup(['']);
    await expect(pipeline['createThreadSplit'](account as never, 'run', '원문')).resolves.toBeUndefined();
    expect(agent).toHaveBeenCalledTimes(2);
    expect(reject).toHaveBeenCalledWith('run', expect.stringContaining('본문과 댓글이 모두 필요'));
  });
  it('uses the promotion profile for the split and its review', async () => {
    const { pipeline, account, reply } = setup([lines(4)]);
    await expect(pipeline['createThreadSplit'](account as never, 'run', '원문', undefined, 'PROMOTION')).resolves.toEqual({body:lines(4),reply});
    expect(pipeline['profile']).toHaveBeenCalledTimes(2);
    expect(pipeline['profile']).toHaveBeenCalledWith(account,'PROMOTION');
  });
});
