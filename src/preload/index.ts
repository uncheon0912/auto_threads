import { contextBridge, ipcRenderer } from 'electron';
import type { AccountSaveInput, AppSettings, AutomationScheduleMutationResult, CodexUsageStatus, CommentRecord, CommentSummary, CoupangProductQueueItem, CoupangProductQueueSummary, DashboardActivitySnapshot, JobActivity, JobRecord, CredentialKey, PerformanceReport, PipelineRunView, PostRecord, ProviderConfig, SourceCandidate, SourceType, ThreadsIntegrationRun, ThreadsTokenStatus, UserLog } from '../shared/domain';
import type { CoupangCollectorStatus, ExtensionInstallation } from '../shared/coupang-collector';
import type { CoupangProductSearchSettings } from '../shared/coupang-catalog';

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.platform = process.platform;
}, { once: true });

const api = {
  snapshot: () => ipcRenderer.invoke('app:snapshot'),
  codex: {
    login: () => ipcRenderer.invoke('codex:login') as Promise<CodexUsageStatus>,
    refresh: () => ipcRenderer.invoke('codex:refresh') as Promise<CodexUsageStatus>,
    saveSelection: (input:{model?:string;reasoningEffort?:AppSettings['codex']['reasoningEffort']}) => ipcRenderer.invoke('codex:save-selection',input) as Promise<AppSettings['codex']>,
  },
  accounts: {
    register: (accessToken: string) => ipcRenderer.invoke('accounts:register-threads', { accessToken }),
    updateToken: (accountId: string, accessToken: string) => ipcRenderer.invoke('accounts:update-threads-token', { accountId, accessToken }),
    verify: (accountId: string) => ipcRenderer.invoke('accounts:verify-threads', accountId),
    tokenStatus: (accountId: string) => ipcRenderer.invoke('accounts:threads-token-status', accountId) as Promise<ThreadsTokenStatus>,
    refreshToken: (accountId: string) => ipcRenderer.invoke('accounts:refresh-threads-token', accountId) as Promise<ThreadsTokenStatus>,
    save: (input: AccountSaveInput) => ipcRenderer.invoke('accounts:save', input),
    delete: (id: string) => ipcRenderer.invoke('accounts:delete', id),
  },
  writingPrompts: {
    get: (accountId:string) => ipcRenderer.invoke('writing-prompts:get',accountId) as Promise<{common:string;account:string;reference:string;promotion:string;excludeCommon:boolean}>,
    save: (input:{accountId:string;common:string;account:string;reference:string;promotion:string;excludeCommon:boolean}) => ipcRenderer.invoke('writing-prompts:save',input) as Promise<boolean>,
  },
  providers: {
    list: (accountId: string) => ipcRenderer.invoke('providers:list', accountId),
    save: (input: Omit<ProviderConfig, 'id'> & { id?: string }) => ipcRenderer.invoke('providers:save', input),
    delete: (accountId: string, type: ProviderConfig['type']) => ipcRenderer.invoke('providers:delete', { accountId, type }),
  },
  coupangProducts: {
    search: (input:{ accountId:string } & CoupangProductSearchSettings) => ipcRenderer.invoke('coupang-products:search',input) as Promise<SourceCandidate[]>,
    stage: (input:{ accountId:string; candidateIds:string[] }) => ipcRenderer.invoke('coupang-products:stage',input) as Promise<CoupangProductQueueItem[]>,
  },
  coupangQueue: {
    list: (accountId: string) => ipcRenderer.invoke('coupang-queue:list', accountId) as Promise<CoupangProductQueueItem[]>,
    add: (input: { accountId:string; text:string }) => ipcRenderer.invoke('coupang-queue:add', input) as Promise<CoupangProductQueueItem[]>,
    update: (input: { accountId:string; id:string; productName:string; productNote:string }) => ipcRenderer.invoke('coupang-queue:update', input) as Promise<CoupangProductQueueItem>,
    updateDraft: (input: { accountId:string; id:string; body:string; expectedUpdatedAt:string }) => ipcRenderer.invoke('coupang-queue:update-draft', input) as Promise<CoupangProductQueueItem>,
    removeImage: (input: { accountId:string; id:string; imageUrl:string; expectedUpdatedAt:string }) => ipcRenderer.invoke('coupang-queue:remove-image', input) as Promise<CoupangProductQueueItem>,
    images: (input:{accountId:string;id:string;imageUrls:string[];expectedUpdatedAt:string;restore:boolean})=>ipcRenderer.invoke('coupang-queue:images',input) as Promise<CoupangProductQueueItem>,
    trash: (input:{accountId:string;ids:string[]})=>ipcRenderer.invoke('coupang-queue:trash',input) as Promise<number>,
    trashList: (accountId:string)=>ipcRenderer.invoke('coupang-queue:trash-list',accountId) as Promise<Array<{id:string;name:string;deletedAt:string}>>,
    trashRestore: (input:{accountId:string;ids:string[]})=>ipcRenderer.invoke('coupang-queue:trash-restore',input) as Promise<number>,
    delete: (input: { accountId:string; id:string }) => ipcRenderer.invoke('coupang-queue:delete', input) as Promise<boolean>,
    prepare: (input: { accountId:string; id:string }) => ipcRenderer.invoke('coupang-queue:prepare', input) as Promise<CoupangProductQueueItem>,
    prepareMany: (input: { accountId:string; ids:string[] }) => ipcRenderer.invoke('coupang-queue:prepare-many', input) as Promise<{prepared:string[];failed:Array<{id:string;message:string}>}>,
    retry: (input: { accountId:string; id:string }) => ipcRenderer.invoke('coupang-queue:retry', input) as Promise<CoupangProductQueueItem>,
    summary: (accountId: string) => ipcRenderer.invoke('coupang-queue:summary', accountId) as Promise<CoupangProductQueueSummary>,
  },
  naverBrandQueue: {
    list: (accountId: string) => ipcRenderer.invoke('naver-brand-queue:list', accountId) as Promise<CoupangProductQueueItem[]>,
    onProgress:(callback:(progress:{operationId:string;accountId:string;index:number;total:number;percent:number;message:string;itemId?:string})=>void)=>{const listener=(_event:Electron.IpcRendererEvent,progress:{operationId:string;accountId:string;index:number;total:number;percent:number;message:string;itemId?:string})=>callback(progress);ipcRenderer.on('naver-brand-queue:progress',listener);return()=>{ipcRenderer.removeListener('naver-brand-queue:progress',listener);};},
    add: (input: { accountId:string; text:string; operationId?:string }) => ipcRenderer.invoke('naver-brand-queue:add', input) as Promise<CoupangProductQueueItem[]>,
    updateDraft: (input: { accountId:string; id:string; body:string; expectedUpdatedAt:string }) => ipcRenderer.invoke('naver-brand-queue:update-draft', input) as Promise<CoupangProductQueueItem>,
    removeImage: (input: { accountId:string; id:string; imageUrl:string; expectedUpdatedAt:string }) => ipcRenderer.invoke('naver-brand-queue:remove-image', input) as Promise<CoupangProductQueueItem>,
    images: (input:{accountId:string;id:string;imageUrls:string[];expectedUpdatedAt:string;restore:boolean})=>ipcRenderer.invoke('naver-brand-queue:images',input) as Promise<CoupangProductQueueItem>,
    trash: (input:{accountId:string;ids:string[]})=>ipcRenderer.invoke('naver-brand-queue:trash',input) as Promise<number>,
    trashList: (accountId:string)=>ipcRenderer.invoke('naver-brand-queue:trash-list',accountId) as Promise<Array<{id:string;name:string;deletedAt:string}>>,
    trashRestore: (input:{accountId:string;ids:string[]})=>ipcRenderer.invoke('naver-brand-queue:trash-restore',input) as Promise<number>,
    delete: (input: { accountId:string; id:string }) => ipcRenderer.invoke('naver-brand-queue:delete', input) as Promise<boolean>,
    prepare: (input: { accountId:string; id:string }) => ipcRenderer.invoke('naver-brand-queue:prepare', input) as Promise<CoupangProductQueueItem>,
    retry: (input: { accountId:string; id:string }) => ipcRenderer.invoke('naver-brand-queue:retry', input) as Promise<CoupangProductQueueItem>,
    summary: (accountId: string) => ipcRenderer.invoke('naver-brand-queue:summary', accountId) as Promise<CoupangProductQueueSummary>,
  },
  coupangCollector: {
    installation: () => ipcRenderer.invoke('coupang-collector:installation') as Promise<ExtensionInstallation>,
    openFolder: () => ipcRenderer.invoke('coupang-collector:open-folder') as Promise<ExtensionInstallation>,
    status: () => ipcRenderer.invoke('coupang-collector:status') as Promise<CoupangCollectorStatus>,
    acknowledgePrompt: () => ipcRenderer.invoke('coupang-collector:acknowledge-prompt') as Promise<CoupangCollectorStatus>,
    openStore: () => ipcRenderer.invoke('coupang-collector:open-store') as Promise<CoupangCollectorStatus>,
    onStatus: (callback:(status:CoupangCollectorStatus)=>void) => {
      const listener=(_event:Electron.IpcRendererEvent,status:CoupangCollectorStatus)=>callback(status);
      ipcRenderer.on('coupang-collector:status-changed',listener);
      return()=>{ipcRenderer.removeListener('coupang-collector:status-changed',listener);};
    },
  },
  settings: { save: (input: AppSettings) => ipcRenderer.invoke('settings:save', input) },
  credentials: {
    status: (keys: CredentialKey[]) => ipcRenderer.invoke('credentials:status', keys),
    save: (key: CredentialKey, value: string) => ipcRenderer.invoke('credentials:save', { key, value }),
    delete: (key: CredentialKey) => ipcRenderer.invoke('credentials:delete', key),
  },
  connections: { test: (type: 'THREADS'|'YOUTUBE'|'BLOG'|'COUPANG', accountId?: string, config: Record<string, unknown> = {}) => ipcRenderer.invoke('connections:test', { type, accountId, config }) },
  automation: {
    stopAccount: (accountId:string) => ipcRenderer.invoke('automation:stop-account',accountId) as Promise<{cancelled:number}>,
    startAccount: (accountId:string) => ipcRenderer.invoke('automation:start-account',accountId) as Promise<{scheduled:number}>,
    set: (enabled: boolean) => ipcRenderer.invoke('automation:set', enabled) as Promise<AutomationScheduleMutationResult>,
    cancel: (id: string) => ipcRenderer.invoke('automation:cancel', id),
    updatePromotionType: (input:{jobId:string;accountId:string;sourceType:Exclude<SourceType,'DAILY'>}) => ipcRenderer.invoke('automation:update-promotion-type', input) as Promise<JobRecord>,
  },
  pipeline: { list: (input: { accountId?:string; limit?:number; offset?:number } = {}) => ipcRenderer.invoke('pipeline:list', input) as Promise<PipelineRunView[]> },
  comments: { list: (accountId:string,limit=100,postId?:string) => ipcRenderer.invoke('comments:list',{accountId,limit,postId}) as Promise<{summary:CommentSummary;items:CommentRecord[]}> },
  threadsIntegration: {
    list:(accountId:string,limit=10)=>ipcRenderer.invoke('threads-integration:list',{accountId,limit}) as Promise<ThreadsIntegrationRun[]>,
    get:(runId:string)=>ipcRenderer.invoke('threads-integration:get',{runId}) as Promise<ThreadsIntegrationRun|undefined>,
    start:(accountId:string)=>ipcRenderer.invoke('threads-integration:start',{accountId}) as Promise<ThreadsIntegrationRun>,
    recover:(runId:string)=>ipcRenderer.invoke('threads-integration:recover',{runId}) as Promise<ThreadsIntegrationRun>,
  },
  threadsContent: {
    deletePost:(accountId:string,localId:string)=>ipcRenderer.invoke('threads-content:delete',{kind:'POST',accountId,localId}) as Promise<{deletedId:string;verifiedAbsent:boolean;message:string}>,
    deleteReply:(accountId:string,localId:string)=>ipcRenderer.invoke('threads-content:delete',{kind:'REPLY',accountId,localId}) as Promise<{deletedId:string;verifiedAbsent:boolean;message:string}>,
  },
  dashboard: { activity: (input: { accountId:string; from:string; to:string; limit?:number }) => ipcRenderer.invoke('dashboard:activity', input) as Promise<DashboardActivitySnapshot> },
  content: {
    discover: (accountId:string, type:'YOUTUBE'|'BLOG') => ipcRenderer.invoke('content:discover', { accountId, type }) as Promise<SourceCandidate[]>,
    preview: (accountId:string, sourceId?:string) => ipcRenderer.invoke('content:preview', { accountId, sourceId }) as Promise<{ post?:PostRecord; run:PipelineRunView }>,
    publishNow: (accountId:string, sourceType:SourceType,publicationStyle?:'A'|'B') => ipcRenderer.invoke('content:publish-now', { accountId, sourceType,publicationStyle }) as Promise<PipelineRunView>,
    publishPreparedDaily: (accountId:string, postId:string) => ipcRenderer.invoke('content:publish-prepared-daily', { accountId, postId }) as Promise<PipelineRunView>,
    post: (accountId:string, postId:string) => ipcRenderer.invoke('content:post', { accountId, postId }) as Promise<PostRecord>,
  },
  reports: { query: (input: { accountIds: string[]; from: string; to: string }) => ipcRenderer.invoke('reports:query', input) as Promise<PerformanceReport> },
  external: { open: (url: string) => ipcRenderer.invoke('external:open', url) },
  onUsage: (callback: (status: CodexUsageStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: CodexUsageStatus) => callback(status);
    ipcRenderer.on('usage:updated', listener);
    return () => ipcRenderer.removeListener('usage:updated', listener);
  },
  onPipeline: (callback: (run: PipelineRunView) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, run: PipelineRunView) => callback(run);
    ipcRenderer.on('pipeline:updated', listener);
    return () => ipcRenderer.removeListener('pipeline:updated', listener);
  },
  onLog: (callback: (log: UserLog) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, log: UserLog) => callback(log);
    ipcRenderer.on('log:created', listener);
    return () => ipcRenderer.removeListener('log:created', listener);
  },
  onJob: (callback: (activity: JobActivity) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, activity: JobActivity) => callback(activity);
    ipcRenderer.on('job:updated', listener);
    return () => ipcRenderer.removeListener('job:updated', listener);
  },
};

contextBridge.exposeInMainWorld('threadsAuto', api);
export type ThreadsAutoApi = typeof api;
