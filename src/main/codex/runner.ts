import { execFile, execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { constants, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AgentResult, AgentRole, CodexHealth, CodexSettings } from '../../shared/domain';
import { POLICY } from '../../shared/policy';
import { agentResultJsonSchema, agentResultSchema } from './schemas';
import { codexProcessEnvironment } from './environment';
import { codexModelArgs } from '../../shared/2026-11-04-codex-models';

const execFileAsync = promisify(execFile);

export async function findPosixCodexExecutable(env:NodeJS.ProcessEnv=process.env,home=os.homedir()):Promise<string>{
  const directories=[...(env.PATH??'').split(path.delimiter),path.join(home,'.local','bin'),'/opt/homebrew/bin','/usr/local/bin'];
  for(const directory of new Set(directories.filter(Boolean))){
    const candidate=path.join(directory,'codex');
    try{if(!(await fs.stat(candidate)).isFile())continue;await fs.access(candidate,constants.X_OK);return candidate;}
    catch(error){if(!['ENOENT','ENOTDIR','EACCES'].includes((error as NodeJS.ErrnoException).code??''))throw error;}
  }
  throw Object.assign(new Error('Codex CLI가 설치되어 있지 않습니다. PATH와 표준 설치 위치를 자동 탐색했지만 실행 파일이 없습니다.'),{code:'ENOENT'});
}

export async function findWindowsCodexExecutable(env:NodeJS.ProcessEnv=process.env,arch:string=process.arch):Promise<string> {
  const exists=async(file:string)=>{try{return (await fs.stat(file)).isFile();}catch(error){if(['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code??''))return false;throw error;}};
  const directories=(env.PATH??env.Path??'').split(path.delimiter).map(entry=>entry.trim().replace(/^"(.*)"$/,'$1')).filter(Boolean);
  if(env.APPDATA)directories.push(path.join(env.APPDATA,'npm'));
  const candidates:string[]=[];
  for(const directory of directories){const candidate=path.join(directory,'codex.exe');if(await exists(candidate))candidates.push(candidate);}
  if(env.APPDATA){
    const target=arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc';
    const candidate=path.join(env.APPDATA,'npm','node_modules','@openai','codex','node_modules','@openai',`codex-win32-${arch==='arm64'?'arm64':'x64'}`,'vendor',target,'bin','codex.exe');
    if(await exists(candidate))candidates.push(candidate);
  }
  // 데스크톱 업데이트로 버전 폴더가 바뀌어도 오래된 사용자 PATH에 의존하지 않는다.
  if(env.LOCALAPPDATA){
    const root=path.join(env.LOCALAPPDATA,'OpenAI','Codex','bin');
    if(await exists(path.join(root,'codex.exe')))candidates.push(path.join(root,'codex.exe'));
    const entries=await fs.readdir(root,{withFileTypes:true}).catch(error=>{if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;});
    for(const entry of entries.filter(entry=>entry.isDirectory())){
      const file=path.join(root,entry.name,'codex.exe');
      if(await exists(file))candidates.push(file);
    }
  }
  const versions=await Promise.all([...new Set(candidates)].map(async file=>{
    try {const result=await execFileAsync(file,['--version'],{windowsHide:true,timeout:5000,maxBuffer:4096,env});return {file,version:result.stdout};}
    catch{return {file,version:''};}
  }));
  versions.sort((a,b)=>compareCodexVersions(b.version,a.version));
  if(versions[0])return versions[0].file;
  throw Object.assign(new Error('Codex CLI가 설치되어 있지 않습니다. PATH와 표준 설치 위치를 자동 탐색했지만 실행 파일이 없습니다.'),{code:'ENOENT'});
}

export function compareCodexVersions(left:string,right:string):number {
  const parse=(value:string)=>{const m=value.match(/(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/);return m?{numbers:m.slice(1,4).map(Number),pre:m[4]}:undefined;};
  const a=parse(left),b=parse(right);
  if(!a||!b)return a?1:b?-1:0;
  for(let i=0;i<3;i++){const difference=a.numbers[i]-b.numbers[i];if(difference)return difference;}
  if(!a.pre||!b.pre)return a.pre? -1:b.pre?1:0;
  return a.pre.localeCompare(b.pre,undefined,{numeric:true});
}

export interface AgentInvocation {
  role: AgentRole;
  prompt: string;
  settings: CodexSettings;
  webSearch?: boolean;
  signal?: AbortSignal;
  onActivity?: (message:string)=>void;
}

/** Safe, content-free summaries of actual Codex JSONL lifecycle events. */
export function codexActivityFromEvent(event: unknown): string | undefined {
  if (!event || typeof event !== 'object') return undefined;
  const entry=event as {type?:unknown;item?:{type?:unknown}};
  if(entry.type==='thread.started') return 'AI 작업 연결을 시작했습니다.';
  if(entry.type==='turn.started') return 'AI가 요청을 처리하고 있습니다.';
  if(entry.type==='item.started' && entry.item?.type==='web_search') return 'AI가 자료를 검색하고 있습니다.';
  if(entry.type==='item.completed' && entry.item?.type==='web_search') return 'AI의 자료 검색이 완료되었습니다.';
  if(entry.type==='item.completed' && entry.item?.type==='reasoning') return 'AI가 요청을 분석하고 있습니다.';
  if(entry.type==='item.completed' && entry.item?.type==='agent_message') return 'AI 응답을 받아 결과를 확인하고 있습니다.';
  return undefined;
}

export interface AgentInvocationResult {
  result: AgentResult;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export class CodexRunner {
  private executable?: string;
  private readonly schemaPath: string;
  private readonly activeChildren = new Set<ChildProcessWithoutNullStreams>();

  constructor(private readonly workDirectory: string, dataDirectory: string) {
    this.schemaPath = path.join(dataDirectory, 'agent-result.schema.json');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.workDirectory, { recursive: true });
    await fs.writeFile(this.schemaPath, JSON.stringify(agentResultJsonSchema), 'utf8');
    this.executable = await this.resolveExecutable();
  }

  async executablePath(): Promise<string> {
    if(this.executable){
      try{await fs.access(this.executable);return this.executable;}catch(error){if(!['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code??''))throw error;this.executable=undefined;}
    }
    this.executable=await this.resolveExecutable();return this.executable;
  }

  async login(): Promise<void> {
    const executable = await this.executablePath();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, ['login'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: codexProcessEnvironment() });
      child.stdout.resume(); child.stderr.resume();
      const timer = setTimeout(() => { child.kill(); reject(new Error('로그인 시간이 초과되었습니다. 다시 시도해 주세요.')); }, 180_000);
      child.once('error', () => { clearTimeout(timer); reject(new Error('Codex 로그인 실행에 실패했습니다.')); });
      child.once('close', (code) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error('Codex 로그인이 완료되지 않았습니다.')); });
    });
  }

  private async resolveExecutable(): Promise<string> {
    if (process.platform === 'win32') return findWindowsCodexExecutable();
    return findPosixCodexExecutable();
  }

  async health(): Promise<CodexHealth> {
    let executable:string;
    try{executable=await this.executablePath();}catch(error){
      const missing=(error as NodeJS.ErrnoException).code==='ENOENT';
      return {installed:false,failure:missing?'NOT_FOUND':'EXECUTION_FAILED',message:missing?'Codex CLI가 설치되어 있지 않습니다. PATH와 표준 설치 위치를 자동 탐색했지만 실행 파일이 없습니다.':`Codex CLI 자동 탐색 실패: ${(error as Error).message}`};
    }
    try {
      const versionResult = await execFileAsync(executable, ['--version'], { windowsHide: true,timeout:10_000,maxBuffer:64*1024,env:codexProcessEnvironment() });
      return { installed: true, version: versionResult.stdout.trim(), message: 'Codex CLI가 설치되어 있습니다.' };
    } catch(error) {
      return { installed: false,failure:'EXECUTION_FAILED',message:`Codex CLI는 발견했지만 실행 확인에 실패했습니다 (${(error as NodeJS.ErrnoException).code??'시간 초과 또는 실행 오류'}).` };
    }
  }

  private killChild(child: ChildProcessWithoutNullStreams): void {
    try {
      if (process.platform === 'win32' && child.pid) execFileSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide:true, timeout:3_000, stdio:'ignore' });
      else child.kill('SIGKILL');
    } catch { child.kill('SIGKILL'); }
    this.activeChildren.delete(child);
  }

  cancelAll(): number {
    const children = [...this.activeChildren];
    children.forEach((child) => this.killChild(child));
    return children.length;
  }

  async run(invocation: AgentInvocation): Promise<AgentInvocationResult> {
    invocation.signal?.throwIfAborted();
    const modelArgs = codexModelArgs(invocation.settings.model);
    const executable = await this.executablePath();
    invocation.signal?.throwIfAborted();
    const args = [
      ...(invocation.webSearch ? ['--search'] : []), 'exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules',
      '--sandbox', 'read-only', '--skip-git-repo-check',
      '-c', 'approval_policy="never"', '-c', `model_reasoning_effort="${invocation.settings.reasoningEffort}"`,
      '-c', `web_search="${invocation.webSearch ? 'live' : 'disabled'}"`,
      '--output-schema', this.schemaPath, '--color', 'never', '-C', this.workDirectory,
    ];
    args.push(...modelArgs);
    args.push('-');

    return await new Promise((resolve, reject) => {
      const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],env:codexProcessEnvironment() });
      this.activeChildren.add(child);
      let stdout = '';
      let stderr = '';
      let finalText = '';
      let failureMessage = '';
      let usage: { input?: number; output?: number } = {};
      let buffer = '';
      let settled = false;

      const finishError = (error: Error, kill = false) => {
        if (!settled) { settled = true; clearTimeout(timer); invocation.signal?.removeEventListener('abort',onAbort); if (kill) this.killChild(child); else this.activeChildren.delete(child); reject(error); }
      };
      const timer = setTimeout(() => finishError(new Error('Codex Agent 실행 시간이 초과되었습니다.'), true), invocation.settings.timeoutSeconds * 1000);

      const onAbort=()=>finishError(new Error('자동 댓글 작업을 중지했습니다.'),true);
      invocation.signal?.addEventListener('abort',onAbort,{once:true});
      if(invocation.signal?.aborted){onAbort();return;}

      const parseLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line);
          const activity=codexActivityFromEvent(event);
          if(activity)try{invocation.onActivity?.(activity);}catch{/* Progress display must not affect the agent result. */}
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') finalText = event.item.text ?? finalText;
          if (event.type === 'error' && typeof event.message === 'string') failureMessage = event.message.slice(0, 4_000);
          if (event.type === 'turn.failed' && typeof event.error?.message === 'string') failureMessage = event.error.message.slice(0, 4_000);
          if (event.type === 'turn.completed' && event.usage) {
            const input=event.usage.input_tokens ?? event.usage.inputTokens;
            const output=event.usage.output_tokens ?? event.usage.outputTokens;
            usage = {
              input: typeof input==='number' && Number.isFinite(input) && input>=0 ? input : undefined,
              output: typeof output==='number' && Number.isFinite(output) && output>=0 ? output : undefined,
            };
          }
        } catch { /* 알 수 없는 JSONL 행은 최종 Schema 결과에 영향을 주지 않는다. */ }
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        if (Buffer.byteLength(stdout) > POLICY.agentOutputMaxBytes) return finishError(new Error('Codex 출력 크기 제한을 초과했습니다.'), true);
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? '';
        lines.forEach(parseLine);
      });
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-32_000); });
      child.on('error', (error) => finishError(new Error(`Codex 실행 실패: ${error.message}`)));
      child.on('close', (code) => {
        invocation.signal?.removeEventListener('abort',onAbort);
        clearTimeout(timer);
        this.activeChildren.delete(child);
        if (settled) return;
        parseLine(buffer);
        if (code !== 0) {
          const detail = failureMessage || stderr.trim() || '상세 정보 없음';
          if (/model_not_found|model is not supported/i.test(detail)) return finishError(new Error(`선택한 모델(${invocation.settings.model}) 요청을 Codex가 거부했습니다. 모델 목록에 표시되어도 계정 권한 또는 CLI 연결에 따라 실행이 제한될 수 있습니다. Codex 로그인과 CLI 버전을 확인하거나 다른 모델을 선택해 주세요.`));
          return finishError(new Error(`Codex Agent 실행 실패 (${code}): ${detail}`));
        }
        try {
          const parsed = agentResultSchema.parse(JSON.parse(finalText));
          settled = true;
          resolve({ result: parsed, inputTokens: usage.input, outputTokens: usage.output,
            totalTokens: usage.input === undefined || usage.output === undefined ? undefined : usage.input + usage.output });
        } catch (error) { finishError(new Error(`Codex 구조화 결과 검증 실패: ${String(error)}`)); }
      });
      child.stdin.end(`[역할: ${invocation.role}]\n${invocation.prompt}`);
    });
  }
}
