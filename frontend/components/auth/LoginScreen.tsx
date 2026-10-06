"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { firstAccessRequest, loginRequest, sendCodeRequest, verifyCodeRequest } from "@/lib/auth-api";
import { getDefaultPath, saveStoredSession } from "@/lib/auth-storage";

function ClickDadosLogo({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 70" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="ClickDados">
      <text x="0" y="50" fontFamily="Arial, Helvetica, sans-serif" fontSize="44" fill="#0b1957" fontWeight="400">click</text>
      <text x="88" y="50" fontFamily="Arial, Helvetica, sans-serif" fontSize="44" fill="#0b1957" fontWeight="700">dados</text>
      <path d="M325 19L348 35L325 51L332 35L325 19Z" fill="#ef4444" />
    </svg>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "first-access">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const helperText = useMemo(() => {
    if (mode === "first-access") {
      return "No primeiro acesso, defina sua senha para entrar no ClickDados.";
    }
    if (mode === "signup") {
      return "Informe nome e e-mail para receber o código de confirmação.";
    }
    return "Entre com seu e-mail e senha para acessar o ClickDados.";
  }, [mode]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await loginRequest(email, password);
      if (result.status === "first_access_required") {
        setMode("first-access");
        setMessage("Primeiro acesso identificado. Defina sua senha.");
        return;
      }
      saveStoredSession({ token: result.token, user: result.user });
      router.replace(getDefaultPath(result.user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await sendCodeRequest(name, email);
      setCodeSent(true);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o código.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await verifyCodeRequest(name, email, code);
      setMessage(result.message);
      setMode("login");
      setCodeSent(false);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível validar o código.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFirstAccess(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    if (password !== confirmPassword) {
      setError("A confirmação da senha não confere.");
      setLoading(false);
      return;
    }
    try {
      const result = await firstAccessRequest(email, password);
      saveStoredSession({ token: result.token, user: result.user });
      router.replace(getDefaultPath(result.user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o primeiro acesso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden bg-[#03114b] px-8 py-12 text-white lg:flex lg:flex-col lg:items-center lg:justify-center">
          <span className="rounded-full border border-white/30 bg-white/15 px-5 py-2 text-xl">Assistente IA ✨</span>
          <h1 className="mt-8 max-w-2xl text-center text-6xl font-light leading-tight">O ERP GestãoClick agora tem <span className="font-semibold text-blue-400">IA</span></h1>
          <p className="mt-6 max-w-xl text-center text-2xl text-blue-50/90">Faça consultas, gere relatórios e tire dúvidas do sistema em segundos com o Assistente de IA.</p>
          <div className="mt-8 w-full max-w-xl rounded-3xl bg-gradient-to-b from-sky-700 to-blue-500 p-5 shadow-2xl">
            <div className="rounded-2xl bg-white p-6 text-slate-700">
              <p className="text-2xl font-medium text-blue-700">Olá, Sou seu Assistente de IA.</p>
              <p className="text-xl">Como posso te ajudar hoje?</p>
              <div className="mt-6 ml-auto w-fit rounded-2xl bg-blue-100 px-5 py-3 text-lg">Me dê o resumo financeiro do dia.</div>
              <div className="mt-4 w-fit rounded-2xl bg-slate-100 px-5 py-3 text-lg">Claro! Aqui está um resumo completo sobre seu financeiro do dia de hoje.</div>
            </div>
          </div>
          <button className="mt-8 rounded-xl bg-blue-500 px-8 py-3 text-xl font-semibold">Teste o Assistente IA</button>
        </div>

        <div className="flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-sm md:p-10">
            <div className="mb-8 flex justify-center"><ClickDadosLogo className="h-16 w-auto" /></div>
            <p className="mb-6 text-center text-slate-600">{helperText}</p>

            {message ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
            {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="mb-2 block text-lg font-medium text-slate-800">E-mail</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-4 text-lg outline-none" />
                </div>
                <div>
                  <label className="mb-2 block text-lg font-medium text-slate-800">Senha</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-4 text-lg outline-none" />
                </div>
                <button disabled={loading} className="w-full rounded-xl bg-[#041423] px-4 py-4 text-2xl font-bold text-white">{loading ? "Entrando..." : "Acessar minha conta"}</button>
                <button type="button" onClick={() => { setMode("signup"); setError(null); setMessage(null); }} className="w-full rounded-xl border border-slate-300 px-4 py-4 text-lg font-medium text-slate-700">Criar acesso</button>
              </form>
            ) : null}

            {mode === "signup" ? (
              <form onSubmit={codeSent ? handleVerifyCode : handleSendCode} className="space-y-5">
                <div>
                  <label className="mb-2 block text-lg font-medium text-slate-800">Nome</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-4 text-lg outline-none" />
                </div>
                <div>
                  <label className="mb-2 block text-lg font-medium text-slate-800">E-mail</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-4 text-lg outline-none" />
                </div>
                {codeSent ? (
                  <div>
                    <label className="mb-2 block text-lg font-medium text-slate-800">Código de 6 dígitos</label>
                    <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-4 text-lg outline-none" />
                  </div>
                ) : null}
                <button disabled={loading} className="w-full rounded-xl bg-[#041423] px-4 py-4 text-xl font-bold text-white">{loading ? "Carregando..." : codeSent ? "Confirmar código" : "Enviar código"}</button>
                <button type="button" onClick={() => { setMode("login"); setCodeSent(false); setCode(""); setError(null); setMessage(null); }} className="w-full rounded-xl border border-slate-300 px-4 py-4 text-lg font-medium text-slate-700">Voltar para o login</button>
              </form>
            ) : null}

            {mode === "first-access" ? (
              <form onSubmit={handleFirstAccess} className="space-y-5">
                <div>
                  <label className="mb-2 block text-lg font-medium text-slate-800">E-mail</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-4 text-lg outline-none" />
                </div>
                <div>
                  <label className="mb-2 block text-lg font-medium text-slate-800">Nova senha</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-4 text-lg outline-none" />
                </div>
                <div>
                  <label className="mb-2 block text-lg font-medium text-slate-800">Confirmar senha</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-4 text-lg outline-none" />
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">A senha deve ter no mínimo 6 caracteres, com letra maiúscula, letra minúscula, número e caractere especial.</div>
                <button disabled={loading} className="w-full rounded-xl bg-[#041423] px-4 py-4 text-xl font-bold text-white">{loading ? "Salvando..." : "Definir senha"}</button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
