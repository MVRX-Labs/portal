"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface Account {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  website: string | null;
  googleDriveFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  accountId: string;
  accountEmail: string | null;
  personalEmail: string | null;
  linkedinUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account");

  const [account, setAccountState] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAccount = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${id}`);
      if (res.ok) {
        const data = await res.json();
        setAccountState(data.account);
      } else {
        setAccountState(null);
      }
    } catch {
      setAccountState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchContacts = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/accounts/${id}/contacts`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts);
      }
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
      router.push(`${window.location.pathname}${qs ? `?${qs}` : ""}`);
    },
    [router, searchParams]
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

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}
