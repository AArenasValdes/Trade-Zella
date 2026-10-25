import type { PropAccount } from '../types/trading.ts';

export type AccountResolutionStatus =
  | 'ok'
  | 'single'
  | 'default'
  | 'editing'
  | 'no_account'
  | 'multiple_without_default';

export interface AccountResolutionResult {
  account: PropAccount | null;
  status: AccountResolutionStatus;
}

export function resolveTargetAccount(
  accounts: PropAccount[],
  defaultAccountId: string | null,
  editingAccountId?: string
): AccountResolutionResult {
  if (editingAccountId) {
    const acc = accounts.find((a) => a.id === editingAccountId);
    if (acc && acc.initialBalance > 0) {
      return { account: acc, status: 'editing' };
    }
  }
  if (!accounts || accounts.length === 0) {
    return { account: null, status: 'no_account' };
  }
  if (accounts.length === 1) {
    const acc = accounts[0];
    if (acc && acc.initialBalance > 0) {
      return { account: acc, status: 'single' };
    }
    return { account: null, status: 'no_account' };
  }
  if (defaultAccountId) {
    const acc = accounts.find((a) => a.id === defaultAccountId);
    if (acc && acc.initialBalance > 0) {
      return { account: acc, status: 'default' };
    }
  }
  return { account: null, status: 'multiple_without_default' };
}
