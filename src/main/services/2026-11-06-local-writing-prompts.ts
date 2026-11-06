import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Account } from '../../shared/domain';

export class LocalWritingPrompts {
  private readonly directory:string;
  constructor(userData:string) { this.directory=path.join(userData,'writing-prompts'); }
  private accountPath(account:Pick<Account,'id'|'threadsUserId'>,kind:'instructions'|'reference'|'promotion'|'exclude-common'):string {
    const identity=account.threadsUserId?.trim() || `local:${account.id}`;
    const key=createHash('sha256').update(identity).digest('hex');
    return path.join(this.directory,`account-${key}-${kind}.txt`);
  }
  private read(file:string):string { return existsSync(file)?readFileSync(file,'utf8'):''; }
  get(account:Pick<Account,'id'|'threadsUserId'>):{common:string;account:string;reference:string;promotion:string;excludeCommon:boolean} {
    return {common:this.read(path.join(this.directory,'common.txt')),account:this.read(this.accountPath(account,'instructions')),reference:this.read(this.accountPath(account,'reference')),promotion:this.read(this.accountPath(account,'promotion')),excludeCommon:this.read(this.accountPath(account,'exclude-common')).trim()==='true'};
  }
  save(account:Pick<Account,'id'|'threadsUserId'>,value:{common:string;account:string;reference:string;promotion:string;excludeCommon:boolean}):void {
    if(value.common.length>12000||value.account.length>12000||value.reference.length>12000||value.promotion.length>12000)throw new Error('각 프롬프트는 12,000자 이하여야 합니다.');
    mkdirSync(this.directory,{recursive:true});
    writeFileSync(path.join(this.directory,'common.txt'),value.common,{encoding:'utf8',mode:0o600});
    writeFileSync(this.accountPath(account,'instructions'),value.account,{encoding:'utf8',mode:0o600});
    writeFileSync(this.accountPath(account,'reference'),value.reference,{encoding:'utf8',mode:0o600});
    writeFileSync(this.accountPath(account,'promotion'),value.promotion,{encoding:'utf8',mode:0o600});
    writeFileSync(this.accountPath(account,'exclude-common'),String(value.excludeCommon),{encoding:'utf8',mode:0o600});
  }
}
