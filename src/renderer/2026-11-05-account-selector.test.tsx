// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AccountSelector } from './2026-11-05-account-selector';
import type { Account } from '../shared/domain';

afterEach(cleanup);
const accounts=Array.from({length:25},(_,i)=>({id:`id-${i}`,name:`계정 ${i}`,threadsHandle:`user${i}`} as Account));

describe('global account selector',()=>{
  it('searches 25 accounts by handle and switches only the selected result',()=>{
    const onSelect=vi.fn(()=>true);
    render(<AccountSelector accounts={accounts} selectedId="id-0" onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button',{name:/계정 0/}));
    fireEvent.change(screen.getByLabelText('계정 검색'),{target:{value:'@user22'}});
    fireEvent.click(screen.getByRole('button',{name:/계정 22/}));
    expect(onSelect).toHaveBeenCalledWith('id-22');
    expect(screen.getByRole('status').textContent).toContain('계정 22');
    expect(screen.queryByLabelText('계정 검색')).toBeNull();
  });
  it('keeps the selector open if the account change is cancelled',()=>{
    render(<AccountSelector accounts={accounts} selectedId="id-0" onSelect={()=>false}/>);
    fireEvent.click(screen.getByRole('button',{name:/계정 0/}));
    fireEvent.click(screen.getByRole('button',{name:'계정 1@user1'}));
    expect(screen.getByLabelText('계정 검색')).toBeTruthy();
  });
});
