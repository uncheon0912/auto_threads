import { describe, expect, it } from 'vitest';
import { codexModelArgs, codexModelChoices, codexModelSelectionError } from './2026-11-04-codex-models';

describe('Codex model catalog compatibility', () => {
  it('does not invent models when the CLI returns an older catalog', () => {
    const choices = codexModelChoices([{ value: 'gpt-5.5', label: 'GPT-5.5' }]);
    expect(choices).toEqual([]);
  });
  it('requires explicit model choice and rejects obsolete models', () => {
    expect(codexModelSelectionError('Default')).toContain('선택');
    expect(codexModelSelectionError('gpt-5.5')).toContain('다른');
    expect(codexModelSelectionError('gpt-5.3-codex')).toBeDefined();
    expect(codexModelSelectionError('gpt-4o')).toBeDefined();
    expect(codexModelSelectionError('gpt-6.1-sol')).toBeUndefined();
    expect(codexModelChoices([{value:'gpt-5.4-mini',label:'old'}, {value:'gpt-5.6-sol',label:'new'}]).some(item=>item.value==='gpt-5.4-mini')).toBe(false);
  });
  it('passes the selected model explicitly to the agent and refuses implicit default', () => {
    expect(codexModelArgs('gpt-6.1-sol')).toEqual(['--model', 'gpt-6.1-sol']);
    expect(() => codexModelArgs('Default')).toThrow('모델을 선택');
    expect(() => codexModelArgs('gpt-5.5')).toThrow('다른 Codex 모델');
  });
  it('deduplicates models while retaining other catalog models', () => {
    const choices = codexModelChoices([{ value: 'gpt-6.1-terra', label: 'GPT-6.1-Terra' }, { value: 'gpt-6.1-terra', label: 'duplicate' }, { value: 'other', label: 'Other' }]);
    expect(choices.filter(item => item.value === 'gpt-6.1-terra')).toHaveLength(1);
    expect(choices.at(-1)).toEqual({ value: 'other', label: 'Other' });
  });
});
