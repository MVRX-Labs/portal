"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
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
  const accountId = searchParams.get("account");

  const [account, setAccountState] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAccount = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/accounts/${id}`, getAccountResponseSchema);
      setAccountState(data.account);
    } catch {
      setAccountState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchContacts = useCallback(async (id: string) => {
    try {
      const data = await apiFetch(`/api/accounts/${id}/contacts`, getAccountContactsResponseSchema);
      setContacts(data.contacts);
    } catch {
      // ignore
    }
  }, []);

  const refreshContacts = useCallback(async () => {
    if (accountId) {
      await fetchContacts(accountId);
    }
  }, [accountId, fetchContacts]);

  useEffect(() => {
    if (accountId) {
      fetchAccount(accountId);
      fetchContacts(accountId);
    } else {
      setAccountState(null);
      setContacts([]);
    }
  }, [accountId, fetchAccount, fetchContacts]);

  const setAccount = useCallback(
    (newAccountId: string | null) => {
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
