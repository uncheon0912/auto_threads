import { beforeEach, describe, expect, it, vi } from 'vitest';
const storage=vi.hoisted(()=>new Map<string,string>());
vi.mock('node:fs',()=>({promises:{
  readFile:vi.fn(async (file:string)=>{if(!storage.has(file))throw Object.assign(new Error('not found'),{code:'ENOENT'});return storage.get(file);}),
  writeFile:vi.fn(async (file:string,data:string)=>{storage.set(file,data);}),
  rename:vi.fn(async (from:string,to:string)=>{storage.set(to,storage.get(from)!);storage.delete(from);}),
}}));
vi.mock('electron',()=>({safeStorage:{isEncryptionAvailable:()=>false}}));
import { SettingsManager } from './settings';
import { enforceStoppedAutomationOnStartup } from './startup-automation';

describe('Codex model settings survive restart',()=>{
  beforeEach(()=>storage.clear());
  it('retains the selected model and reasoning when a new manager starts',async()=>{
    const first=new SettingsManager('isolated-test');
    const saved=await first.read();
    await first.save({...saved,schedulerEnabled:true,codex:{...saved.codex,model:'gpt-6.1-sol',reasoningEffort:'high'}});
    const restarted=new SettingsManager('isolated-test');
    await enforceStoppedAutomationOnStartup(restarted,{stopAndClearSchedules:async()=>0});
    const loaded=await restarted.read();
    expect(loaded.codex.model).toBe('gpt-6.1-sol');
    expect(loaded.codex.reasoningEffort).toBe('high');
    expect(loaded.schedulerEnabled).toBe(false);
  });
});
