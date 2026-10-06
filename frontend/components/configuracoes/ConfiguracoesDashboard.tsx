"use client";

import { FormEvent, useState } from "react";

import { updateSettingsRequest } from "@/lib/auth-api";
import { getStoredSession, saveStoredSession } from "@/lib/auth-storage";

export default function ConfiguracoesDashboard() {
  const session = getStoredSession();
  const [newEmail, setNewEmail] = useState(session?.user.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-8 p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">ClickDados</p>
        <h1 className="text-4xl font-bold text-slate-950">Configurações</h1>
        <p className="text-base text-slate-600">Altere o e-mail e a senha de acesso ao site.</p>
      </div>

      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
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
            <button disabled={loading} className="rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white">{loading ? "Salvando..." : "Salvar alterações"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
