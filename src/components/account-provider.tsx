"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import type { Account } from "@/lib/api-schemas/accounts";
import type { Contact } from "@/lib/api-schemas/contacts";
import { getAccountResponseSchema } from "@/lib/api-schemas/accounts";
import { getAccountContactsResponseSchema } from "@/lib/api-schemas/contacts";
import { apiFetch } from "@/lib/api-client";

export type { Account } from "@/lib/api-schemas/accounts";
export type { Contact } from "@/lib/api-schemas/contacts";

interface AccountContextValue {
  account: Account | null;
  contacts: Contact[];
  loading: boolean;
  setAccount: (accountId: string | null) => void;
  refreshContacts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue>({
  account: null,
  contacts: [],
  loading: false,
  setAccount: () => {},
  refreshContacts: async () => {},
});

export function useAccount() {
  return useContext(AccountContext);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const accountIdFromParams = searchParams.get("account");

  // Also detect account from /accounts/{slug} path
  const slugFromPath = /^\/accounts\/([^/]+)$/.exec(pathname)?.[1] ?? null;
  const accountId = accountIdFromParams || slugFromPath;

  const [account, setAccountState] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchContacts = useCallback(async (id: string) => {
    try {
      const data = await apiFetch(`/api/accounts/${id}/contacts`, getAccountContactsResponseSchema);
      setContacts(data.contacts);
    } catch {
      // ignore
    }
  }, []);

  const refreshContacts = useCallback(async () => {
    if (account) {
      await fetchContacts(account.id);
    }
  }, [account, fetchContacts]);

  useEffect(() => {
    if (!accountId) {
      setAccountState(null);
      setContacts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch(`/api/accounts/${accountId}`, getAccountResponseSchema);
        if (cancelled) return;
        setAccountState(data.account);
        // Always use the resolved account ID for sub-resource fetches
        fetchContacts(data.account.id);
      } catch {
        if (!cancelled) {
          setAccountState(null);
          setContacts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, fetchContacts]);

  const setAccount = useCallback(
    (newAccountId: string | null) => {
      // Don't add ?account= on /accounts/{slug} pages — the slug in the path is sufficient
      if (/^\/accounts\/[^/]+$/.test(window.location.pathname)) return;

      const params = new URLSearchParams(searchParams.toString());
      if (newAccountId) {
        params.set("account", newAccountId);
      } else {
        params.delete("account");
      }
      const qs = params.toString();
      const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      window.history.pushState(null, "", url);
    },
    [searchParams]
  );

  const value = useMemo(
    () => ({
      account,
      contacts,
      loading,
      setAccount,
      refreshContacts,
    }),
    [account, contacts, loading, setAccount, refreshContacts]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
