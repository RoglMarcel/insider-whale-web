import { createContext, useContext } from 'react';
import type { AccessSession } from '@/lib/accessApi';
import type { View } from '@/store/useStore';

/**
 * The verified session of the hosted terminal. `null` outside the access gate,
 * i.e. in the desktop app, which has no key holders.
 */
export const AccessContext = createContext<AccessSession | null>(null);

export const useAccessSession = (): AccessSession | null => useContext(AccessContext);

/** A key holder (paid or trial) — as opposed to the owner or the desktop app. */
export const useIsMember = (): boolean => useAccessSession()?.role === 'member';

/** Owner-only views: key holders see neither the tab nor the page. */
export const MEMBER_HIDDEN_VIEWS: readonly View[] = ['backtest', 'history'];
