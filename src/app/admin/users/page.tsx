"use client";

import { useEffect, useState } from "react";
import type { User } from "@/lib/api-schemas/admin";
import {
  getUsersResponseSchema,
  createUserResponseSchema,
  updateUserResponseSchema,
  deleteUserResponseSchema,
} from "@/lib/api-schemas/admin";
import { apiFetch, apiMutate } from "@/lib/api-client";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
  });
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/admin/users", getUsersResponseSchema);
      setUsers(data.users || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", email: "" });
    setError("");
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
    });
    setError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setError("");

    if (!form.name || !form.email) {
      setError("Name and email are required");
      return;
    }

    try {
      if (editing) {
        await apiMutate("/api/admin/users", updateUserResponseSchema, {
          method: "PUT",
          body: {
            id: editing.id,
            name: form.name,
            email: form.email,
          },
        });
      } else {
        await apiMutate("/api/admin/users", createUserResponseSchema, {
          method: "POST",
          body: form,
        });
      }
      setShowModal(false);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save user");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      await apiMutate(`/api/admin/users?id=${id}`, deleteUserResponseSchema, {
        method: "DELETE",
      });
      loadUsers();
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-sm text-(--muted)">
            Manage portal users. New users are auto-created on first Google sign-in.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          Add User
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--border) text-left text-(--muted)">
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Email</th>
              <th className="pb-2 pr-4 font-medium">Created</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-(--muted)">
                  Loading...
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-(--border) last:border-0">
                  <td className="py-2 pr-4">{user.name}</td>
                  <td className="py-2 pr-4">{user.email}</td>
                  <td className="py-2 pr-4 text-(--muted)">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="py-2">
                    <button onClick={() => openEdit(user)} className="btn-secondary mr-2 text-xs">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(user.id)} className="btn-danger text-xs">
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="card w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">{editing ? "Edit User" : "Create User"}</h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              {error && <p className="text-sm text-(--destructive)">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleSave} className="btn-primary">
                {editing ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
