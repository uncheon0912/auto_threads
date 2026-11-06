import { app, autoUpdater, dialog, ipcMain, net, shell, type BrowserWindow } from 'electron';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { POLICY } from '../../shared/policy';

declare const THREADS_AUTO_RELEASE_REPOSITORY:string;
const repository = THREADS_AUTO_RELEASE_REPOSITORY;
const releasesUrl = `https://github.com/${repository}/releases`;
const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?$/;

function newerStableVersion(tag:string, current:string):boolean {
  const candidate = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  const installed = versionPattern.exec(current);
  if (!candidate || !installed) return false;
  for (let index=1;index<=3;index++) {
    const difference=Number(candidate[index])-Number(installed[index]);
    if (difference) return difference>0;
  }
  return current.includes('-');
}

export function registerAppUpdates(options:{
  window:BrowserWindow; userData:string; testMode:boolean; busy:()=>boolean;
  backupDatabase:(destination:string)=>Promise<unknown>;
}):void {
  const {window,userData,busy,backupDatabase}=options;
  const current=app.getVersion();
  const supported=!options.testMode && app.isPackaged && process.platform==='win32'
    && existsSync(path.join(path.dirname(process.execPath),'..','Update.exe'));
  const stateFile=path.join(userData,'previous-app-version.txt');
  const previousVersion=()=>{
    if(!existsSync(stateFile))return undefined;
    const value=readFileSync(stateFile,'utf8').trim();
    return value!==current&&versionPattern.test(value)?value:undefined;
  };
  const handle=(name:string, action:()=>unknown)=>{
    ipcMain.handle(`app-updates:${name}`,event=>{
      if(event.senderFrame!==window.webContents.mainFrame)throw new Error('허용되지 않은 요청입니다.');
      return action();
    });
  };
  const assertIdle=()=>{
    if(busy())throw new Error('예약 자동화를 중지하고 진행 중인 작업이 끝난 뒤 다시 시도하세요.');
  };
  let updating=false;
  let downloaded=false;
  handle('status',()=>({current,supported,previous:supported?previousVersion():undefined}));
  handle('check',async()=>{
    if(!supported)throw new Error('GitHub Releases의 Windows 설치판에서 업데이트할 수 있습니다.');
    if(process.argv.includes('--squirrel-firstrun')&&process.uptime()<15)
      throw new Error('설치 마무리 중입니다. 잠시 뒤 다시 확인하세요.');
    if(updating)throw new Error('이미 업데이트를 확인하고 있습니다.');
    assertIdle();
    updating=true;
    try {
      if(!downloaded){
        const response=await net.fetch(`https://api.github.com/repos/${repository}/releases/latest`,{signal:AbortSignal.timeout(15000)});
        if(response.status===404)return '공개 배포 저장소에 정식 Windows 릴리스가 없습니다.';
        if(!response.ok)throw new Error('GitHub에서 최신 버전을 확인하지 못했습니다.');
        const release=await response.json() as {tag_name:string;body?:string;assets?:Array<{name:string}>};
        if(!newerStableVersion(release.tag_name,current))return '현재 최신 버전을 사용하고 있습니다.';
        const names=release.assets?.map(asset=>asset.name)??[];
        if(!names.includes('RELEASES')||!names.some(name=>name.endsWith('-full.nupkg')))
          throw new Error('최신 릴리스에 Windows 업데이트 파일이 없습니다.');
        const result=await dialog.showMessageBox(window,{
          type:'info', buttons:['다운로드','취소'], cancelId:1, defaultId:1,
          message:`현재 ${current} → 새 버전 ${release.tag_name}`,
          detail:`${release.body?.slice(0,1500)||'릴리스 설명 없음'}\n\n다운로드 후 다음 재시작 때 적용됩니다.`,
        });
        if(result.response!==0)return '업데이트 다운로드를 취소했습니다.';
        assertIdle();
        const backup=path.join(userData,'update-backups',new Date().toISOString().replace(/[:.]/g,'-'));
        mkdirSync(backup,{recursive:true});
        await backupDatabase(path.join(backup,POLICY.databaseFileName));
        for(const name of [POLICY.configFileName,'writing-prompts']){
          const source=path.join(userData,name);
          if(existsSync(source))cpSync(source,path.join(backup,name),{recursive:true});
        }
        assertIdle();
        autoUpdater.setFeedURL({url:`${releasesUrl}/download/${encodeURIComponent(release.tag_name)}`});
        downloaded=await new Promise<boolean>((resolve,reject)=>{
          const cleanup=()=>{
            autoUpdater.removeListener('update-downloaded',ready);
            autoUpdater.removeListener('update-not-available',missing);
            autoUpdater.removeListener('error',failed);
          };
          const ready=()=>{cleanup();resolve(true);};
          const missing=()=>{cleanup();resolve(false);};
          const failed=(error:Error)=>{cleanup();reject(error);};
          autoUpdater.once('update-downloaded',ready);
          autoUpdater.once('update-not-available',missing);
          autoUpdater.once('error',failed);
          try{autoUpdater.checkForUpdates();}catch(error){cleanup();reject(error);}
        });
        if(downloaded)writeFileSync(stateFile,current,'utf8');
      }
      if(!downloaded)return '이 설치판에 적용할 수 있는 업데이트가 없습니다.';
      const result=await dialog.showMessageBox(window,{
        type:'info',buttons:['다시 시작','나중에'],defaultId:1,cancelId:1,
        message:'업데이트 다운로드가 완료됐습니다.',
        detail:'다음 재시작 때 업데이트가 적용됩니다. 작업 중이라면 나중에 다시 시작하세요.',
      });
      if(result.response===0){
        assertIdle();
        autoUpdater.quitAndInstall();
      }
      return '업데이트를 받았습니다. 다음 재시작 때 적용됩니다.';
    }finally{updating=false;}
  });
  handle('restore',async()=>{
    if(!supported)throw new Error('Windows 설치판에서 복원할 수 있습니다.');
    const previous=previousVersion();
    if(!previous)throw new Error('업데이트 직전 버전의 기록이 없습니다.');
    assertIdle();
    const result=await dialog.showMessageBox(window,{
      type:'warning',buttons:['이전 릴리스 열기','취소'],defaultId:1,cancelId:1,
      message:`${previous} 버전 복원 안내`,
      detail:`이전 설치 파일은 GitHub 릴리스에서 받을 수 있습니다. 현재 앱을 종료한 뒤 이전 설치 파일로 재설치해야 합니다.\n\n업데이트 전 데이터 백업 폴더:\n${path.join(userData,'update-backups')}\n\n이전 버전과 데이터가 호환되지 않으면 백업이 필요합니다. 백업을 복원하면 업데이트 이후 변경한 내용은 되돌아갑니다.`,
    });
    if(result.response===0){
      const response=await net.fetch(`https://api.github.com/repos/${repository}/releases/tags/v${encodeURIComponent(previous)}`,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error(`이전 버전 v${previous}의 공개 릴리스에 접근할 수 없습니다.`);
      await shell.openExternal(`${releasesUrl}/tag/v${encodeURIComponent(previous)}`);
    }
  });
}
