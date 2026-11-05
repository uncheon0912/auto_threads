export interface CodexModelChoice { value: string; label: string }

export function isRetiredCodexModel(value: string): boolean {
  const match = /^gpt-(\d+)(?:\.(\d+))?/i.exec(value.trim());
  if (!match) return false;
  const major = Number(match[1]);
  return major < 5 || (major === 5 && Number(match[2] ?? 0) <= 5);
}

export function codexModelSelectionError(value?: string): string | undefined {
  if (!value?.trim() || value.trim().toLowerCase() === 'default') return 'Codex 모델을 선택해 주세요. 화면 오른쪽 위의 모델 메뉴에서 사용할 모델을 선택해 주세요.';
  if (isRetiredCodexModel(value)) return '선택된 모델은 더 이상 제공하지 않습니다. 화면 오른쪽 위에서 다른 Codex 모델을 선택해 주세요.';
  return undefined;
}

export function codexModelArgs(value?: string): string[] {
  const error = codexModelSelectionError(value);
  if (error) throw new Error(error);
  return ['--model', value!.trim()];
}

export function codexModelChoices(catalog: CodexModelChoice[]): CodexModelChoice[] {
  const choices = new Map<string, CodexModelChoice>();
  for (const item of catalog) if (!isRetiredCodexModel(item.value) && !choices.has(item.value)) choices.set(item.value, item);
  return [...choices.values()];
}
