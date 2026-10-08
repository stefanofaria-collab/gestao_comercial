"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Pencil, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";

import {
  createUserRequest,
  deleteManagedUserRequest,
  listUsersRequest,
  resetManagedUserPasswordRequest,
  updateManagedUserRequest,
  updateSettingsRequest,
} from "@/lib/auth-api";
import { getStoredSession, saveStoredSession } from "@/lib/auth-storage";
import type { AuthSession, ManagedUser, PageOption, UserRole } from "@/types/auth";

const FALLBACK_PAGES: PageOption[] = [
  { path: "/indicadores", label: "Indicadores" },
  { path: "/faturamento", label: "Faturamento" },
  { path: "/churn", label: "Churn" },
  { path: "/churn-score", label: "Churn Score" },
  { path: "/ativos-atrasados", label: "Ativos e Atrasados" },
  { path: "/upgrade-downgrade", label: "Upgrade e Downgrade" },
  { path: "/perfil", label: "Perfil" },
  { path: "/atendimentos", label: "Atendimentos" },
  { path: "/pagamentos", label: "Pagamentos" },
  { path: "/vencimentos-futuros", label: "Vencimentos Futuros" },
  { path: "/intranet-2", label: "Intranet 2.0" },
];

const DEFAULT_ANALYST_PAGES = ["/churn-score", "/intranet-2", "/perfil", "/vencimentos-futuros"];

function useCurrentSession() {
  const [session, setSession] = useState<AuthSession | null>(null);
  useEffect(() => {
    setSession(getStoredSession());
  }, []);
  return session;
}

function PageSelector({
  pages,
  selected,
  disabled,
  onChange,
}: {
  pages: PageOption[];
  selected: string[];
  disabled?: boolean;
  onChange: (pages: string[]) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {pages.map((page) => {
        const checked = selected.includes(page.path);
        return (
          <label
            key={page.path}
            className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
              checked ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700"
            } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => {
                if (checked) onChange(selected.filter((item) => item !== page.path));
                else onChange([...selected, page.path]);
              }}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="font-medium">{page.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function MinhaContaTab() {
  const session = useCurrentSession();
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user.email) setNewEmail(session.user.email);
  }, [session?.user.email]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    if (newPassword && newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não confere.");
      setLoading(false);
      return;
    }
    if (!session?.token) {
      setError("Sessão inválida. Faça login novamente.");
      setLoading(false);
      return;
    }

    try {
      const result = await updateSettingsRequest(session.token, currentPassword, newEmail, newPassword || undefined);
      saveStoredSession({ token: result.token, user: result.user });
      setMessage(result.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar as configurações.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
      {message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      <form onSubmit={handleSubmit} className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">Novo e-mail</label>
          <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none" />
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">Senha atual</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Nova senha</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Confirmar nova senha</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none" />
        </div>
        <div className="md:col-span-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">A senha deve ter no mínimo 6 caracteres, com letra maiúscula, letra minúscula, número e caractere especial.</div>
        <div className="md:col-span-2">
          <button disabled={loading} className="rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white disabled:opacity-50">{loading ? "Salvando..." : "Salvar alterações"}</button>
        </div>
      </form>
    </div>
  );
}

function UsuariosTab() {
  const session = useCurrentSession();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [pageOptions, setPageOptions] = useState<PageOption[]>(FALLBACK_PAGES);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("analista");
  const [pages, setPages] = useState<string[]>(DEFAULT_ANALYST_PAGES);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("analista");
  const [editPages, setEditPages] = useState<string[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadUsers(token?: string) {
    const accessToken = token || session?.token;
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listUsersRequest(accessToken);
      setUsers(result.users);
      if (result.pages?.length) setPageOptions(result.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session?.token) void loadUsers(session.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => {
    if (role === "gerencial") setPages(pageOptions.map((page) => page.path));
    else if (!pages.length || pages.length === pageOptions.length) setPages(DEFAULT_ANALYST_PAGES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!session?.token) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const result = await createUserRequest(session.token, { name, email, role, pages });
      setMessage(result.message);
      setName("");
      setEmail("");
      setRole("analista");
      setPages(DEFAULT_ANALYST_PAGES);
      await loadUsers(session.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar o usuário.");
      setLoading(false);
    }
  }

  function beginEdit(user: ManagedUser) {
    setEditingEmail(user.email);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditPages(user.role === "gerencial" ? pageOptions.map((page) => page.path) : (user.pages || []));
    setTemporaryPassword(null);
    setMessage(null);
    setError(null);
  }

  async function saveEdit() {
    if (!session?.token || !editingEmail) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const result = await updateManagedUserRequest(session.token, editingEmail, {
        name: editName,
        email: editEmail,
        role: editRole,
        pages: editPages,
      });
      setMessage(result.message);
      setEditingEmail(null);
      await loadUsers(session.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o usuário.");
      setLoading(false);
    }
  }

  async function handleResetPassword(user: ManagedUser) {
    if (!session?.token) return;
    if (!window.confirm(`Gerar uma nova senha para ${user.name}? A senha atual deixará de funcionar.`)) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    setCopied(false);
    try {
      const result = await resetManagedUserPasswordRequest(session.token, user.email);
      setTemporaryPassword({ email: user.email, password: result.temporary_password });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar a nova senha.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(user: ManagedUser) {
    if (!session?.token) return;
    if (!window.confirm(`Excluir o usuário ${user.name} (${user.email})?`)) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    setTemporaryPassword(null);
    try {
      const result = await deleteManagedUserRequest(session.token, user.email);
      setMessage(result.message);
      if (editingEmail === user.email) setEditingEmail(null);
      await loadUsers(session.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o usuário.");
      setLoading(false);
    }
  }

  async function copyTemporaryPassword() {
    if (!temporaryPassword) return;
    await navigator.clipboard.writeText(temporaryPassword.password);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [users],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700"><UserPlus size={20} /></div>
          <div>
            <h2 className="text-xl font-bold text-slate-950">Adicionar usuário</h2>
            <p className="mt-1 text-sm text-slate-500">Cadastre o usuário e defina quais páginas ele poderá visualizar.</p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Nível</label>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none">
                <option value="analista">Analista</option>
                <option value="gerencial">Gerencial</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-slate-700">Páginas disponíveis</label>
              {role === "gerencial" ? <span className="text-xs font-semibold text-emerald-700">Gerencial possui acesso a todas as páginas</span> : null}
            </div>
            <PageSelector pages={pageOptions} selected={pages} disabled={role === "gerencial"} onChange={setPages} />
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">O novo usuário deverá cadastrar a própria senha no primeiro acesso.</div>
          <button disabled={loading} className="rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white disabled:opacity-50">{loading ? "Salvando..." : "Adicionar usuário"}</button>
        </form>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700"><UsersRound size={20} /></div>
            <div>
              <h2 className="text-xl font-bold text-slate-950">Usuários cadastrados</h2>
              <p className="mt-1 text-sm text-slate-500">{sortedUsers.length} usuário(s). Edite nível, e-mail e páginas ou gere uma nova senha.</p>
            </div>
          </div>
          <button type="button" onClick={() => void loadUsers()} disabled={loading} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Atualizar lista</button>
        </div>

        {message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
        {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        {temporaryPassword ? (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">Nova senha de acesso gerada</p>
            <p className="mt-1 text-sm text-amber-800">Usuário: {temporaryPassword.email}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-base font-bold text-slate-900">{temporaryPassword.password}</code>
              <button type="button" onClick={() => void copyTemporaryPassword()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-900">
                {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copiado" : "Copiar senha"}
              </button>
            </div>
            <p className="mt-2 text-xs text-amber-700">A senha é exibida somente nesta tela. Entregue-a ao usuário com segurança.</p>
          </div>
        ) : null}

        {loading && !sortedUsers.length ? <p className="py-8 text-center text-sm text-slate-500">Carregando usuários...</p> : null}

        <div className="space-y-3">
          {sortedUsers.map((user) => {
            const editing = editingEmail === user.email;
            const isSelf = session?.user.email.toLowerCase() === user.email.toLowerCase();
            return (
              <div key={user.email} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{user.name}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.role === "gerencial" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>{user.role === "gerencial" ? "Gerencial" : "Analista"}</span>
                      {user.must_define_password ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Primeiro acesso pendente</span> : null}
                    </div>
                    <p className="mt-1 break-all text-sm text-slate-500">{user.email}</p>
                    {!editing ? <p className="mt-2 text-xs text-slate-500">{user.role === "gerencial" ? "Todas as páginas" : `${user.pages?.length || 0} página(s) liberada(s)`}</p> : null}
                  </div>

                  {!editing ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => beginEdit(user)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Pencil size={15} /> Editar</button>
                      <button type="button" onClick={() => void handleResetPassword(user)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><KeyRound size={15} /> Nova senha</button>
                      <button type="button" onClick={() => void handleDelete(user)} disabled={loading || isSelf} title={isSelf ? "Você não pode excluir o próprio usuário." : "Excluir usuário"} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={15} /> Excluir</button>
                    </div>
                  ) : null}
                </div>

                {editing ? (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Nome</label>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">E-mail</label>
                        <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} disabled={isSelf} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none disabled:opacity-60" />
                        {isSelf ? <p className="mt-1 text-xs text-slate-400">Altere seu próprio e-mail na aba Minha conta.</p> : null}
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">Nível</label>
                        <select
                          value={editRole}
                          onChange={(e) => {
                            const value = e.target.value as UserRole;
                            setEditRole(value);
                            setEditPages(value === "gerencial" ? pageOptions.map((page) => page.path) : (user.pages || DEFAULT_ANALYST_PAGES));
                          }}
                          disabled={isSelf}
                          className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 outline-none disabled:opacity-60"
                        >
                          <option value="analista">Analista</option>
                          <option value="gerencial">Gerencial</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label className="text-sm font-medium text-slate-700">Páginas disponíveis</label>
                        {editRole === "gerencial" ? <span className="text-xs font-semibold text-emerald-700">Gerencial possui acesso a todas as páginas</span> : null}
                      </div>
                      <PageSelector pages={pageOptions} selected={editPages} disabled={editRole === "gerencial" || isSelf} onChange={setEditPages} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void saveEdit()} disabled={loading} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Salvar usuário</button>
                      <button type="button" onClick={() => setEditingEmail(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ConfiguracoesDashboard() {
  const session = useCurrentSession();
  const isManager = session?.user.role === "gerencial";
  const [tab, setTab] = useState<"conta" | "usuarios">("conta");

  return (
    <div className="space-y-8 p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">ClickDados</p>
        <h1 className="text-4xl font-bold text-slate-950">Configurações</h1>
        <p className="text-base text-slate-600">Gerencie sua conta e, quando permitido, os acessos dos usuários.</p>
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <button type="button" onClick={() => setTab("conta")} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === "conta" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Minha conta</button>
          {isManager ? (
            <button type="button" onClick={() => setTab("usuarios")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === "usuarios" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}><ShieldCheck size={16} /> Usuários</button>
          ) : null}
        </div>

        {tab === "conta" ? <MinhaContaTab /> : null}
        {tab === "usuarios" && isManager ? <UsuariosTab /> : null}
      </div>
    </div>
  );
}
