'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, UserRound, Wallet} from 'lucide-react';
import {readApiResponse} from '@/lib/api-response';
import './login.css';

type AuthStatus = {setup?: boolean; setupAllowed?: boolean};

export default function LoginScreen() {
  const [setup, setSetup] = useState<boolean | null>(null);
  const [setupAllowed, setSetupAllowed] = useState(false);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [statusAttempt, setStatusAttempt] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const titleNode = useRef<HTMLSpanElement>(null);
  const errorNode = useRef<HTMLParagraphElement>(null);
  const title = setup ? 'Configure seu\nprimeiro acesso.' : 'Bem-vindo\nde volta.';

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch('/api/auth', {cache: 'no-store', signal: controller.signal})
      .then(readApiResponse<AuthStatus>)
      .then(data => {
        if (controller.signal.aborted) return;
        setSetup(!!data.setup);
        setSetupAllowed(!!data.setupAllowed);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o acesso. Tente novamente.');
      });
    return () => controller.abort();
  }, [statusAttempt]);

  useEffect(() => {
    if (setup === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let disposed = false;
    const animations: Array<{revert: () => unknown}> = [];
    void import('animejs').then(({animate, scrambleText}) => {
      if (disposed || !root.current || !titleNode.current) return;
      const card = root.current.querySelector<HTMLElement>('.login-card');
      const fields = Array.from(root.current.querySelectorAll<HTMLElement>('.reveal'));
      if (card) animations.push(animate(card, {opacity: [0, 1], y: [18, 0], duration: 800, ease: 'out(4)'}));
      animations.push(animate(fields, {
        opacity: [0, 1],
        y: (_: unknown, index = 0) => ({from: 22 + index * 5, to: 0}),
        delay: (_: unknown, index = 0) => 200 + index * 130,
        duration: (_: unknown, index = 0) => 700 + index * 60,
        ease: 'out(4)',
      }));
      titleNode.current.textContent = title;
      animations.push(animate(titleNode.current, {
        textContent: scrambleText({text: title, ease: 'outExpo', chars: 'uppercase', duration: 1100, override: false}),
      }));
    }).catch(() => {
      animations.forEach(animation => animation.revert());
      if (titleNode.current) titleNode.current.textContent = title;
    });
    return () => {
      disposed = true;
      animations.forEach(animation => animation.revert());
    };
  }, [setup, title]);

  useEffect(() => { if (error) errorNode.current?.focus(); }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || setup === null || (setup && !setupAllowed)) return;
    setBusy(true);
    setError('');
    setNotice('');
    let navigating = false;
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: setup ? 'setup' : 'login', name, login, password, confirmation, bootstrap_token: bootstrapToken}),
      });
      await readApiResponse(response);
      if (setup) {
        setSetup(false);
        setPassword('');
        setConfirmation('');
        setBootstrapToken('');
        setShowPassword(false);
        setNotice('Administrador criado. Entre com seu login e senha.');
      } else {
        navigating = true;
        window.location.assign('/');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      if (!navigating) setBusy(false);
    }
  }

  return <div className="kf-login" ref={root}>
    <div className="backdrop" aria-hidden="true" />
    <header className="masthead">
      <a className="wordmark" href="/entrar" aria-label="King Foods Finanças, início"><Wallet aria-hidden="true" /><span>KING <b>FOODS</b></span></a>
      <span className="masthead-label">GESTÃO FINANCEIRA</span>
    </header>
    <main>
      <section className={`login-card${setup ? ' setup-card' : ''}`} aria-labelledby="login-title">
        <div className="card-accent" aria-hidden="true" />
        <div className="card-intro">
          <div className="eyebrow"><span /> SEU FINANCEIRO EM DIA</div>
          <h1 id="login-title" aria-label={title.replace('\n', ' ')}><span ref={titleNode} aria-hidden="true">{title}</span></h1>
          <p>{setup
            ? setupAllowed ? 'Informe o token de instalação e configure a primeira conta.' : 'Configure um token de instalação na hospedagem antes de criar o administrador.'
            : <>Acesse sua gestão e tenha o controle<br className="desktop-break" /> de cada cobrança.</>}</p>
        </div>
        <form onSubmit={submit} aria-busy={busy}>
          {setup && <>
            <div className="field reveal"><label htmlFor="bootstrap-token">Token de instalação</label><div className="input-wrap"><KeyRound aria-hidden="true" /><input id="bootstrap-token" name="bootstrap_token" required type="password" autoComplete="off" value={bootstrapToken} onChange={event => setBootstrapToken(event.target.value)} placeholder="Informe o token de instalação" /></div></div>
            <div className="field reveal"><label htmlFor="admin-name">Nome</label><div className="input-wrap"><UserRound aria-hidden="true" /><input id="admin-name" name="name" required autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Seu nome completo" /></div></div>
          </>}
          <div className="field reveal"><label htmlFor="login-username">Usuário</label><div className="input-wrap"><UserRound aria-hidden="true" /><input id="login-username" name="login" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={login} onChange={event => setLogin(event.target.value)} placeholder="Digite seu usuário" /></div></div>
          <div className="field reveal"><label htmlFor="login-password">Senha</label><div className="input-wrap"><LockKeyhole aria-hidden="true" /><input id="login-password" name="password" required type={showPassword ? 'text' : 'password'} autoComplete={setup ? 'new-password' : 'current-password'} minLength={setup ? 12 : undefined} value={password} onChange={event => setPassword(event.target.value)} placeholder={setup ? 'Crie uma senha com 12 ou mais caracteres' : 'Digite sua senha'} /><button className="password-toggle" type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div></div>
          {setup && <div className="field reveal"><label htmlFor="password-confirmation">Confirmação da senha</label><div className="input-wrap"><LockKeyhole aria-hidden="true" /><input id="password-confirmation" name="confirmation" required type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="Digite a senha novamente" /></div></div>}
          {error && <p ref={errorNode} role="alert" tabIndex={-1} className="login-error">{error}</p>}
          {notice && <p role="status" className="login-notice">{notice}</p>}
          {setup === null && !error && <p role="status" className="loading-status">Preparando seu acesso…</p>}
          {setup === null && error && <button type="button" className="retry" onClick={() => setStatusAttempt(value => value + 1)}>Tentar novamente</button>}
          <button className={`submit reveal${busy ? ' is-loading' : ''}`} type="submit" disabled={busy || setup === null || (setup && !setupAllowed)}><span>{busy ? 'Aguarde…' : setup ? 'Criar administrador' : 'Entrar no financeiro'}</span>{busy ? <span className="spinner" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}</button>
          <div className="secure-note reveal"><ShieldCheck aria-hidden="true" />Acesso restrito à equipe King Foods</div>
        </form>
        <footer className="card-footer"><span>ORGANIZAR. ACOMPANHAR. RECEBER.</span><span className="footer-mark" aria-hidden="true">↗</span></footer>
      </section>
    </main>
    <footer className="page-footer"><span>KING FOODS <i /> QUALIDADE ACIMA DE TUDO</span><span>TRINDADE · GOIÁS</span></footer>
  </div>;
}
