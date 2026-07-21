"use client";
/* eslint-disable @next/next/no-img-element -- local object URLs are used only for upload previews */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Script from "next/script";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, Camera, Check, ChevronLeft, ChevronRight, CircleUserRound,
  Compass, Heart, ImagePlus, LayoutDashboard, LockKeyhole, LogOut, Map,
  MapPin, Menu, MessageCircle, Plus, Search, Send, Settings2, ShieldCheck,
  Save, Share2, Sparkles, Star, Trash2, Upload, Users, X,
} from "lucide-react";
import ChinaMap from "@/components/china-map";
import { demoStories, plannedTrips, provinceStatus, type ProvinceStatus } from "@/data/demo";
import { createSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase/browser";

type View = "map" | "wall" | "notifications" | "profile" | "admin" | "admin-provinces" | "admin-story-new" | "admin-comments" | "admin-users" | "admin-photos" | "admin-plans" | "admin-optimize";
type AuthMode = "login" | "register" | "forgot";
type AppUser = { id?: string; email: string; name: string; avatarPath?: string | null; avatarUrl?: string; admin: boolean };
type AtlasStats = { visited: number; planned: number; stories: number; photos: number };
type ProvinceOption = { code: string; name: string; status: ProvinceStatus; expectedAt: string };
type ProvincePlan = { provinceCode: string; provinceName: string; expectedAt: string; wishes: string[] };
type AdminStoryRecord = {
  id: string; provinceCode: string; provinceName: string; title: string; slug: string;
  coverPath: string | null; coverUrl?: string; traveledAt: string; citySpots: string[]; body: string;
  verdict: "worth_it" | "depends" | "not_recommended"; rating: number;
  pros: string[]; cons: string[]; isPublished: boolean;
};
type PendingPhoto = { file: File; preview: string; captionTitle: string; captionStory: string };
type AtlasPhoto = { id: string; storagePath: string; url?: string; captionTitle: string; captionStory: string; sortOrder: number };
type AdminPhotoRecord = AtlasPhoto & { storyId: string; storyTitle: string };
type AtlasStory = {
  id: string; province: string; city: string; title: string; date: string; excerpt: string;
  body: string; rating: number; verdict: string; pros: string[]; cons: string[];
  tone: string; coverUrl?: string; photos: AtlasPhoto[];
};
type CommentTarget = "story" | "province" | "wall" | "plan";
type DisplayComment = {
  id: string; authorId: string; authorName: string; avatarUrl?: string; parentId: string | null;
  body: string; createdAt: string; images: Array<{ id: string; url: string }>;
};
type TurnstileApi = { render: (element: HTMLElement, options: Record<string, unknown>) => string; reset: (widgetId?: string) => void; remove: (widgetId: string) => void };

const initialDemoStories: AtlasStory[] = demoStories.map((story) => ({ ...story, body: story.excerpt, photos: [] }));
const initialPlans: Record<string, ProvincePlan> = Object.fromEntries(Object.entries(plannedTrips).map(([provinceName, wishes]) => [provinceName, { provinceCode: provinceName, provinceName, expectedAt: "等待一个合适的季节", wishes: [...wishes] }]));

const demoStats: AtlasStats = {
  visited: Object.values(provinceStatus).filter((status) => status === "visited").length,
  planned: Object.values(provinceStatus).filter((status) => status === "planned").length,
  stories: demoStories.length,
  photos: 24,
};
const emptyStats: AtlasStats = { visited: 0, planned: 0, stories: 0, photos: 0 };
const twoDigits = (value: number) => String(value).padStart(2, "0");
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const isAllowedImage = (file: File) => allowedImageTypes.has(file.type);
const immutableImageCache = "31536000";
const supabaseSignedImagePrefix = "https://cjabfhiukpjhvmdgfzpn.supabase.co/storage/v1/object/sign/";
const optimizedImageUrl = (url: string, width: 1200 | 1920 | 256 | 640, quality: 60 | 65 | 72 | 75) =>
  url.startsWith(supabaseSignedImagePrefix)
    ? `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`
    : url;

type ImageOptimizationOptions = {
  maxWidth: number;
  maxHeight: number;
  maxBytes: number;
  quality?: number;
  forceWebp?: boolean;
};

async function optimizeImageFile(file: File, options: ImageOptimizationOptions) {
  const bitmap = await createImageBitmap(file);
  try {
    const initialScale = Math.min(1, options.maxWidth / bitmap.width, options.maxHeight / bitmap.height);
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));
    let quality = options.quality ?? 0.8;
    let optimized: Blob | null = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法处理这张图片");
      context.drawImage(bitmap, 0, 0, width, height);
      optimized = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (!optimized) throw new Error("图片压缩失败");
      if (optimized.size <= options.maxBytes) break;
      quality = Math.max(0.52, quality - 0.07);
      width = Math.max(1, Math.round(width * 0.88));
      height = Math.max(1, Math.round(height * 0.88));
    }

    if (!optimized || (!options.forceWebp && optimized.size >= file.size && file.size <= options.maxBytes)) return file;
    const fileName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([optimized], `${fileName}.webp`, { type: "image/webp", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

const shortProvince = (name: string) => name.replace(/省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区/g, "");

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <div className="brand-mark"><Compass size={compact ? 18 : 22} /><span /></div>
      <div><strong>YOSUKE</strong><small>TRAVEL ATLAS</small></div>
    </div>
  );
}

function getAuthErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const lower = raw.toLowerCase();
  if (raw.includes("no captcha_token_found")) return "人机验证已失效，请重新完成验证后再试。";
  if (raw.includes("invalid-input-secret")) return "人机验证服务配置异常，请联系网站管理员。";
  if (raw.includes("otp_expired") || raw.includes("Email link is invalid or has expired")) return "此链接已失效或已被使用，请重新申请一封邮件。";
  if (lower.includes("token has expired") || lower.includes("token is invalid")) return "验证码无效或已过期，请重新申请。";
  if (lower.includes("code verifier") || lower.includes("pkce")) return "请在申请重置邮件的同一浏览器中打开最新链接。";
  if (lower.includes("invalid login credentials")) return "邮箱或密码不正确。";
  if (lower.includes("email not confirmed")) return "邮箱尚未验证，请先打开验证邮件。";
  if (lower.includes("email rate limit exceeded") || lower.includes("rate limit")) return "邮件发送过于频繁，请稍后再试。";
  if (lower.includes("user already registered")) return "该邮箱已经注册，请直接登录。";
  if (lower.includes("password should be")) return "密码强度不足，请至少使用 6 位字符。";
  return raw || "操作失败，请稍后再试。";
}

function AuthGate({ onEnter, initialMessage = "" }: { onEnter: (name: string, admin?: boolean) => void; initialMessage?: string }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileHost = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | undefined>(undefined);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!initialMessage) return;
    const task = window.setTimeout(() => setMessage(initialMessage), 0);
    return () => window.clearTimeout(task);
  }, [initialMessage]);

  useEffect(() => {
    const api = (window as Window & { turnstile?: TurnstileApi }).turnstile;
    if (!turnstileSiteKey || !turnstileReady || !api || !turnstileHost.current || turnstileWidgetId.current) return;
    turnstileWidgetId.current = api.render(turnstileHost.current, {
      sitekey: turnstileSiteKey, theme: "dark", size: "flexible", language: "zh-cn",
      callback: (token: string) => { setCaptchaToken(token); setMessage(""); },
      "expired-callback": () => { setCaptchaToken(""); setMessage("人机验证已过期，请重新完成。 "); },
      "error-callback": () => { setCaptchaToken(""); setMessage("人机验证加载失败，请刷新后重试。"); },
    });
    return () => {
      if (turnstileWidgetId.current) api.remove(turnstileWidgetId.current);
      turnstileWidgetId.current = undefined;
    };
  }, [turnstileReady, turnstileSiteKey]);

  function resetCaptcha() {
    setCaptchaToken("");
    const api = (window as Window & { turnstile?: TurnstileApi }).turnstile;
    if (api && turnstileWidgetId.current) api.reset(turnstileWidgetId.current);
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage("");
    resetCaptcha();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    if (mode === "register" && password !== confirmPassword) {
      setMessage("两次输入的密码不一致。");
      setBusy(false);
      return;
    }
    if (turnstileSiteKey && !captchaToken) {
      setMessage("请先完成人机验证。");
      setBusy(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    try {
      if (!supabase) {
        setTimeout(() => onEnter(name || email.split("@")[0] || "旅行朋友", email === "admin@yosuke.demo"), 450);
        return;
      }
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name }, captchaToken } });
        if (error) throw error;
        setMessage("验证邮件已发送，请完成邮箱验证后登录。 ");
        resetCaptcha();
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password`, captchaToken });
        if (error) throw error;
        setMessage("重置邮件已发送，请只使用最新邮件中的确认按钮。 ");
        resetCaptcha();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
      resetCaptcha();
    } finally {
      setBusy(false);
    }
  }

  return (
    <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={() => setTurnstileReady(true)} />
    <main className="auth-page">
      <div className="auth-noise" />
      <div className="auth-halo auth-halo-a" />
      <div className="auth-halo auth-halo-b" />
      <header className="auth-header"><Brand /><span className="privacy-chip"><LockKeyhole size={13} />仅注册成员可见</span></header>
      <section className="auth-story">
        <div className="eyebrow"><span />YOSUKE&apos;S PRIVATE TRAVEL ARCHIVE</div>
        <h1>走过的地方，<br /><em>都有回声。</em></h1>
        <p>一张只对朋友开放的中国足迹地图。<br />这里收藏风景，也收藏与人相遇的瞬间。</p>
        <div className="auth-coordinates"><span>31.2304° N</span><i /><span>121.4737° E</span></div>
      </section>
      <section className="auth-card glass-panel">
        <div className="auth-card-top">
          <div><small>WELCOME TO THE ATLAS</small><h2>{mode === "login" ? "再次出发" : mode === "register" ? "加入足迹" : "找回密码"}</h2></div>
          <div className="auth-index">01</div>
        </div>
        <form onSubmit={submit}>
          {mode === "register" && <label>昵称<input required autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} placeholder="朋友们会看到的名字" /></label>}
          <label>邮箱<input required autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>
          {mode !== "forgot" && <label className="password-label"><span>密码<button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "隐藏" : "显示"}</button></span><input required minLength={6} autoComplete={mode === "register" ? "new-password" : "current-password"} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位字符" /></label>}
          {mode === "register" && <label>确认密码<input required minLength={6} autoComplete="new-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入密码" /></label>}
          {turnstileSiteKey ? <div className="turnstile-wrap" ref={turnstileHost} /> : mode === "register" && <div className="human-check"><ShieldCheck size={18} /><div><strong>安全注册</strong><small>部署前需要配置 Turnstile</small></div><Check size={16} /></div>}
          {message && <div className="form-message">{message}</div>}
          <button className="primary-button auth-submit" disabled={busy} type="submit">
            {busy ? "正在确认…" : mode === "login" ? "进入足迹地图" : mode === "register" ? "创建账号" : "发送重置邮件"}<ArrowRight size={17} />
          </button>
        </form>
        <div className="auth-switch">
          {mode === "login" ? <><button onClick={() => switchMode("forgot")}>忘记密码</button><span />还没有账号？<button onClick={() => switchMode("register")}>立即注册</button></> : <button onClick={() => switchMode("login")}><ArrowLeft size={14} />返回登录</button>}
        </div>
        {!hasSupabaseEnv && <button className="demo-enter" onClick={() => onEnter("Yosuke", true)}><Sparkles size={15} />直接进入交互演示</button>}
      </section>
      <footer className="auth-footer"><span>PRIVATE BY DESIGN</span><span>© 2026 YOSUKE&apos;S ATLAS</span></footer>
    </main></>
  );
}

function PasswordRecoveryPage({ tokenHash, onTokenConsumed, onComplete, onCancel }: { tokenHash?: string; onTokenConsumed: () => void; onComplete: (message: string) => void; onCancel: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState(!tokenHash);

  async function verifyRecoveryLink() {
    if (!tokenHash) return;
    setBusy(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = supabase ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }) : { error: new Error("Supabase 尚未连接") };
    if (error) {
      setMessage(getAuthErrorMessage(error));
      setBusy(false);
      return;
    }
    setVerified(true);
    setBusy(false);
    onTokenConsumed();
    window.history.replaceState({}, "", "/reset-password");
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 6) { setMessage("新密码至少需要 6 位字符。"); return; }
    if (password !== confirmPassword) { setMessage("两次输入的新密码不一致。"); return; }
    setBusy(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = supabase ? await supabase.auth.updateUser({ password }) : { error: new Error("Supabase 尚未连接") };
    if (error) {
      setMessage(getAuthErrorMessage(error));
      setBusy(false);
      return;
    }
    await supabase?.auth.signOut();
    window.history.replaceState({}, "", "/login");
    onComplete("密码已重置，请使用新密码登录。 ");
  }

  return <main className="auth-page">
    <div className="auth-noise" /><div className="auth-halo auth-halo-a" /><div className="auth-halo auth-halo-b" />
    <header className="auth-header"><Brand /><span className="privacy-chip"><LockKeyhole size={13} />安全重置密码</span></header>
    <section className="auth-story"><div className="eyebrow"><span />SECURE RECOVERY</div><h1>重新启程，<br /><em>从新密码开始。</em></h1><p>{verified ? <>恢复链接验证成功。<br />设置一个新的密码后即可重新登录。</> : <>为了防止邮件程序提前打开链接，<br />请亲自确认后再继续设置新密码。</>}</p></section>
    <section className="auth-card glass-panel">
      <div className="auth-card-top"><div><small>WELCOME BACK</small><h2>{verified ? "设置新密码" : "确认密码重置"}</h2></div><div className="auth-index">02</div></div>
      {verified ? <form onSubmit={savePassword}>
        <label className="password-label"><span>新密码<button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "隐藏" : "显示"}</button></span><input required minLength={6} autoComplete="new-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位字符" /></label>
        <label>确认新密码<input required minLength={6} autoComplete="new-password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入新密码" /></label>
        {message && <div className="form-message" role="status">{message}</div>}
        <button className="primary-button auth-submit" disabled={busy} type="submit">{busy ? "正在保存…" : "保存新密码"}<ArrowRight size={17} /></button>
      </form> : <div className="recovery-confirmation"><ShieldCheck size={30} /><p>点击下方按钮后才会验证这次重置请求。此操作只能完成一次。</p>{message && <div className="form-message" role="status">{message}</div>}<button className="primary-button auth-submit" disabled={busy} onClick={() => void verifyRecoveryLink()}>{busy ? "正在验证…" : "确认并继续"}<ArrowRight size={17} /></button></div>}
      <div className="auth-switch"><button onClick={() => void onCancel()}><ArrowLeft size={14} />取消并返回登录</button></div>
    </section>
    <footer className="auth-footer"><span>PRIVATE BY DESIGN</span><span>© 2026 YOSUKE&apos;S ATLAS</span></footer>
  </main>;
}

function Sidebar({ view, setView, name, avatarUrl, admin, unreadCount, onSearch, onLogout }: { view: View; setView: (v: View) => void; name: string; avatarUrl?: string; admin: boolean; unreadCount: number; onSearch: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const nav = [
    ["map", Map, "足迹地图"], ["wall", MessageCircle, "朋友留言墙"], ["notifications", Bell, "通知中心"], ["profile", CircleUserRound, "个人中心"],
  ] as const;
  return <>
    <button className="mobile-menu" aria-label="打开导航菜单" onClick={() => setOpen(true)}><Menu /></button>
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <button className="sidebar-close" aria-label="关闭导航菜单" onClick={() => setOpen(false)}><X /></button>
      <Brand compact />
      <nav>{nav.map(([key, Icon, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => { setView(key); setOpen(false); }}><Icon size={19} /><span>{label}</span>{key === "notifications" && unreadCount > 0 && <i>{unreadCount > 99 ? "99+" : unreadCount}</i>}</button>)}<button onClick={() => { onSearch(); setOpen(false); }}><Search size={19} /><span>搜索</span></button></nav>
      {admin && <div className="admin-nav"><small>OWNER SPACE</small><button className={view.startsWith("admin") ? "active" : ""} onClick={() => { setView("admin"); setOpen(false); }}><LayoutDashboard size={19} /><span>管理后台</span></button></div>}
      <div className="sidebar-user"><div className="avatar">{avatarUrl ? <img src={optimizedImageUrl(avatarUrl, 256, 60)} alt="" /> : name.slice(0, 1).toUpperCase()}</div><div><strong>{name}</strong><small>{admin ? "地图主人" : "旅行朋友"}</small></div><button className="logout-button" onClick={onLogout} aria-label="退出登录" title="退出登录"><LogOut size={17} /><span>退出登录</span></button></div>
    </aside>
    {open && <button aria-label="关闭菜单" className="sidebar-backdrop" onClick={() => setOpen(false)} />}
  </>;
}

function StoryCard({ story, onOpen }: { story: AtlasStory; onOpen: () => void }) {
  return <article className={`story-card story-${story.tone}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }}>
    <div className="story-visual">{story.coverUrl && <Image src={story.coverUrl} alt="" fill sizes="(max-width: 760px) 100vw, 42vw" quality={65} />}<span>TRAVEL JOURNAL</span><MapPin size={22} /></div>
    <div className="story-card-body"><div className="story-meta"><span>{story.date}</span><span>{story.city}</span></div><h3>{story.title}</h3><p>{story.excerpt}</p><div className="story-card-footer"><div className="story-card-labels"><span className="story-verdict">{story.verdict}</span>{story.pros[0] && <span className="story-feature-tag">{story.pros[0]}</span>}</div><div className="story-card-stars" aria-label={`${story.rating} 星评分`}>{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} fill={i < story.rating ? "currentColor" : "none"} />)}</div><button aria-label="查看故事"><ArrowRight size={17} /></button></div></div>
  </article>;
}

function ProvinceQuickLinks({ statuses, onProvince }: { statuses: Record<string, ProvinceStatus>; onProvince: (name: string, status: ProvinceStatus) => void }) {
  const [filter, setFilter] = useState<"all" | "visited" | "planned">("all");
  const destinations = Object.entries(statuses).filter((entry): entry is [string, Exclude<ProvinceStatus, "unplanned">] => entry[1] !== "unplanned");
  const filteredDestinations = filter === "all" ? destinations : destinations.filter(([, status]) => status === filter);
  return <section className="province-quick-links" aria-label="可访问省份快捷入口">
    <div><span className="section-index">QUICK ACCESS</span><strong>快速前往</strong></div>
    <div className="quick-filter" aria-label="筛选省份状态"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button><button className={filter === "visited" ? "active" : ""} onClick={() => setFilter("visited")}>已去过</button><button className={filter === "planned" ? "active" : ""} onClick={() => setFilter("planned")}>计划</button></div>
    <div className="quick-link-list">{filteredDestinations.map(([name, status]) => <button key={name} className={`quick-link quick-link-${status}`} onClick={() => onProvince(name, status)}><i />{shortProvince(name)}<small>{status === "visited" ? "已去过" : "计划"}</small></button>)}</div>
  </section>;
}

function MapHome({ statuses, stats, stories, usingDemoData, onProvince, onStory, onNavigate, onSearch }: { statuses: Record<string, ProvinceStatus>; stats: AtlasStats; stories: AtlasStory[]; usingDemoData: boolean; onProvince: (name: string, status: ProvinceStatus) => void; onStory: (id: string) => void; onNavigate: (view: View) => void; onSearch: () => void }) {
  return <div className="page map-page">
    <header className="page-header"><div><div className="eyebrow"><span />PRIVATE TRAVEL ARCHIVE · 2026</div><h1>我的足迹，<em>仍在生长。</em></h1></div><div className="header-actions"><button className="icon-button" aria-label="搜索旅行内容" title="搜索" onClick={onSearch}><Search size={18} /></button><button className="icon-button notification-button" aria-label="打开通知中心" title="打开通知中心" onClick={() => onNavigate("notifications")}><Bell size={18} /><i /></button></div></header>
    <section className="map-dashboard glass-panel">
      <div className="map-copy"><span className="section-index">01 / MAP</span><h2>中国足迹坐标</h2><p>选择发光的省份，打开一段真实的旅途记忆。</p></div>
      <ChinaMap statuses={statuses} onSelect={onProvince} />
      <div className="map-stats"><div><small>已去过</small><strong>{twoDigits(stats.visited)}</strong><span>PROVINCES</span></div><div><small>计划前往</small><strong>{twoDigits(stats.planned)}</strong><span>ON THE LIST</span></div><div><small>旅行故事</small><strong>{twoDigits(stats.stories)}</strong><span>JOURNALS</span></div><div><small>珍藏照片</small><strong>{twoDigits(stats.photos)}</strong><span>MOMENTS</span></div></div>
    </section>
    <ProvinceQuickLinks statuses={statuses} onProvince={onProvince} />
    <section className="recent-section"><div className="section-heading"><div><span className="section-index">02 / RECENT</span><h2>最近的旅途</h2></div><span className="section-count">共 {stories.length} 篇</span></div>{stories.length ? <div className="story-grid">{stories.map((story) => <StoryCard story={story} key={story.id} onOpen={() => onStory(story.id)} />)}</div> : <div className="content-empty glass-panel"><Compass size={24} /><strong>还没有已发布的旅行故事</strong><p>前往管理后台发布第一篇记录后，它会出现在这里。</p></div>}</section>
    {usingDemoData && <div className="demo-note"><Sparkles size={15} />数据库尚无省份基础数据，当前暂时显示演示状态。</div>}
  </div>;
}

function SearchOverlay({ statuses, stories, onClose, onProvince, onStory }: { statuses: Record<string, ProvinceStatus>; stories: AtlasStory[]; onClose: () => void; onProvince: (name: string, status: ProvinceStatus) => void; onStory: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const provinceResults = normalized ? Object.entries(statuses).filter(([name, status]) => status !== "unplanned" && name.toLowerCase().includes(normalized)) : [];
  const storyResults = normalized ? stories.filter((story) => [story.title, story.province, story.city, story.body, ...story.pros, ...story.cons].join(" ").toLowerCase().includes(normalized)) : [];
  return <div className="search-overlay"><button className="modal-backdrop" onClick={onClose} aria-label="关闭搜索" /><section className="search-dialog glass-panel" data-focus-layer tabIndex={-1}><div className="search-input-row"><Search size={21} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索省份、城市、景点、标签或故事全文" /><button onClick={onClose} aria-label="关闭搜索"><X /></button></div>{!normalized ? <div className="search-hint">输入关键词开始搜索</div> : <div className="search-results"><div><small>省份 · {provinceResults.length}</small>{provinceResults.map(([name, status]) => <button key={name} onClick={() => onProvince(name, status)}><MapPin /><span><strong>{name}</strong><small>{status === "visited" ? "已去过" : "计划前往"}</small></span><ChevronRight /></button>)}</div><div><small>故事 · {storyResults.length}</small>{storyResults.map((story) => <button key={story.id} onClick={() => onStory(story.id)}><Compass /><span><strong>{story.title}</strong><small>{story.province} · {story.city}</small></span><ChevronRight /></button>)}</div>{!provinceResults.length && !storyResults.length && <div className="search-hint">没有找到相关内容</div>}</div>}</section></div>;
}

function ProvincePanel({ province, status, plan, allStories, user, onClose, onStory }: { province: string; status: ProvinceStatus; plan?: ProvincePlan; allStories: AtlasStory[]; user: AppUser; onClose: () => void; onStory: (id: string) => void }) {
  const stories = allStories.filter((item) => item.province === province);
  const wishes = plan?.wishes || [];
  const photoCount = stories.reduce((total, item) => total + item.photos.length, 0);
  const averageRating = stories.length ? (stories.reduce((total, item) => total + item.rating, 0) / stories.length).toFixed(1) : "—";
  return <div className="modal-shell"><button className="modal-backdrop" onClick={onClose} aria-label="关闭" /><section className="province-panel glass-panel" role="dialog" aria-modal="true" aria-label={`${shortProvince(province)}省份详情`} data-focus-layer tabIndex={-1}><button className="panel-close" onClick={onClose} aria-label="关闭省份详情"><X /></button><div className="province-hero"><small>{status === "visited" ? "VISITED PROVINCE" : "NEXT DESTINATION"}</small><h2>{shortProvince(province)}</h2><p>{status === "visited" ? "山川、街巷，以及那些只属于当时的风。" : "把想去的地方写下来，出发就有了方向。"}</p></div>{status === "visited" ? <><div className="panel-summary"><div><strong>{stories.length}</strong><small>旅行故事</small></div><div><strong>{photoCount}</strong><small>照片记录</small></div><div><strong>{averageRating}</strong><small>综合评分</small></div></div><div className="panel-content"><h3>旅行记录</h3>{stories.length ? stories.map((story) => <button className="panel-story" key={story.id} onClick={() => onStory(story.id)}>{story.coverUrl ? <Image className="mini-cover-image" src={story.coverUrl} alt="" width={68} height={58} sizes="68px" quality={60} /> : <div className={`mini-cover ${story.tone}`} />}<div><small>{story.date}</small><strong>{story.title}</strong><span>{story.city}</span></div><ChevronRight /></button>) : <div className="empty-state">该省份还没有已发布的故事</div>}<CommentComposer user={user} targetType="province" targetId={province} compact /></div></> : <div className="panel-content"><h3>旅行愿望清单</h3><div className="wish-list">{wishes.map((wish, index) => <div key={`${wish}-${index}`}><span>{twoDigits(index + 1)}</span><strong>{wish}</strong><Check size={15} /></div>)}{!wishes.length && <div className="empty-state">愿望清单还在酝酿中</div>}</div><div className="plan-time"><small>预计出行时间</small><strong>{plan?.expectedAt || "时间待定"}</strong></div><CommentComposer user={user} targetType="plan" targetId={province} compact title="朋友推荐区" /></div>}</section></div>;
}

function StoryDetail({ id, stories, user, onClose }: { id: string; stories: AtlasStory[]; user: AppUser; onClose: () => void }) {
  const story = stories.find((item) => item.id === id);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [resolvedPhotos, setResolvedPhotos] = useState<AtlasPhoto[]>(() => story?.photos || []);
  const [photosLoading, setPhotosLoading] = useState(() => Boolean(story?.photos.some((photo) => !photo.url && photo.storagePath)));
  const displayPhotos = useMemo(
    () => resolvedPhotos.filter((photo): photo is AtlasPhoto & { url: string } => Boolean(photo.url)),
    [resolvedPhotos],
  );
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!story) return;
    let cancelled = false;
    const missing = story.photos.filter((photo) => !photo.url && photo.storagePath);
    queueMicrotask(() => {
      if (cancelled) return;
      setLightboxIndex(null);
      setResolvedPhotos(story.photos);
      setPhotosLoading(missing.length > 0);
    });
    if (!missing.length) return;
    const loadPhotos = async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) setPhotosLoading(false);
        return;
      }
      const { data } = await supabase.storage.from("travel-media").createSignedUrls(missing.map((photo) => photo.storagePath), 60 * 60);
      if (cancelled) return;
      const urls = new globalThis.Map((data || []).filter((item) => item.path && item.signedUrl).map((item) => [item.path!, item.signedUrl!]));
      setResolvedPhotos(story.photos.map((photo) => ({ ...photo, url: photo.url || urls.get(photo.storagePath) })));
      setPhotosLoading(false);
    };
    void loadPhotos();
    return () => { cancelled = true; };
  }, [story]);

  const closeLightbox = useCallback(() => {
    const closingIndex = lightboxIndex;
    setLightboxIndex(null);
    if (closingIndex !== null) {
      window.setTimeout(() => document.querySelector<HTMLElement>(`[aria-label="放大查看第 ${closingIndex + 1} 张照片"]`)?.focus(), 0);
    }
  }, [lightboxIndex]);
  const showPreviousPhoto = useCallback(() => {
    if (!displayPhotos.length) return;
    setLightboxIndex((current) => current === null ? 0 : (current - 1 + displayPhotos.length) % displayPhotos.length);
  }, [displayPhotos.length]);
  const showNextPhoto = useCallback(() => {
    if (!displayPhotos.length) return;
    setLightboxIndex((current) => current === null ? 0 : (current + 1) % displayPhotos.length);
  }, [displayPhotos.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    window.setTimeout(() => document.querySelector<HTMLElement>(".story-lightbox-top button")?.focus(), 0);
    const handleLightboxKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLightbox();
      else if (event.key === "ArrowLeft") showPreviousPhoto();
      else if (event.key === "ArrowRight") showNextPhoto();
    };
    window.addEventListener("keydown", handleLightboxKeys);
    return () => window.removeEventListener("keydown", handleLightboxKeys);
  }, [closeLightbox, lightboxIndex, showNextPhoto, showPreviousPhoto]);

  const handleStoryScroll = () => {
    const element = overlayRef.current;
    if (!element) return;
    const available = element.scrollHeight - element.clientHeight;
    setScrollProgress(available > 0 ? Math.min(100, Math.max(0, element.scrollTop / available * 100)) : 0);
    setShowBackToTop(element.scrollTop > Math.max(700, element.clientHeight * .8));
  };

  const shareStory = async () => {
    const shareData = { title: story?.title || "Yosuke 的旅行故事", text: story?.excerpt || "", url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        setShareMessage("链接已复制");
        window.setTimeout(() => setShareMessage(""), 2200);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareMessage("分享失败，请稍后重试");
      window.setTimeout(() => setShareMessage(""), 2200);
    }
  };

  if (!story) return null;
  const activePhoto = lightboxIndex === null ? null : displayPhotos[lightboxIndex];
  return <div className="story-overlay" ref={overlayRef} onScroll={handleStoryScroll}>
    <div className="story-progress" aria-hidden="true"><span style={{ width: `${scrollProgress}%` }} /></div>
    <nav className="story-toolbar" aria-label="故事工具栏">
      <button onClick={onClose} aria-label="返回地图"><ArrowLeft /><span>返回地图</span></button>
      <button onClick={() => void shareStory()} aria-label="分享故事"><Share2 /><span>分享</span></button>
    </nav>
    {shareMessage && <div className="story-toast" role="status">{shareMessage}</div>}
    <div className={`story-hero-large story-${story.tone}`}>{story.coverUrl && <Image className="story-hero-image" src={story.coverUrl} alt="" fill sizes="100vw" quality={72} priority />}<div className="hero-mountain mountain-one" /><div className="hero-mountain mountain-two" /><div className="story-title-block"><div className="eyebrow"><span />{story.city}</div><h1>{story.title}</h1><p>{story.date}</p></div><span className="scroll-hint">SCROLL TO EXPLORE <i /></span></div>
    <article className="story-article">
      <div className="story-lead"><span>01</span><p>{story.body}</p></div>
      {photosLoading && <div className="story-photo-loading" role="status"><span />正在加载照片故事…</div>}
      {displayPhotos.length > 0 && <section className="photo-story-list">{displayPhotos.map((photo, index) => <article className="photo-story-entry" key={photo.id}>
        <button className="story-photo-button" onClick={() => setLightboxIndex(index)} aria-label={`放大查看第 ${index + 1} 张照片`}>
          <img src={optimizedImageUrl(photo.url, 1200, 72)} alt={photo.captionTitle || `旅行照片 ${index + 1}`} loading="lazy" decoding="async" />
          <span>查看大图</span>
        </button>
        <div><small>PHOTO STORY · {twoDigits(index + 1)}</small>{photo.captionTitle && <h3>{photo.captionTitle}</h3>}{photo.captionStory && <p>{photo.captionStory}</p>}</div>
      </article>)}</section>}
      <section className="rating-card glass-panel"><div><small>YOSUKE&apos;S VERDICT</small><h2>{story.verdict}</h2><div className="rating-stars">{Array.from({ length: 5 }).map((_, i) => <Star key={i} fill={i < story.rating ? "currentColor" : "none"} />)}</div></div><div><h3>旅行评价</h3><div className="tag-row">{story.pros.map((tag) => <span className="positive" key={tag}>+ {tag}</span>)}{story.cons.map((tag) => <span className="negative" key={tag}>− {tag}</span>)}</div><p>{story.excerpt}</p></div></section>
      <StoryLikeButton storyId={story.id} userId={user.id} />
      <CommentComposer user={user} targetType="story" targetId={story.id} title="故事评论" />
    </article>
    {showBackToTop && <button className="story-to-top" onClick={() => overlayRef.current?.scrollTo({ top: 0, behavior: "smooth" })} aria-label="返回故事顶部"><ArrowUp /><span>顶部</span></button>}
    {activePhoto?.url && <div className="story-lightbox" data-focus-layer role="dialog" aria-modal="true" aria-label={`照片 ${lightboxIndex! + 1}，共 ${displayPhotos.length} 张`}>
      <button className="story-lightbox-backdrop" onClick={closeLightbox} aria-label="关闭照片浏览" />
      <div className="story-lightbox-stage" onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
        if (touchStartX.current === null) return;
        const distance = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
        if (Math.abs(distance) > 50) {
          if (distance > 0) showPreviousPhoto();
          else showNextPhoto();
        }
        touchStartX.current = null;
      }}>
        <img src={optimizedImageUrl(activePhoto.url, 1920, 75)} alt={activePhoto.captionTitle || `旅行照片 ${lightboxIndex! + 1}`} />
        {(activePhoto.captionTitle || activePhoto.captionStory) && <div className="story-lightbox-caption">{activePhoto.captionTitle && <strong>{activePhoto.captionTitle}</strong>}{activePhoto.captionStory && <p>{activePhoto.captionStory}</p>}</div>}
      </div>
      <div className="story-lightbox-top"><span>{twoDigits(lightboxIndex! + 1)} / {twoDigits(displayPhotos.length)}</span><button onClick={closeLightbox} aria-label="关闭照片浏览"><X /></button></div>
      {displayPhotos.length > 1 && <><button className="story-lightbox-arrow story-lightbox-previous" onClick={showPreviousPhoto} aria-label="上一张照片"><ChevronLeft /></button><button className="story-lightbox-arrow story-lightbox-next" onClick={showNextPhoto} aria-label="下一张照片"><ChevronRight /></button></>}
    </div>}
  </div>;
}

function CommentComposer({ user, targetType, targetId, compact = false, title = "省份留言" }: { user: AppUser; targetType: CommentTarget; targetId: string; compact?: boolean; title?: string }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Array<{ file: File; preview: string }>>([]);
  const [comments, setComments] = useState<DisplayComment[]>([]);
  const [replyTo, setReplyTo] = useState<DisplayComment>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadedStoryImageCount = targetType === "story" ? comments.filter((comment) => comment.authorId === user.id).reduce((total, comment) => total + comment.images.length, 0) : 0;
  const selectedImageCount = targetType === "story" ? uploadedStoryImageCount + files.length : files.length;
  const imageLimitReached = selectedImageCount >= 2;

  const loadComments = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.from("comments").select("id, author_id, parent_id, body, created_at, profiles(display_name, avatar_path), comment_images(id, storage_path)").eq("target_type", targetType).eq("target_id", targetId).order("created_at", { ascending: true });
    if (error) { setMessage(`评论加载失败：${error.message}`); setLoading(false); return; }
    const rows = (data || []) as unknown as Array<{ id: string; author_id: string; parent_id: string | null; body: string; created_at: string; profiles: { display_name: string; avatar_path: string | null } | Array<{ display_name: string; avatar_path: string | null }>; comment_images: Array<{ id: string; storage_path: string }> }>;
    const avatarPaths = Array.from(new Set(rows.map((row) => (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.avatar_path).filter((path): path is string => Boolean(path))));
    const imagePaths = rows.flatMap((row) => row.comment_images.map((image) => image.storage_path));
    const avatarUrls: Record<string, string> = {};
    const imageUrls: Record<string, string> = {};
    if (avatarPaths.length) {
      const { data: signed } = await supabase.storage.from("avatars").createSignedUrls(avatarPaths, 60 * 60);
      for (const item of signed || []) if (item.path && item.signedUrl) avatarUrls[item.path] = item.signedUrl;
    }
    if (imagePaths.length) {
      const { data: signed } = await supabase.storage.from("comment-media").createSignedUrls(imagePaths, 60 * 60);
      for (const item of signed || []) if (item.path && item.signedUrl) imageUrls[item.path] = item.signedUrl;
    }
    setComments(rows.map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return { id: row.id, authorId: row.author_id, authorName: profile?.display_name || "旅行朋友", avatarUrl: profile?.avatar_path ? avatarUrls[profile.avatar_path] : undefined, parentId: row.parent_id, body: row.body, createdAt: row.created_at, images: row.comment_images.map((image) => ({ id: image.id, url: imageUrls[image.storage_path] })).filter((image) => Boolean(image.url)) };
    }));
    setLoading(false);
  }, [targetId, targetType]);

  useEffect(() => {
    const task = window.setTimeout(() => void loadComments(), 0);
    return () => window.clearTimeout(task);
  }, [loadComments]);

  async function chooseFiles(list: FileList | null) {
    if (!list) return;
    const remaining = targetType === "story" ? Math.max(0, 2 - uploadedStoryImageCount - files.length) : Math.max(0, 2 - files.length);
    const candidates = Array.from(list);
    const hasInvalidType = candidates.some((file) => !isAllowedImage(file));
    const selected = candidates.filter((file) => isAllowedImage(file) && file.size <= 5 * 1024 * 1024).slice(0, remaining);
    try {
      const optimized = await Promise.all(selected.map((file) => optimizeImageFile(file, { maxWidth: 1280, maxHeight: 1280, maxBytes: 450 * 1024, quality: 0.76 })));
      setFiles((current) => [...current, ...optimized.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片压缩失败，请更换图片后重试。");
      return;
    }
    if (hasInvalidType) setMessage("仅支持 JPG、PNG 或 WebP 图片。");
    else if (selected.length !== list.length) setMessage(targetType === "story" ? "每位用户在每篇故事下累计最多上传2张图片，单张不超过5MB。" : "每条留言最多上传2张图片，单张不超过5MB。");
  }

  async function send() {
    if (!user.id || !text.trim()) { setMessage("请先填写留言内容。"); return; }
    setBusy(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setMessage("发送失败：Supabase 尚未连接"); setBusy(false); return; }
    const { data: comment, error } = await supabase.from("comments").insert({ author_id: user.id, target_type: targetType, target_id: targetId, parent_id: replyTo?.id || null, body: text.trim() }).select("id").single();
    if (error) { setMessage(`发送失败：${error.message}`); setBusy(false); return; }
    for (const [index, item] of files.entries()) {
      const extension = item.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${comment.id}/image-${Date.now()}-${index}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("comment-media").upload(path, item.file, { contentType: item.file.type, cacheControl: immutableImageCache });
      if (uploadError) { setMessage(`留言已发送，但图片上传失败：${uploadError.message}`); break; }
      const { error: imageError } = await supabase.from("comment_images").insert({ comment_id: comment.id, owner_id: user.id, storage_path: path });
      if (imageError) { await supabase.storage.from("comment-media").remove([path]); setMessage(`留言已发送，但图片记录失败：${imageError.message}`); break; }
    }
    files.forEach((item) => URL.revokeObjectURL(item.preview));
    setText(""); setFiles([]); setReplyTo(undefined); setBusy(false);
    await loadComments();
  }

  return <section className={`comments ${compact ? "comments-compact" : ""}`}><div className="comments-heading"><div><MessageCircle size={19} /><h3>{title}</h3></div><span>{comments.length} 条</span></div><div className="comment-list">{loading && <div className="empty-state">正在读取留言…</div>}{!loading && !comments.length && <div className="empty-state">还没有留言，来写第一条吧。</div>}{comments.map((comment) => <div className={`comment ${comment.parentId ? "comment-reply" : ""}`} key={comment.id}><div className="avatar small">{comment.avatarUrl ? <img src={optimizedImageUrl(comment.avatarUrl, 256, 60)} alt="" /> : comment.authorName.slice(0, 1)}</div><div><strong>{comment.authorName} <small>{new Date(comment.createdAt).toLocaleString("zh-CN")}</small></strong><p>{comment.body}</p>{comment.images.length > 0 && <div className="comment-images">{comment.images.map((image) => <img key={image.id} src={optimizedImageUrl(image.url, 640, 65)} alt="留言图片" loading="lazy" decoding="async" />)}</div>}<button onClick={() => setReplyTo(comment)}>回复</button></div></div>)}</div><div className="comment-box">{replyTo && <div className="reply-indicator">回复 {replyTo.authorName}<button onClick={() => setReplyTo(undefined)}><X size={13} /></button></div>}<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="写下你的想法…" rows={compact ? 2 : 3} />{files.length > 0 && <div className="upload-previews">{files.map((item) => <img key={item.preview} src={item.preview} alt="待上传预览" />)}</div>}{message && <div className="comment-message" role="status">{message}</div>}<div><input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void chooseFiles(event.target.files)} /><button onClick={() => fileRef.current?.click()} disabled={busy || imageLimitReached}><ImagePlus size={17} />图片 <small>{selectedImageCount}/2</small></button><button className="send-button" onClick={() => void send()} disabled={busy}><Send size={16} />{busy ? "发送中…" : "发送"}</button></div></div></section>;
}

function StoryLikeButton({ storyId, userId }: { storyId: string; userId?: string }) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const loadLikes = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const { data, error } = await supabase.from("story_likes").select("user_id").eq("story_id", storyId);
    if (error) { setMessage(`点赞状态读取失败：${error.message}`); return; }
    setCount(data?.length || 0);
    setLiked(Boolean(userId && data?.some((item) => item.user_id === userId)));
  }, [storyId, userId]);
  useEffect(() => { const task = window.setTimeout(() => void loadLikes(), 0); return () => window.clearTimeout(task); }, [loadLikes]);
  async function toggle() {
    if (!userId || busy) return;
    setBusy(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setMessage("点赞失败：Supabase 尚未连接"); setBusy(false); return; }
    const { error } = liked
      ? await supabase.from("story_likes").delete().eq("story_id", storyId).eq("user_id", userId)
      : await supabase.from("story_likes").insert({ story_id: storyId, user_id: userId });
    if (error) setMessage(`点赞失败：${error.message}`);
    else await loadLikes();
    setBusy(false);
  }
  return <><button className={`like-button ${liked ? "liked" : ""}`} onClick={() => void toggle()} disabled={busy}><Heart fill={liked ? "currentColor" : "none"} />{liked ? "已喜欢这段旅途" : "喜欢这段旅途"}<span>{count}</span></button>{message && <div className="interaction-message" role="status">{message}</div>}</>;
}

function WallPage({ user }: { user: AppUser }) { return <div className="page narrow-page"><header className="page-header"><div><div className="eyebrow"><span />FRIENDS ONLY</div><h1>朋友留言墙</h1><p>不必关于某一段旅行，想说什么都可以。</p></div></header><div className="wall-feature glass-panel"><div className="wall-orbit" /><span>MESSAGE WALL</span><h2>“路很远，<br />朋友一直都在。”</h2></div><CommentComposer user={user} targetType="wall" targetId="wall" title="所有留言" /></div>; }

function NotificationPage({ user, onNavigate, onUnreadChange }: { user: AppUser; onNavigate: (url: string) => void; onUnreadChange: (count: number) => void }) {
  const [notices, setNotices] = useState<Array<{ id: string; kind: string; target_url: string; message: string; read_at: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const loadNotices = useCallback(async () => {
    if (!user.id) return;
    const supabase = createSupabaseBrowserClient();
    const { data, error } = supabase ? await supabase.from("notifications").select("id, kind, target_url, message, read_at, created_at").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(100) : { data: null, error: new Error("Supabase 尚未连接") };
    if (error) setMessage(`通知加载失败：${error.message}`);
    else { setNotices(data || []); onUnreadChange((data || []).filter((notice) => !notice.read_at).length); }
    setLoading(false);
  }, [onUnreadChange, user.id]);
  useEffect(() => { const task = window.setTimeout(() => void loadNotices(), 0); return () => window.clearTimeout(task); }, [loadNotices]);
  async function markAllRead() {
    if (!user.id) return;
    const supabase = createSupabaseBrowserClient();
    const { error } = supabase ? await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id).is("read_at", null) : { error: new Error("Supabase 尚未连接") };
    if (error) setMessage(`操作失败：${error.message}`); else await loadNotices();
  }
  async function openNotice(notice: (typeof notices)[number]) {
    const supabase = createSupabaseBrowserClient();
    if (!notice.read_at && supabase) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notice.id);
    onUnreadChange(Math.max(0, notices.filter((item) => !item.read_at).length - (notice.read_at ? 0 : 1)));
    onNavigate(notice.target_url);
  }
  return <div className="page narrow-page"><header className="page-header"><div><div className="eyebrow"><span />STAY CONNECTED</div><h1>通知中心</h1></div><button className="text-button" onClick={() => void markAllRead()} disabled={!notices.some((notice) => !notice.read_at)}>全部标为已读</button></header>{message && <div className="profile-message">{message}</div>}<div className="notice-list">{loading && <div className="content-empty glass-panel">正在读取通知…</div>}{!loading && !notices.length && <div className="content-empty glass-panel"><Bell /><strong>暂时没有通知</strong><p>朋友回复、评论或点赞后会显示在这里。</p></div>}{notices.map((notice) => <button className="notice glass-panel" key={notice.id} onClick={() => void openNotice(notice)}><div className={`notice-icon ${notice.kind === "like" ? "heart" : ""}`}>{notice.kind === "like" ? <Heart /> : <MessageCircle />}</div><div><strong>{notice.message}</strong><p>{notice.kind === "reply" ? "回复了你的内容" : notice.kind === "like" ? "喜欢了旅行故事" : "有一条新互动"}</p><small>{new Date(notice.created_at).toLocaleString("zh-CN")}</small></div>{!notice.read_at && <i />}</button>)}</div></div>;
}

function ProfilePage({ user, onUpdated, onOpenNotifications }: { user: AppUser; onUpdated: () => Promise<void>; onOpenNotifications: () => void }) {
  const [name, setName] = useState(user.name);
  const [avatarPreview, setAvatarPreview] = useState(user.avatarUrl || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Array<{ id: string; target_type: string; target_id: string; body: string; created_at: string; imagePaths: string[] }>>([]);
  const avatarRef = useRef<HTMLInputElement>(null);

  async function saveProfile() {
    if (!user.id || !name.trim()) return;
    setBusy(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = supabase ? await supabase.from("profiles").update({ display_name: name.trim(), updated_at: new Date().toISOString() }).eq("id", user.id) : { error: new Error("Supabase 尚未连接") };
    if (error) setMessage(`保存失败：${error.message}`);
    else { setMessage("个人资料已保存。"); await onUpdated(); }
    setBusy(false);
  }

  async function uploadAvatar(file?: File) {
    if (!file || !user.id) return;
    if (!isAllowedImage(file)) { setMessage("头像仅支持 JPG、PNG 或 WebP 图片。"); return; }
    if (file.size > 5 * 1024 * 1024) { setMessage("头像不能超过 5MB。"); return; }
    setBusy(true); setMessage("");
    let optimizedFile: File;
    try {
      optimizedFile = await optimizeImageFile(file, { maxWidth: 512, maxHeight: 512, maxBytes: 180 * 1024, quality: 0.8 });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "头像压缩失败，请更换图片后重试。");
      setBusy(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setMessage("头像上传失败：Supabase 尚未连接"); setBusy(false); return; }
    const extension = optimizedFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, optimizedFile, { contentType: optimizedFile.type, cacheControl: immutableImageCache });
    if (uploadError) { setMessage(`头像上传失败：${uploadError.message}`); setBusy(false); return; }
    const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (updateError) { await supabase.storage.from("avatars").remove([path]); setMessage(`头像保存失败：${updateError.message}`); setBusy(false); return; }
    if (user.avatarPath && user.avatarPath !== path) await supabase.storage.from("avatars").remove([user.avatarPath]);
    const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
    if (signed.data?.signedUrl) setAvatarPreview(signed.data.signedUrl);
    setMessage("头像已更新。");
    await onUpdated();
    setBusy(false);
  }

  async function changePassword() {
    if (password.length < 6) { setMessage("新密码至少需要 6 位字符。"); return; }
    if (password !== confirmPassword) { setMessage("两次输入的新密码不一致。"); return; }
    setBusy(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = supabase ? await supabase.auth.updateUser({ password }) : { error: new Error("Supabase 尚未连接") };
    if (error) setMessage(`密码修改失败：${error.message}`);
    else { setMessage("密码修改成功，请妥善保存新密码。"); setPassword(""); setConfirmPassword(""); setShowPassword(false); }
    setBusy(false);
  }

  async function loadComments() {
    if (!user.id) return;
    setShowComments(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = supabase ? await supabase.from("comments").select("id, target_type, target_id, body, created_at, comment_images(storage_path)").eq("author_id", user.id).order("created_at", { ascending: false }) : { data: null, error: new Error("Supabase 尚未连接") };
    if (error) setMessage(`留言读取失败：${error.message}`);
    else setComments((data || []).map((comment) => ({ ...comment, imagePaths: (comment.comment_images || []).map((image) => image.storage_path) })));
  }

  async function deleteComment(id: string) {
    const supabase = createSupabaseBrowserClient();
    const target = comments.find((comment) => comment.id === id);
    const { error } = supabase ? await supabase.from("comments").delete().eq("id", id) : { error: new Error("Supabase 尚未连接") };
    if (error) setMessage(`删除失败：${error.message}`);
    else {
      if (target?.imagePaths.length) await supabase?.storage.from("comment-media").remove(target.imagePaths);
      setComments((current) => current.filter((comment) => comment.id !== id));
      setMessage("留言及其图片已删除。");
    }
  }

  return <div className="page narrow-page"><header className="page-header"><div><div className="eyebrow"><span />YOUR SPACE</div><h1>个人中心</h1></div></header>
    <section className="profile-card glass-panel"><div className="profile-cover"><div className="avatar profile-avatar">{avatarPreview ? <img src={optimizedImageUrl(avatarPreview, 256, 60)} alt="个人头像" /> : name[0]}</div><button onClick={() => avatarRef.current?.click()} disabled={busy}><Camera size={16} />更换头像</button><input ref={avatarRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadAvatar(event.target.files?.[0])} /></div><div className="profile-body"><label>昵称<input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} /></label><label>邮箱<input value={user.email} readOnly /><small>邮箱不会在网站中公开</small></label><button className="primary-button" onClick={() => void saveProfile()} disabled={busy}>{busy ? "保存中…" : "保存资料"}</button></div></section>
    {message && <div className="profile-message" role="status">{message}</div>}
    <section className="settings-list glass-panel"><button onClick={() => setShowPassword((current) => !current)}><LockKeyhole /><div><strong>修改密码</strong><small>使用当前登录会话更新密码</small></div><ChevronRight /></button>{showPassword && <div className="inline-settings-form"><label>新密码<input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>确认新密码<input type="password" minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><button className="primary-button" onClick={() => void changePassword()} disabled={busy}>确认修改</button></div>}<button onClick={() => void loadComments()}><MessageCircle /><div><strong>我的留言</strong><small>查看和删除自己发表的内容</small></div><ChevronRight /></button>{showComments && <div className="my-comments">{comments.map((comment) => <article key={comment.id}><div><small>{comment.target_type} · {new Date(comment.created_at).toLocaleDateString("zh-CN")}</small><p>{comment.body}</p></div><button onClick={() => void deleteComment(comment.id)} aria-label="删除留言"><Trash2 size={16} /></button></article>)}{!comments.length && <div className="empty-state">你还没有发表过留言</div>}</div>}<button onClick={onOpenNotifications}><Bell /><div><strong>通知中心</strong><small>查看回复、评论和故事点赞</small></div><ChevronRight /></button></section>
  </div>;
}

function ProvinceAdminPage({ statuses, onBack, onUpdated }: { statuses: Record<string, ProvinceStatus>; onBack: () => void; onUpdated: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [draftStatuses, setDraftStatuses] = useState(statuses);
  const [saving, setSaving] = useState<string>();
  const [message, setMessage] = useState("");
  const provinces = Object.keys(draftStatuses)
    .filter((name) => name.includes(query.trim()))
    .sort((a, b) => a.localeCompare(b, "zh-CN"));

  async function changeStatus(name: string, status: ProvinceStatus) {
    const previous = draftStatuses[name];
    setDraftStatuses((current) => ({ ...current, [name]: status }));
    setSaving(name);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = supabase
      ? await supabase.from("provinces").update({ status }).eq("name", name)
      : { error: new Error("Supabase 尚未连接") };
    if (error) {
      setDraftStatuses((current) => ({ ...current, [name]: previous }));
      setMessage(`保存失败：${error.message}`);
    } else {
      setMessage(`${name}已更新，地图状态已同步。`);
      await onUpdated();
    }
    setSaving(undefined);
  }

  return <div className="page admin-page province-admin-page">
    <header className="page-header"><div><button className="back-link" onClick={onBack}><ArrowLeft size={16} />返回管理后台</button><div className="eyebrow"><span />PROVINCE CONTROL</div><h1>管理省份状态</h1><p>更改后立即同步到主页地图与统计数据。</p></div></header>
    <section className="province-admin-toolbar glass-panel">
      <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索省份" /></label>
      <div><span><i className="visited" />已去过 {Object.values(draftStatuses).filter((status) => status === "visited").length}</span><span><i className="planned" />计划前往 {Object.values(draftStatuses).filter((status) => status === "planned").length}</span><span><i />未计划 {Object.values(draftStatuses).filter((status) => status === "unplanned").length}</span></div>
    </section>
    {message && <div className="admin-feedback" role="status">{message}</div>}
    <section className="province-admin-list glass-panel">
      {provinces.map((name) => <div className="province-admin-row" key={name}>
        <div><i className={`status-dot status-${draftStatuses[name]}`} /><strong>{name}</strong><small>{shortProvince(name).toUpperCase()}</small></div>
        <label><span>状态</span><select value={draftStatuses[name]} disabled={saving === name} onChange={(event) => void changeStatus(name, event.target.value as ProvinceStatus)}><option value="unplanned">未计划前往</option><option value="planned">计划前往</option><option value="visited">已去过</option></select>{saving === name ? <small>保存中…</small> : <Check size={15} />}</label>
      </div>)}
      {!provinces.length && <div className="empty-state">没有找到匹配的省份</div>}
    </section>
  </div>;
}

function AdminStoryRouteStatePage({ state, onBack }: { state: "loading" | "missing" | "error"; onBack: () => void }) {
  const content = state === "loading"
    ? { eyebrow: "LOADING JOURNAL", title: "正在读取旅行故事", description: "正在确认故事内容，请稍候。", detail: "旅行数据加载完成后会自动打开编辑页面。" }
    : state === "error"
      ? { eyebrow: "JOURNAL UNAVAILABLE", title: "暂时无法读取故事", description: "旅行数据加载失败，目前无法确认这篇故事。", detail: "请返回管理后台后重试，避免误创建重复内容。" }
      : { eyebrow: "JOURNAL NOT FOUND", title: "故事不存在", description: "这篇旅行故事可能已被删除，或者链接地址不正确。", detail: "请从管理后台的内容列表重新选择需要编辑的故事。" };

  return <div className="page admin-page story-editor-page">
    <header className="page-header"><div><button className="back-link" onClick={onBack}><ArrowLeft size={16} />返回管理后台</button><div className="eyebrow"><span />{content.eyebrow}</div><h1>{content.title}</h1><p>{content.description}</p></div></header>
    <section className="content-empty glass-panel"><Compass size={26} /><strong>{content.title}</strong><p>{content.detail}</p>{state !== "loading" && <button className="primary-button" onClick={onBack}>返回管理后台</button>}</section>
  </div>;
}

function StoryEditorPage({ provinces, story, onBack, onSaved }: { provinces: ProvinceOption[]; story?: AdminStoryRecord; onBack: () => void; onSaved: () => Promise<void> }) {
  const availableProvinces = provinces.filter((province) => province.status === "visited");
  const initialTravelDate = (story?.traveledAt || "").split("-");
  const [provinceCode, setProvinceCode] = useState(story?.provinceCode || availableProvinces[0]?.code || provinces[0]?.code || "");
  const [title, setTitle] = useState(story?.title || "");
  const [travelYear, setTravelYear] = useState(initialTravelDate[0] || "");
  const [travelMonth, setTravelMonth] = useState(initialTravelDate[1] || "");
  const [travelDay, setTravelDay] = useState(initialTravelDate[2] || "");
  const [citySpots, setCitySpots] = useState(story?.citySpots.join("，") || "");
  const [body, setBody] = useState(story?.body || "");
  const [verdict, setVerdict] = useState<"worth_it" | "depends" | "not_recommended">(story?.verdict || "worth_it");
  const [rating, setRating] = useState(String(story?.rating || 5));
  const [pros, setPros] = useState(story?.pros.join("，") || "");
  const [cons, setCons] = useState(story?.cons.join("，") || "");
  const [coverFile, setCoverFile] = useState<File>();
  const [coverPreview, setCoverPreview] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [submitting, setSubmitting] = useState<"draft" | "publish">();
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const traveledAt = travelYear && travelMonth && travelDay ? `${travelYear}-${travelMonth}-${travelDay}` : "";
  const travelYears = Array.from({ length: new Date().getFullYear() - 1969 }, (_, index) => String(new Date().getFullYear() - index));
  const maxTravelDay = travelYear && travelMonth ? new Date(Number(travelYear), Number(travelMonth), 0).getDate() : 31;

  function changeTravelYear(value: string) {
    setTravelYear(value);
    if (value && travelMonth && Number(travelDay) > new Date(Number(value), Number(travelMonth), 0).getDate()) setTravelDay("");
  }

  function changeTravelMonth(value: string) {
    setTravelMonth(value);
    if (travelYear && value && Number(travelDay) > new Date(Number(travelYear), Number(value), 0).getDate()) setTravelDay("");
  }

  async function chooseCover(file?: File) {
    if (!file) return;
    if (!isAllowedImage(file)) { setMessage("封面仅支持 JPG、PNG 或 WebP 图片。"); return; }
    if (file.size > 15 * 1024 * 1024) { setMessage("封面图片不能超过 15MB。"); return; }
    let optimized: File;
    try {
      optimized = await optimizeImageFile(file, { maxWidth: 1920, maxHeight: 1280, maxBytes: 900 * 1024, quality: 0.8 });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "封面压缩失败，请更换图片后重试。");
      return;
    }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(optimized);
    setCoverPreview(URL.createObjectURL(optimized));
  }

  async function chooseGallery(files: FileList | null) {
    if (!files) return;
    const candidates = Array.from(files);
    const hasInvalidType = candidates.some((file) => !isAllowedImage(file));
    const selected = candidates.filter((file) => isAllowedImage(file) && file.size <= 15 * 1024 * 1024).slice(0, 12 - pendingPhotos.length);
    try {
      const optimized = await Promise.all(selected.map((file) => optimizeImageFile(file, { maxWidth: 1920, maxHeight: 1920, maxBytes: 800 * 1024, quality: 0.8 })));
      setPendingPhotos((current) => [...current, ...optimized.map((file) => ({ file, preview: URL.createObjectURL(file), captionTitle: "", captionStory: "" }))]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "照片压缩失败，请更换图片后重试。");
      return;
    }
    if (hasInvalidType) setMessage("照片集仅支持 JPG、PNG 或 WebP 图片。");
    else if (selected.length !== files.length) setMessage("单张图片需小于 15MB，每次最多添加 12 张。");
  }

  function updatePendingPhoto(index: number, patch: Partial<PendingPhoto>) {
    setPendingPhotos((current) => current.map((photo, photoIndex) => photoIndex === index ? { ...photo, ...patch } : photo));
  }

  function removePendingPhoto(index: number) {
    setPendingPhotos((current) => {
      URL.revokeObjectURL(current[index].preview);
      return current.filter((_, photoIndex) => photoIndex !== index);
    });
  }

  async function save(mode: "draft" | "publish") {
    if (!provinceCode || !title.trim() || !traveledAt || !body.trim()) {
      setMessage("请填写省份、标题、出行日期和正文故事。");
      return;
    }
    setSubmitting(mode);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setMessage("Supabase 尚未连接。"); setSubmitting(undefined); return; }
    const slugBase = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "journey";
    const payload = {
      province_code: provinceCode,
      title: title.trim(),
      slug: story?.slug || `${slugBase}-${Date.now().toString(36)}`,
      traveled_at: traveledAt,
      city_spots: citySpots.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
      body: body.trim(),
      verdict,
      rating: Number(rating),
      pros: pros.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
      cons: cons.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
      is_published: mode === "publish",
      published_at: mode === "publish" ? new Date().toISOString() : null,
    };
    const storyResult = story
      ? await supabase.from("stories").update(payload).eq("id", story.id).select("id").single()
      : await supabase.from("stories").insert(payload).select("id").single();
    if (storyResult.error) {
      setMessage(`保存失败：${storyResult.error.message}`);
      setSubmitting(undefined);
      return;
    }
    const storyId = storyResult.data.id;
    try {
      if (coverFile) {
        const extension = coverFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const coverPath = `${storyId}/cover-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("travel-media").upload(coverPath, coverFile, { contentType: coverFile.type, cacheControl: immutableImageCache });
        if (uploadError) throw uploadError;
        const { error: coverUpdateError } = await supabase.from("stories").update({ cover_path: coverPath }).eq("id", storyId);
        if (coverUpdateError) { await supabase.storage.from("travel-media").remove([coverPath]); throw coverUpdateError; }
        if (story?.coverPath) await supabase.storage.from("travel-media").remove([story.coverPath]);
      }
      for (const [index, photo] of pendingPhotos.entries()) {
        const extension = photo.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const storagePath = `${storyId}/gallery-${Date.now()}-${index}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("travel-media").upload(storagePath, photo.file, { contentType: photo.file.type, cacheControl: immutableImageCache });
        if (uploadError) throw uploadError;
        const { error: photoInsertError } = await supabase.from("story_photos").insert({ story_id: storyId, storage_path: storagePath, caption_title: photo.captionTitle.trim() || null, caption_story: photo.captionStory.trim() || null, sort_order: index });
        if (photoInsertError) { await supabase.storage.from("travel-media").remove([storagePath]); throw photoInsertError; }
      }
    } catch (error) {
      setMessage(`文字内容已保存，但图片上传失败：${error instanceof Error ? error.message : "未知错误"}`);
      setSubmitting(undefined);
      await onSaved();
      return;
    }
    await onSaved();
    onBack();
  }

  async function deleteStory() {
    if (!story) return;
    if (!confirmDelete) { setConfirmDelete(true); setMessage("再次点击“确认删除”将永久删除这篇故事及照片。"); return; }
    setSubmitting("draft");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setMessage("删除失败：Supabase 尚未连接"); setSubmitting(undefined); return; }
    const [{ data: photos }, { data: storyComments, error: commentLoadError }] = await Promise.all([
      supabase.from("story_photos").select("storage_path").eq("story_id", story.id),
      supabase.from("comments").select("id, comment_images(storage_path)").eq("target_type", "story").eq("target_id", story.id),
    ]);
    if (commentLoadError) { setMessage(`删除失败：无法读取故事留言（${commentLoadError.message}）`); setSubmitting(undefined); return; }
    const commentMediaPaths = (storyComments || []).flatMap((comment) => (comment.comment_images || []).map((image) => image.storage_path));
    const commentIds = (storyComments || []).map((comment) => comment.id);
    if (commentIds.length) {
      const { error: commentDeleteError } = await supabase.from("comments").delete().in("id", commentIds);
      if (commentDeleteError) { setMessage(`删除失败：无法清理故事留言（${commentDeleteError.message}）`); setSubmitting(undefined); return; }
    }
    const mediaPaths = [...(photos || []).map((photo) => photo.storage_path), ...(story.coverPath ? [story.coverPath] : [])];
    const { error } = await supabase.from("stories").delete().eq("id", story.id);
    if (error) { setMessage(`删除失败：${error.message}`); setSubmitting(undefined); return; }
    if (mediaPaths.length) await supabase.storage.from("travel-media").remove(mediaPaths);
    if (commentMediaPaths.length) await supabase.storage.from("comment-media").remove(commentMediaPaths);
    await onSaved();
    onBack();
  }

  return <div className="page admin-page story-editor-page">
    <header className="page-header"><div><button className="back-link" onClick={onBack}><ArrowLeft size={16} />返回管理后台</button><div className="eyebrow"><span />{story ? "EDIT JOURNAL" : "NEW JOURNAL"}</div><h1>{story ? "编辑旅行故事" : "发布旅行故事"}</h1><p>文字、封面和照片故事会一起保存到你的私人旅行档案。</p></div></header>
    <section className="story-editor-form glass-panel">
      <div className="editor-grid">
        <label>省份<select value={provinceCode} onChange={(event) => setProvinceCode(event.target.value)}>{availableProvinces.length ? availableProvinces.map((province) => <option key={province.code} value={province.code}>{province.name}</option>) : provinces.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}</select><small>{availableProvinces.length ? "只显示已去过的省份" : "请稍后将该省份状态设为已去过"}</small></label>
        <div className="date-field"><span>出行日期</span><div className="date-select-row">
          <select aria-label="出行年份" value={travelYear} onChange={(event) => changeTravelYear(event.target.value)}><option value="">年份</option>{travelYears.map((year) => <option key={year} value={year}>{year} 年</option>)}</select>
          <select aria-label="出行月份" value={travelMonth} onChange={(event) => changeTravelMonth(event.target.value)}><option value="">月份</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((month) => <option key={month} value={month}>{Number(month)} 月</option>)}</select>
          <select aria-label="出行日期" value={travelDay} onChange={(event) => setTravelDay(event.target.value)}><option value="">日期</option>{Array.from({ length: maxTravelDay }, (_, index) => String(index + 1).padStart(2, "0")).map((day) => <option key={day} value={day}>{Number(day)} 日</option>)}</select>
        </div></div>
        <label className="editor-wide">故事标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="给这段旅程一个标题" /></label>
        <label className="editor-wide">城市及景点<input value={citySpots} onChange={(event) => setCitySpots(event.target.value)} placeholder="例如：康定，新都桥，折多山（用逗号分隔）" /></label>
        <label className="editor-wide">正文故事<textarea rows={12} value={body} onChange={(event) => setBody(event.target.value)} placeholder="写下这段旅行发生的故事…" /></label>
        <label>结论<select value={verdict} onChange={(event) => setVerdict(event.target.value as typeof verdict)}><option value="worth_it">值得去</option><option value="depends">因人而异</option><option value="not_recommended">不推荐</option></select></label>
        <label>五星评分<select value={rating} onChange={(event) => setRating(event.target.value)}>{[5,4,3,2,1].map((score) => <option key={score} value={score}>{score} 星</option>)}</select></label>
        <label>优点标签<input value={pros} onChange={(event) => setPros(event.target.value)} placeholder="风景，自驾，日落" /></label>
        <label>缺点标签<input value={cons} onChange={(event) => setCons(event.target.value)} placeholder="拥挤，路程较长" /></label>
        <div className="editor-wide media-editor"><div className="media-editor-heading"><div><strong>封面图</strong><small>{story?.coverPath && !coverFile ? "当前已有封面，选择新图后替换" : "上传时会自动压缩为适合网页的 WebP 图片"}</small></div><button type="button" onClick={() => coverRef.current?.click()}><ImagePlus size={16} />{coverFile ? "更换封面" : "选择封面"}</button><input ref={coverRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseCover(event.target.files?.[0])} /></div>{coverPreview && <img className="cover-upload-preview" src={coverPreview} alt="封面预览" />}</div>
        <div className="editor-wide media-editor"><div className="media-editor-heading"><div><strong>照片集与照片故事</strong><small>本次待上传 {pendingPhotos.length} 张，图片会自动压缩</small></div><button type="button" onClick={() => galleryRef.current?.click()}><ImagePlus size={16} />添加照片</button><input ref={galleryRef} hidden type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseGallery(event.target.files)} /></div><div className="pending-photo-list">{pendingPhotos.map((photo, index) => <div className="pending-photo" key={photo.preview}><img src={photo.preview} alt={`待上传照片 ${index + 1}`} /><div><input value={photo.captionTitle} onChange={(event) => updatePendingPhoto(index, { captionTitle: event.target.value })} placeholder="照片标题（可选）" /><textarea rows={3} value={photo.captionStory} onChange={(event) => updatePendingPhoto(index, { captionStory: event.target.value })} placeholder="这张照片背后的故事（可选）" /></div><button type="button" onClick={() => removePendingPhoto(index)} aria-label={`移除第 ${index + 1} 张照片`}><X size={16} /></button></div>)}</div></div>
      </div>
      {message && <div className="admin-feedback" role="status">{message}</div>}
      <div className="editor-actions">{story && <button className={confirmDelete ? "danger-button confirmed" : "danger-button"} onClick={() => void deleteStory()} disabled={Boolean(submitting)}>{confirmDelete ? "确认删除" : "删除故事"}</button>}<span /><button onClick={() => void save("draft")} disabled={Boolean(submitting)}>{submitting === "draft" ? "保存中…" : "保存草稿"}</button><button className="primary-button" onClick={() => void save("publish")} disabled={Boolean(submitting)}>{submitting === "publish" ? "发布中…" : "发布故事"}<ArrowRight size={16} /></button></div>
    </section>
  </div>;
}

function AdminCommentsPage({ onBack }: { onBack: () => void }) {
  const [comments, setComments] = useState<Array<{ id: string; parentId?: string; authorName: string; targetType: string; targetId: string; body: string; createdAt: string; imagePaths: string[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [confirmId, setConfirmId] = useState<string>();
  const loadComments = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = supabase ? await supabase.from("comments").select("id, parent_id, target_type, target_id, body, created_at, profiles(display_name), comment_images(storage_path)").order("created_at", { ascending: false }).limit(200) : { data: null, error: new Error("Supabase 尚未连接") };
    if (error) setMessage(`留言加载失败：${error.message}`);
    else {
      const rows = (data || []) as unknown as Array<{ id: string; parent_id?: string; target_type: string; target_id: string; body: string; created_at: string; profiles: { display_name: string } | Array<{ display_name: string }>; comment_images: Array<{ storage_path: string }> }>;
      setComments(rows.map((row) => ({ id: row.id, parentId: row.parent_id, authorName: (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.display_name || "旅行朋友", targetType: row.target_type, targetId: row.target_id, body: row.body, createdAt: row.created_at, imagePaths: row.comment_images.map((image) => image.storage_path) })));
    }
    setLoading(false);
  }, []);
  useEffect(() => { const task = window.setTimeout(() => void loadComments(), 0); return () => window.clearTimeout(task); }, [loadComments]);
  async function removeComment(comment: (typeof comments)[number]) {
    if (confirmId !== comment.id) { setConfirmId(comment.id); setMessage("再次点击红色删除按钮确认永久删除该留言。"); return; }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const { error } = await supabase.from("comments").delete().eq("id", comment.id);
    if (error) setMessage(`删除失败：${error.message}`); else {
      const storageResult = comment.imagePaths.length ? await supabase.storage.from("comment-media").remove(comment.imagePaths) : { error: null };
      setComments((current) => {
        const removedIds = new Set([comment.id]);
        let foundDescendant = true;
        while (foundDescendant) {
          foundDescendant = false;
          current.forEach((item) => {
            if (item.parentId && removedIds.has(item.parentId) && !removedIds.has(item.id)) {
              removedIds.add(item.id);
              foundDescendant = true;
            }
          });
        }
        return current.filter((item) => !removedIds.has(item.id));
      });
      setConfirmId(undefined);
      setMessage(storageResult.error ? `留言已删除，但图片清理失败：${storageResult.error.message}` : "留言及其图片已删除。");
    }
  }
  return <div className="page admin-page"><header className="page-header"><div><button className="back-link" onClick={onBack}><ArrowLeft size={16} />返回管理后台</button><div className="eyebrow"><span />MODERATION</div><h1>全站留言审核</h1><p>查看并删除故事、省份、计划页和留言墙中的内容。</p></div></header>{message && <div className="admin-feedback">{message}</div>}<section className="moderation-list glass-panel">{loading && <div className="empty-state">正在加载留言…</div>}{!loading && !comments.length && <div className="empty-state">当前没有留言</div>}{comments.map((comment) => <article key={comment.id}><div className="avatar small">{comment.authorName.slice(0, 1)}</div><div><strong>{comment.authorName}</strong><small>{comment.targetType} · {comment.targetId} · {new Date(comment.createdAt).toLocaleString("zh-CN")}</small><p>{comment.body}</p>{comment.imagePaths.length > 0 && <span>{comment.imagePaths.length} 张图片</span>}</div><button className={confirmId === comment.id ? "confirmed" : ""} onClick={() => void removeComment(comment)} aria-label="删除留言"><Trash2 /></button></article>)}</section></div>;
}

function AdminUsersPage({ currentUserId, onBack }: { currentUserId?: string; onBack: () => void }) {
  const [users, setUsers] = useState<Array<{ id: string; display_name: string; role: string; is_blocked: boolean; created_at: string }>>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string>();
  const loadUsers = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = supabase ? await supabase.from("profiles").select("id, display_name, role, is_blocked, created_at").order("created_at", { ascending: false }) : { data: null, error: new Error("Supabase 尚未连接") };
    if (error) setMessage(`用户加载失败：${error.message}`); else setUsers(data || []);
  }, []);
  useEffect(() => { const task = window.setTimeout(() => void loadUsers(), 0); return () => window.clearTimeout(task); }, [loadUsers]);
  async function toggleBlocked(target: (typeof users)[number]) {
    if (target.id === currentUserId) { setMessage("不能禁用当前登录的管理员账户。"); return; }
    setBusyId(target.id); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = supabase ? await supabase.from("profiles").update({ is_blocked: !target.is_blocked, updated_at: new Date().toISOString() }).eq("id", target.id) : { error: new Error("Supabase 尚未连接") };
    if (error) setMessage(`操作失败：${error.message}`); else setUsers((current) => current.map((user) => user.id === target.id ? { ...user, is_blocked: !user.is_blocked } : user));
    setBusyId(undefined);
  }
  const filtered = users.filter((user) => user.display_name.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="page admin-page"><header className="page-header"><div><button className="back-link" onClick={onBack}><ArrowLeft size={16} />返回管理后台</button><div className="eyebrow"><span />MEMBERS</div><h1>用户与黑名单</h1><p>邮箱不会显示；可通过昵称查找并禁用或恢复账户。</p></div></header><section className="province-admin-toolbar glass-panel"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索昵称" /></label><div><span>共 {users.length} 位成员</span><span>已禁用 {users.filter((user) => user.is_blocked).length}</span></div></section>{message && <div className="admin-feedback">{message}</div>}<section className="user-admin-list glass-panel">{filtered.map((member) => <article key={member.id}><div className="avatar">{member.display_name.slice(0, 1)}</div><div><strong>{member.display_name}</strong><small>{member.role === "admin" ? "管理员" : "旅行朋友"} · 加入于 {new Date(member.created_at).toLocaleDateString("zh-CN")}</small></div><span className={member.is_blocked ? "blocked" : "active"}>{member.is_blocked ? "已禁用" : "正常"}</span><button onClick={() => void toggleBlocked(member)} disabled={busyId === member.id || member.id === currentUserId}>{member.is_blocked ? "恢复" : "禁用"}</button></article>)}{!filtered.length && <div className="empty-state">没有找到用户</div>}</section></div>;
}

function AdminPlansPage({ plans, onBack, onUpdated }: { plans: ProvincePlan[]; onBack: () => void; onUpdated: () => Promise<void> }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(plans.map((plan) => [plan.provinceCode, { expectedAt: plan.expectedAt, wishes: plan.wishes.join("，") }])));
  const [busyCode, setBusyCode] = useState<string>();
  const [message, setMessage] = useState("");
  async function savePlan(plan: ProvincePlan) {
    const draft = drafts[plan.provinceCode];
    if (!draft) return;
    setBusyCode(plan.provinceCode); setMessage("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setMessage("Supabase 尚未连接。"); setBusyCode(undefined); return; }
    const wishes = draft.wishes.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean);
    const { error: provinceError } = await supabase.from("provinces").update({ expected_at: draft.expectedAt.trim() || null, updated_at: new Date().toISOString() }).eq("code", plan.provinceCode);
    if (provinceError) { setMessage(`保存失败：${provinceError.message}`); setBusyCode(undefined); return; }
    const { error: deleteError } = await supabase.from("travel_wishes").delete().eq("province_code", plan.provinceCode);
    if (deleteError) { setMessage(`愿望清单更新失败：${deleteError.message}`); setBusyCode(undefined); return; }
    if (wishes.length) {
      const { error: insertError } = await supabase.from("travel_wishes").insert(wishes.map((placeName, index) => ({ province_code: plan.provinceCode, place_name: placeName, sort_order: index })));
      if (insertError) { setMessage(`愿望清单更新失败：${insertError.message}`); setBusyCode(undefined); return; }
    }
    setMessage(`${plan.provinceName}的旅行计划已保存。`); await onUpdated(); setBusyCode(undefined);
  }
  return <div className="page admin-page admin-plans-page"><header className="page-header"><div><button className="back-link" onClick={onBack}><ArrowLeft size={16} />返回管理后台</button><div className="eyebrow"><span />NEXT DESTINATIONS</div><h1>计划目的地</h1><p>维护计划前往省份的愿望清单、计划景点和预计出行时间。</p></div></header>{message && <div className="admin-feedback">{message}</div>}<section className="admin-plan-list">{plans.map((plan) => <article className="admin-plan-card glass-panel" key={plan.provinceCode}><div><span className="section-index">PLANNED</span><h2>{plan.provinceName}</h2></div><label>预计出行时间<input value={drafts[plan.provinceCode]?.expectedAt || ""} onChange={(event) => setDrafts((current) => ({ ...current, [plan.provinceCode]: { ...current[plan.provinceCode], expectedAt: event.target.value } }))} placeholder="例如：2026年秋季" /></label><label>愿望清单与计划景点<textarea rows={4} value={drafts[plan.provinceCode]?.wishes || ""} onChange={(event) => setDrafts((current) => ({ ...current, [plan.provinceCode]: { ...current[plan.provinceCode], wishes: event.target.value } }))} placeholder="多个地点用逗号分隔" /></label><button className="primary-button" disabled={busyCode === plan.provinceCode} onClick={() => void savePlan(plan)}><Save size={16} />{busyCode === plan.provinceCode ? "保存中…" : "保存计划"}</button></article>)}{!plans.length && <div className="empty-state glass-panel">请先在“管理省份状态”中设置计划前往省份</div>}</section></div>;
}

function AdminPhotoLibraryPage({ photos, onBack, onUpdated }: { photos: AdminPhotoRecord[]; onBack: () => void; onUpdated: () => Promise<void> }) {
  const [items, setItems] = useState(photos);
  const [imagesLoading, setImagesLoading] = useState(() => photos.some((photo) => !photo.url && photo.storagePath));
  const [query, setQuery] = useState("");
  const [storyFilter, setStoryFilter] = useState("all");
  const [busyId, setBusyId] = useState<string>();
  const [confirmId, setConfirmId] = useState<string>();
  const [message, setMessage] = useState("");
  const stories = useMemo(() => Array.from(new globalThis.Map<string, string>(items.map((photo) => [photo.storyId, photo.storyTitle])).entries()), [items]);
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter((photo) => (storyFilter === "all" || photo.storyId === storyFilter) && (!keyword || `${photo.storyTitle} ${photo.captionTitle} ${photo.captionStory}`.toLowerCase().includes(keyword)));
  }, [items, query, storyFilter]);

  useEffect(() => {
    let cancelled = false;
    const missing = photos.filter((photo) => !photo.url && photo.storagePath);
    if (!missing.length) return;
    const loadImages = async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) setImagesLoading(false);
        return;
      }
      const { data } = await supabase.storage.from("travel-media").createSignedUrls(missing.map((photo) => photo.storagePath), 60 * 60);
      if (cancelled) return;
      const urls = new globalThis.Map((data || []).filter((item) => item.path && item.signedUrl).map((item) => [item.path!, item.signedUrl!]));
      setItems(photos.map((photo) => ({ ...photo, url: photo.url || urls.get(photo.storagePath) })));
      setImagesLoading(false);
    };
    void loadImages();
    return () => { cancelled = true; };
  }, [photos]);

  function changeField(id: string, field: "captionTitle" | "captionStory", value: string) {
    setItems((current) => current.map((photo) => photo.id === id ? { ...photo, [field]: value } : photo));
  }

  async function savePhoto(photo: AdminPhotoRecord) {
    setBusyId(photo.id); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const { error } = supabase ? await supabase.from("story_photos").update({ caption_title: photo.captionTitle.trim() || null, caption_story: photo.captionStory.trim() || null }).eq("id", photo.id) : { error: new Error("Supabase 尚未连接") };
    if (error) setMessage(`保存失败：${error.message}`); else { setMessage("照片说明已保存。"); await onUpdated(); }
    setBusyId(undefined);
  }

  async function movePhoto(photo: AdminPhotoRecord, direction: -1 | 1) {
    const siblings = items.filter((item) => item.storyId === photo.storyId).sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((item) => item.id === photo.id);
    const neighbor = siblings[index + direction];
    if (!neighbor) return;
    setBusyId(photo.id); setMessage("");
    const supabase = createSupabaseBrowserClient();
    const results = supabase ? await Promise.all([
      supabase.from("story_photos").update({ sort_order: neighbor.sortOrder }).eq("id", photo.id),
      supabase.from("story_photos").update({ sort_order: photo.sortOrder }).eq("id", neighbor.id),
    ]) : [{ error: new Error("Supabase 尚未连接") }];
    const error = results.find((result) => result.error)?.error;
    if (error) setMessage(`排序失败：${error.message}`); else {
      setItems((current) => current.map((item) => item.id === photo.id ? { ...item, sortOrder: neighbor.sortOrder } : item.id === neighbor.id ? { ...item, sortOrder: photo.sortOrder } : item));
      setMessage("照片顺序已更新。");
      await onUpdated();
    }
    setBusyId(undefined);
  }

  async function removePhoto(photo: AdminPhotoRecord) {
    if (confirmId !== photo.id) { setConfirmId(photo.id); setMessage("再次点击删除，确认永久移除这张照片。"); return; }
    setBusyId(photo.id); setMessage("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setMessage("删除失败：Supabase 尚未连接"); setBusyId(undefined); return; }
    const { error } = await supabase.from("story_photos").delete().eq("id", photo.id);
    if (error) setMessage(`记录删除失败：${error.message}`); else {
      setItems((current) => current.filter((item) => item.id !== photo.id));
      setConfirmId(undefined);
      const { error: storageError } = await supabase.storage.from("travel-media").remove([photo.storagePath]);
      setMessage(storageError ? `照片记录已删除，但存储清理失败：${storageError.message}` : "照片及其存储文件已删除。");
      await onUpdated();
    }
    setBusyId(undefined);
  }

  return <div className="page admin-page photo-library-page"><header className="page-header"><div><button className="back-link" onClick={onBack}><ArrowLeft size={16} />返回管理后台</button><div className="eyebrow"><span />MEDIA LIBRARY</div><h1>照片资源库</h1><p>编辑照片说明、调整同一故事内的展示顺序，或永久删除照片。</p></div></header>
    <section className="photo-library-toolbar glass-panel"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索故事或照片说明" /></label><select value={storyFilter} onChange={(event) => setStoryFilter(event.target.value)}><option value="all">全部故事</option>{stories.map(([id, title]) => <option value={id} key={id}>{title}</option>)}</select><span>共 {items.length} 张</span></section>
    {message && <div className="admin-feedback">{message}</div>}
    {imagesLoading && <div className="admin-feedback" role="status">正在加载照片缩略图…</div>}
    <section className="photo-library-list">{visible.map((photo) => {
      const siblings = items.filter((item) => item.storyId === photo.storyId).sort((a, b) => a.sortOrder - b.sortOrder);
      const position = siblings.findIndex((item) => item.id === photo.id);
      return <article className="photo-admin-card glass-panel" key={photo.id}>{photo.url ? <img src={optimizedImageUrl(photo.url, 640, 60)} alt={photo.captionTitle || photo.storyTitle} loading="lazy" decoding="async" /> : <div className="photo-admin-placeholder" aria-hidden="true" />}<div className="photo-admin-fields"><small>{photo.storyTitle} · 第 {position + 1} / {siblings.length} 张</small><label>照片标题<input value={photo.captionTitle} onChange={(event) => changeField(photo.id, "captionTitle", event.target.value)} placeholder="为照片添加标题" /></label><label>照片故事<textarea value={photo.captionStory} onChange={(event) => changeField(photo.id, "captionStory", event.target.value)} rows={3} placeholder="记录照片背后的故事" /></label></div><div className="photo-admin-actions"><button onClick={() => void movePhoto(photo, -1)} disabled={busyId === photo.id || position === 0} aria-label="向前移动"><ArrowUp /></button><button onClick={() => void movePhoto(photo, 1)} disabled={busyId === photo.id || position === siblings.length - 1} aria-label="向后移动"><ArrowDown /></button><button className="save" onClick={() => void savePhoto(photo)} disabled={busyId === photo.id} aria-label="保存照片说明"><Save /></button><button className={confirmId === photo.id ? "delete confirmed" : "delete"} onClick={() => void removePhoto(photo)} disabled={busyId === photo.id} aria-label="删除照片"><Trash2 /></button></div></article>;
    })}{!visible.length && <div className="empty-state glass-panel">{items.length ? "没有符合条件的照片" : "目前还没有上传照片"}</div>}</section>
  </div>;
}

type MediaMigrationItem =
  | { kind: "cover"; id: string; storyId: string; storyTitle: string; storagePath: string }
  | { kind: "photo"; id: string; storyId: string; storyTitle: string; storagePath: string };

function AdminMediaOptimizerPage({ stories, photos, onBack, onUpdated }: { stories: AdminStoryRecord[]; photos: AdminPhotoRecord[]; onBack: () => void; onUpdated: () => Promise<void> }) {
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentLabel, setCurrentLabel] = useState("");
  const [message, setMessage] = useState("");
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupPaths, setCleanupPaths] = useState<string[]>([]);
  const candidates = useMemo<MediaMigrationItem[]>(() => [
    ...stories
      .filter((story) => story.coverPath && !story.coverPath.toLowerCase().endsWith(".webp"))
      .map((story) => ({ kind: "cover" as const, id: story.id, storyId: story.id, storyTitle: story.title, storagePath: story.coverPath! })),
    ...photos
      .filter((photo) => !photo.storagePath.toLowerCase().endsWith(".webp"))
      .map((photo) => ({ kind: "photo" as const, id: photo.id, storyId: photo.storyId, storyTitle: photo.storyTitle, storagePath: photo.storagePath })),
  ], [photos, stories]);

  async function migrateItem(item: MediaMigrationItem, index: number) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase 尚未连接");
    const { data: original, error: downloadError } = await supabase.storage.from("travel-media").download(item.storagePath);
    if (downloadError || !original) throw new Error(downloadError?.message || "原图下载失败");

    const sourceName = item.storagePath.split("/").pop() || `${item.kind}-${index}.jpg`;
    const sourceFile = new File([original], sourceName, { type: original.type || "image/jpeg" });
    const optimized = await optimizeImageFile(sourceFile, item.kind === "cover"
      ? { maxWidth: 1920, maxHeight: 1280, maxBytes: 900 * 1024, quality: 0.8, forceWebp: true }
      : { maxWidth: 1920, maxHeight: 1920, maxBytes: 800 * 1024, quality: 0.8, forceWebp: true });
    const newPath = `${item.storyId}/optimized-${item.kind}-${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage.from("travel-media").upload(newPath, optimized, {
      cacheControl: immutableImageCache,
      contentType: "image/webp",
      upsert: false,
    });
    if (uploadError) throw new Error(`压缩图上传失败：${uploadError.message}`);

    const update = item.kind === "cover"
      ? await supabase.from("stories").update({ cover_path: newPath }).eq("id", item.id).eq("cover_path", item.storagePath).select("id").maybeSingle()
      : await supabase.from("story_photos").update({ storage_path: newPath }).eq("id", item.id).eq("storage_path", item.storagePath).select("id").maybeSingle();
    if (update.error || !update.data) {
      await supabase.storage.from("travel-media").remove([newPath]);
      throw new Error(update.error?.message || "记录已发生变化，未替换原图");
    }
  }

  async function startMigration() {
    if (!candidates.length || running) return;
    setRunning(true);
    setMessage("");
    setCompleted(0);
    setTotal(candidates.length);
    const failures: string[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const item = candidates[index];
      setCurrentLabel(`${item.storyTitle} · ${item.kind === "cover" ? "封面" : "照片"}`);
      try {
        await migrateItem(item, index);
      } catch (error) {
        failures.push(`${item.storyTitle}：${error instanceof Error ? error.message : "处理失败"}`);
      }
      setCompleted(index + 1);
    }
    await onUpdated();
    setCurrentLabel("");
    setRunning(false);
    setMessage(failures.length
      ? `迁移完成，成功 ${candidates.length - failures.length} 张，失败 ${failures.length} 张。失败项可直接再次运行。${failures.slice(0, 3).join("；")}`
      : `迁移完成，共优化 ${candidates.length} 张图片。旧原图仍保留，确认页面正常后再清理。`);
  }

  async function scanOldOriginals() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setMessage("Supabase 尚未连接"); return; }
    setCleanupBusy(true);
    setCleanupPaths([]);
    setMessage("");
    const referenced = new Set([
      ...stories.map((story) => story.coverPath).filter((path): path is string => Boolean(path)),
      ...photos.map((photo) => photo.storagePath),
    ]);
    const oldPaths: string[] = [];
    for (const story of stories) {
      const { data, error } = await supabase.storage.from("travel-media").list(story.id, { limit: 1000 });
      if (error) {
        setMessage(`扫描旧原图失败：${error.message}`);
        setCleanupBusy(false);
        return;
      }
      for (const object of data || []) {
        const path = `${story.id}/${object.name}`;
        if (!referenced.has(path) && !path.toLowerCase().endsWith(".webp")) oldPaths.push(path);
      }
    }
    setCleanupPaths(oldPaths);
    setCleanupBusy(false);
    setMessage(oldPaths.length
      ? `已找到 ${oldPaths.length} 张未被任何故事引用的旧原图。再次点击下方按钮才会永久删除。`
      : "没有发现可清理的未引用旧原图。");
  }

  async function deleteOldOriginals() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !cleanupPaths.length) return;
    setCleanupBusy(true);
    setMessage("");
    let deleted = 0;
    for (let index = 0; index < cleanupPaths.length; index += 50) {
      const batch = cleanupPaths.slice(index, index + 50);
      const { error } = await supabase.storage.from("travel-media").remove(batch);
      if (error) {
        setMessage(`已删除 ${deleted} 张，后续清理失败：${error.message}。可重新扫描后继续。`);
        setCleanupBusy(false);
        setCleanupPaths([]);
        return;
      }
      deleted += batch.length;
    }
    setCleanupPaths([]);
    setCleanupBusy(false);
    setMessage(`旧原图清理完成，共删除 ${deleted} 张未引用文件。当前 WebP 图片不受影响。`);
  }

  const progress = total ? Math.round((completed / total) * 100) : 0;
  return <div className="page admin-page media-optimizer-page">
    <header className="page-header"><div><button className="back-link" onClick={onBack} disabled={running}><ArrowLeft size={16} />返回管理后台</button><div className="eyebrow"><span />MEDIA OPTIMIZER</div><h1>图片流量优化</h1><p>把现有封面和照片压缩为 WebP，降低 Supabase 流量消耗。</p></div></header>
    <section className="glass-panel media-optimizer-card">
      <div className="section-heading"><div><span className="section-index">SAFE MIGRATION</span><h2>可回滚迁移</h2></div><span className="section-count">待处理 {candidates.length} 张</span></div>
      <p>新图片上传成功且数据库替换成功后才会计为完成。此次不会删除旧原图，页面验证无误后再单独清理。</p>
      {running && <div className="media-progress"><div><span style={{ width: `${progress}%` }} /></div><strong>{completed} / {total} · {progress}%</strong><small>{currentLabel}</small></div>}
      {message && <div className="admin-feedback">{message}</div>}
      <button className="primary-button" onClick={() => void startMigration()} disabled={running || !candidates.length}>
        <Sparkles size={17} />{running ? "正在逐张处理…" : candidates.length ? "开始优化现有图片" : "现有图片已全部优化"}
      </button>
      {!running && !candidates.length && <div className="media-cleanup-actions">
        {!cleanupPaths.length
          ? <button className="text-button" onClick={() => void scanOldOriginals()} disabled={cleanupBusy}><Search size={16} />{cleanupBusy ? "正在扫描…" : "扫描未引用旧原图"}</button>
          : <button className="danger-button" onClick={() => void deleteOldOriginals()} disabled={cleanupBusy}><Trash2 size={16} />{cleanupBusy ? "正在清理…" : `确认永久删除 ${cleanupPaths.length} 张旧原图`}</button>}
      </div>}
    </section>
  </div>;
}

function AdminPage({ stats, provinceCount, stories, onManageProvinces, onManagePlans, onManagePhotos, onOptimizeMedia, onManageComments, onManageUsers, onNewStory, onEditStory }: { stats: AtlasStats; provinceCount: number; stories: AdminStoryRecord[]; onManageProvinces: () => void; onManagePlans: () => void; onManagePhotos: () => void; onOptimizeMedia: () => void; onManageComments: () => void; onManageUsers: () => void; onNewStory: () => void; onEditStory: (id: string) => void }) {
  const [userCount, setUserCount] = useState<number>();
  useEffect(() => {
    const task = window.setTimeout(async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true });
      setUserCount(count ?? 0);
    }, 0);
    return () => window.clearTimeout(task);
  }, []);
  const items = [["省份状态", String(provinceCount), Map], ["已发布故事", twoDigits(stats.stories), Compass], ["注册用户", userCount === undefined ? "…" : String(userCount), Users], ["故事草稿", String(stories.filter((story) => !story.isPublished).length), ShieldCheck]] as const;
  return <div className="page admin-page">
    <header className="page-header"><div><div className="eyebrow"><span />OWNER CONTROL</div><h1>管理后台</h1><p>欢迎回来，Yosuke。你的足迹仍在继续。</p></div><button className="primary-button" onClick={onNewStory}><Plus size={17} />发布新故事</button></header>
    <div className="admin-stats">{items.map(([label, value, Icon], index) => <div className="glass-panel" key={label}><div><Icon /><small>{label}</small></div><strong>{value}</strong><span>0{index + 1}</span></div>)}</div>
    <div className="admin-grid"><section className="glass-panel admin-section"><div className="section-heading"><div><span className="section-index">CONTENT</span><h2>最近内容</h2></div><span className="section-count">共 {stories.length} 篇</span></div>
      {stories.map((story) => <div className="admin-story" key={story.id}>{story.coverUrl ? <img className="admin-story-cover" src={optimizedImageUrl(story.coverUrl, 256, 60)} alt="" loading="lazy" decoding="async" /> : <div className="mini-cover blue" />}<div><strong>{story.title}</strong><span>{story.provinceName} · {story.traveledAt}</span></div><span className="status-pill">{story.isPublished ? "已发布" : "草稿"}</span><button onClick={() => onEditStory(story.id)} title="编辑故事"><Settings2 /></button></div>)}
      {!stories.length && <div className="empty-state">还没有真实故事，创建第一篇旅行记录吧。</div>}
      <button className="admin-add" onClick={onNewStory}><Plus />创建新的旅行记录</button>
    </section><section className="glass-panel admin-section"><div className="section-heading"><div><span className="section-index">MODERATION</span><h2>内容管理</h2></div></div><p className="admin-section-copy">查看全站留言，处理不合适的文字和图片内容。</p><button className="text-button full" onClick={onManageComments}>进入留言审核 <ArrowRight /></button></section></div>
    <section className="admin-actions"><button className="glass-panel" onClick={onManageProvinces}><MapPin /><div><strong>管理省份状态</strong><small>设置已去过、计划与未计划</small></div><ChevronRight /></button><button className="glass-panel" onClick={onManagePlans}><Compass /><div><strong>计划目的地</strong><small>维护愿望清单、景点和预计时间</small></div><ChevronRight /></button><button className="glass-panel" onClick={onManagePhotos}><Upload /><div><strong>照片资源库</strong><small>编辑说明、排序或删除现有照片</small></div><ChevronRight /></button><button className="glass-panel" onClick={onOptimizeMedia}><Sparkles /><div><strong>图片流量优化</strong><small>压缩现有图片并安全替换引用</small></div><ChevronRight /></button><button className="glass-panel" onClick={onManageUsers}><Users /><div><strong>用户与黑名单</strong><small>搜索、禁用或恢复用户</small></div><ChevronRight /></button></section>
  </div>;
}

export default function TravelAtlas() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabaseEnv);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryTokenHash, setRecoveryTokenHash] = useState<string>();
  const [authMessage, setAuthMessage] = useState("");
  const [view, setView] = useState<View>("map");
  const [province, setProvince] = useState<{ name: string; status: ProvinceStatus }>();
  const [story, setStory] = useState<string>();
  const [selectedAdminStoryId, setSelectedAdminStoryId] = useState<string>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, ProvinceStatus>>(hasSupabaseEnv ? {} : provinceStatus);
  const [provinceOptions, setProvinceOptions] = useState<ProvinceOption[]>([]);
  const [adminStories, setAdminStories] = useState<AdminStoryRecord[]>([]);
  const [adminPhotos, setAdminPhotos] = useState<AdminPhotoRecord[]>([]);
  const [plans, setPlans] = useState<Record<string, ProvincePlan>>(hasSupabaseEnv ? {} : initialPlans);
  const [publishedStories, setPublishedStories] = useState<AtlasStory[]>(hasSupabaseEnv ? [] : initialDemoStories);
  const [stats, setStats] = useState<AtlasStats>(hasSupabaseEnv ? emptyStats : demoStats);
  const [usingDemoData, setUsingDemoData] = useState(!hasSupabaseEnv);
  const [atlasLoading, setAtlasLoading] = useState(false);
  const [atlasReady, setAtlasReady] = useState(!hasSupabaseEnv);
  const [atlasError, setAtlasError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const previousFocus = useRef<HTMLElement | null>(null);
  const searchOpenerFocus = useRef<HTMLElement | null>(null);

  const openSearch = useCallback(() => {
    searchOpenerFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSearchOpen(true);
  }, []);

  const navigateView = useCallback((nextView: View, replace = false) => {
    const paths: Record<View, string> = { map: "/map", wall: "/wall", notifications: "/notifications", profile: "/profile", admin: "/admin", "admin-provinces": "/admin/provinces", "admin-story-new": "/admin/stories/new", "admin-comments": "/admin/comments", "admin-users": "/admin/users", "admin-photos": "/admin/photos", "admin-plans": "/admin/plans", "admin-optimize": "/admin/optimize-media" };
    window.history[replace ? "replaceState" : "pushState"]({}, "", paths[nextView]);
    setView(nextView);
    setProvince(undefined); setStory(undefined); setSearchOpen(false);
  }, []);

  const openProvince = useCallback((name: string, status: ProvinceStatus, replace = false) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", `/province/${encodeURIComponent(name)}`);
    setProvince({ name, status }); setStory(undefined); setSearchOpen(false);
  }, []);

  const openStory = useCallback((id: string, replace = false) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", `/story/${encodeURIComponent(id)}`);
    setStory(id); setProvince(undefined); setSearchOpen(false);
  }, []);

  const closeOverlay = useCallback(() => navigateView("map"), [navigateView]);

  const applyLocation = useCallback(() => {
    const parts = window.location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] === "story" && parts[1]) { setStory(parts[1]); setProvince(undefined); setView("map"); return; }
    if (parts[0] === "province" && parts[1]) { setProvince({ name: parts[1], status: statuses[parts[1]] || "unplanned" }); setStory(undefined); setView("map"); return; }
    if (parts[0] === "admin") {
      if (user && !user.admin) {
        window.history.replaceState({}, "", "/map");
        setView("map"); setProvince(undefined); setStory(undefined);
        return;
      }
      if (parts[1] === "provinces") setView("admin-provinces");
      else if (parts[1] === "comments") setView("admin-comments");
      else if (parts[1] === "users") setView("admin-users");
      else if (parts[1] === "photos") setView("admin-photos");
      else if (parts[1] === "plans") setView("admin-plans");
      else if (parts[1] === "optimize-media") setView("admin-optimize");
      else if (parts[1] === "stories" && parts[2]) { setSelectedAdminStoryId(parts[2] === "new" ? undefined : parts[2]); setView("admin-story-new"); }
      else setView("admin");
      return;
    }
    const routeViews: Record<string, View> = { map: "map", wall: "wall", notifications: "notifications", profile: "profile" };
    setView(routeViews[parts[0]] || "map"); setProvince(undefined); setStory(undefined);
  }, [statuses, user]);

  const navigateUrl = useCallback((url: string) => {
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const loadUserProfile = useCallback(async (authUser: { id: string; email?: string | null; user_metadata?: { display_name?: string } } | null) => {
    if (!authUser) {
      setUser(null);
      setAuthReady(true);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const fallbackName = authUser.user_metadata?.display_name || authUser.email?.split("@")[0] || "旅行朋友";
    if (!supabase) {
      setUser({ id: authUser.id, email: authUser.email || "", name: fallbackName, admin: false });
      setAuthReady(true);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_path, role, is_blocked")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profile?.is_blocked) {
      await supabase.auth.signOut();
      setUser(null);
    } else {
      const avatarUrl = profile?.avatar_path
        ? (await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 60 * 60)).data?.signedUrl
        : undefined;
      setUser({
        id: authUser.id,
        email: authUser.email || "",
        name: profile?.display_name || fallbackName,
        avatarPath: profile?.avatar_path,
        avatarUrl,
        admin: profile?.role === "admin",
      });
      if (window.location.pathname === "/login" || window.location.pathname === "/" || (profile?.role !== "admin" && window.location.pathname.startsWith("/admin"))) {
        window.history.replaceState({}, "", "/map");
        setView("map");
      }
    }
    setAuthReady(true);
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    await loadUserProfile(data.user);
  }, [loadUserProfile]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const query = new URLSearchParams(window.location.search);
    const rawHash = window.location.hash.replace(/^#/, "");
    const hash = new URLSearchParams(rawHash);
    const errorCode = query.get("error_code") || hash.get("error_code");
    const errorDescription = query.get("error_description") || hash.get("error_description");
    const authCode = query.get("code") || undefined;
    const wrappedConfirmationUrl = rawHash.startsWith("confirmation_url=") ? rawHash.slice("confirmation_url=".length) : undefined;
    let wrappedTokenHash: string | undefined;
    if (wrappedConfirmationUrl) {
      try {
        const decodedConfirmationUrl = decodeURIComponent(wrappedConfirmationUrl);
        wrappedTokenHash = new URL(decodedConfirmationUrl).searchParams.get("token") || undefined;
      } catch { wrappedTokenHash = undefined; }
    }
    const tokenHash = query.get("token_hash") || wrappedTokenHash;
    const initialRecovery = Boolean(wrappedTokenHash) || hash.get("type") === "recovery" || (query.get("type") === "recovery" && Boolean(tokenHash));
    let recoveryActive = initialRecovery || Boolean(authCode);
    const startupTask = window.setTimeout(() => {
      if (errorCode || errorDescription) setAuthMessage(getAuthErrorMessage(new Error(errorCode || errorDescription || "")));
      if (initialRecovery) {
        setRecoveryTokenHash(tokenHash);
        setRecoveryMode(true);
        setUser(null);
        setAuthReady(true);
      }
    }, 0);
    if (errorCode || errorDescription) {
      window.history.replaceState({}, "", "/login");
    }
    if (authCode) {
      void supabase.auth.exchangeCodeForSession(authCode).then(({ error }) => {
        if (error) {
          recoveryActive = false;
          setRecoveryMode(false);
          setUser(null);
          setAuthMessage(getAuthErrorMessage(error));
          setAuthReady(true);
          window.history.replaceState({}, "", "/login");
          return;
        }
        recoveryActive = true;
        setRecoveryTokenHash(undefined);
        setRecoveryMode(true);
        setUser(null);
        setAuthReady(true);
        window.history.replaceState({}, "", "/reset-password");
      });
    } else if (!recoveryActive) {
      void supabase.auth.getSession().then(({ data }) => loadUserProfile(data.session?.user || null));
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryActive = true;
        setRecoveryTokenHash(undefined);
        setRecoveryMode(true);
        setUser(null);
        setAuthReady(true);
        window.history.replaceState({}, "", "/reset-password");
        return;
      }
      if (event === "SIGNED_OUT") recoveryActive = false;
      if (!recoveryActive) void loadUserProfile(session?.user || null);
    });
    return () => { window.clearTimeout(startupTask); listener.subscription.unsubscribe(); };
  }, [loadUserProfile]);

  const loadAtlasData = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setAtlasLoading(true);
    setAtlasReady(false);
    setAtlasError("");
    const [provinceResult, storyResult, photoResult, wishResult] = await Promise.all([
      supabase.from("provinces").select("code, name, status, expected_at"),
      supabase.from("stories").select("id, province_code, title, slug, cover_path, traveled_at, city_spots, body, verdict, rating, pros, cons, is_published").order("created_at", { ascending: false }),
      supabase.from("story_photos").select("id, story_id, storage_path, caption_title, caption_story, sort_order").order("sort_order", { ascending: true }),
      supabase.from("travel_wishes").select("province_code, place_name, sort_order").order("sort_order", { ascending: true }),
    ]);
    if (provinceResult.error) {
      setAtlasError(`旅行数据加载失败：${provinceResult.error.message}`);
      setAtlasLoading(false);
      return;
    }
    if (storyResult.error || photoResult.error || wishResult.error) setAtlasError(`部分内容加载失败：${storyResult.error?.message || photoResult.error?.message || wishResult.error?.message}`);
    if (!provinceResult.data.length) {
      setStatuses(provinceStatus);
      setProvinceOptions([]);
      setAdminStories([]);
      setAdminPhotos([]);
      setPlans(initialPlans);
      setPublishedStories(initialDemoStories);
      setStats(demoStats);
      setUsingDemoData(true);
      setAtlasReady(true);
      setAtlasLoading(false);
      return;
    }
    const nextStatuses = Object.fromEntries(
      provinceResult.data.map((item) => [item.name, item.status as ProvinceStatus]),
    );
    const nextProvinceOptions = provinceResult.data.map((item) => ({ code: item.code, name: item.name, status: item.status as ProvinceStatus, expectedAt: item.expected_at || "" }));
    const provinceNames = Object.fromEntries(nextProvinceOptions.map((item) => [item.code, item.name]));
    setStatuses(nextStatuses);
    setProvinceOptions(nextProvinceOptions);
    setPlans(Object.fromEntries(nextProvinceOptions.filter((item) => item.status === "planned").map((item) => [item.name, { provinceCode: item.code, provinceName: item.name, expectedAt: item.expectedAt, wishes: (wishResult.data || []).filter((wish) => wish.province_code === item.code).map((wish) => wish.place_name) }])));
    const nextAdminStories: AdminStoryRecord[] = (storyResult.data || []).map((item) => ({
      id: item.id,
      provinceCode: item.province_code,
      provinceName: provinceNames[item.province_code] || item.province_code,
      title: item.title,
      slug: item.slug,
      coverPath: item.cover_path,
      traveledAt: item.traveled_at,
      citySpots: item.city_spots || [],
      body: item.body,
      verdict: item.verdict || "depends",
      rating: item.rating || 3,
      pros: item.pros || [],
      cons: item.cons || [],
      isPublished: item.is_published,
    }));
    const mediaPaths = Array.from(new Set(
      nextAdminStories.map((item) => item.coverPath).filter((path): path is string => Boolean(path)),
    ));
    const signedUrlByPath: Record<string, string> = {};
    if (mediaPaths.length) {
      const { data: signedMedia } = await supabase.storage.from("travel-media").createSignedUrls(mediaPaths, 60 * 60);
      for (const item of signedMedia || []) if (item.path && item.signedUrl) signedUrlByPath[item.path] = item.signedUrl;
    }
    setAdminStories(nextAdminStories.map((item) => ({
      ...item,
      coverUrl: item.coverPath ? signedUrlByPath[item.coverPath] : undefined,
    })));
    const storyTitleById = Object.fromEntries(nextAdminStories.map((item) => [item.id, item.title]));
    setAdminPhotos((photoResult.data || []).map((photo) => ({
      id: photo.id,
      storyId: photo.story_id,
      storyTitle: storyTitleById[photo.story_id] || "未命名故事",
      storagePath: photo.storage_path,
      captionTitle: photo.caption_title || "",
      captionStory: photo.caption_story || "",
      sortOrder: photo.sort_order,
    })));
    const verdictLabel = { worth_it: "值得去", depends: "因人而异", not_recommended: "不推荐" } as const;
    setPublishedStories(nextAdminStories.filter((item) => item.isPublished).map((item, index) => ({
      id: item.id,
      province: item.provinceName,
      city: item.citySpots.join(" · ") || item.provinceName,
      title: item.title,
      date: item.traveledAt,
      excerpt: item.body.length > 100 ? `${item.body.slice(0, 100)}…` : item.body,
      body: item.body,
      rating: item.rating,
      verdict: verdictLabel[item.verdict],
      pros: item.pros,
      cons: item.cons,
      tone: index % 2 === 0 ? "blue" : "amber",
      coverUrl: item.coverPath ? signedUrlByPath[item.coverPath] : undefined,
      photos: (photoResult.data || []).filter((photo) => photo.story_id === item.id).map((photo) => ({ id: photo.id, storagePath: photo.storage_path, captionTitle: photo.caption_title || "", captionStory: photo.caption_story || "", sortOrder: photo.sort_order })),
    })));
    setStats({
      visited: provinceResult.data.filter((item) => item.status === "visited").length,
      planned: provinceResult.data.filter((item) => item.status === "planned").length,
      stories: (storyResult.data || []).filter((item) => item.is_published).length,
      photos: (photoResult.data || []).filter((photo) => nextAdminStories.some((item) => item.id === photo.story_id && item.isPublished)).length,
    });
    setUsingDemoData(false);
    setAtlasReady(!(storyResult.error || photoResult.error || wishResult.error));
    setAtlasLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    const task = window.setTimeout(() => void loadAtlasData(), 0);
    return () => window.clearTimeout(task);
  }, [loadAtlasData, user]);

  useEffect(() => {
    if (!user?.id) return;
    const task = window.setTimeout(async () => {
      const supabase = createSupabaseBrowserClient();
      const { count } = supabase ? await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", user.id!).is("read_at", null) : { count: 0 };
      setUnreadCount(count || 0);
    }, 0);
    return () => window.clearTimeout(task);
  }, [user]);

  useEffect(() => {
    const task = window.setTimeout(applyLocation, 0);
    window.addEventListener("popstate", applyLocation);
    return () => { window.clearTimeout(task); window.removeEventListener("popstate", applyLocation); };
  }, [applyLocation]);

  useEffect(() => {
    if (!atlasReady) return;
    const task = window.setTimeout(() => {
      if (story && !publishedStories.some((item) => item.id === story)) {
        window.history.replaceState({}, "", "/map");
        setStory(undefined);
        setView("map");
        return;
      }
      if (province) {
        const currentStatus = statuses[province.name];
        if (!currentStatus || currentStatus === "unplanned") {
          window.history.replaceState({}, "", "/map");
          setProvince(undefined);
          setView("map");
        } else if (currentStatus !== province.status) {
          setProvince({ name: province.name, status: currentStatus });
        }
      }
    }, 0);
    return () => window.clearTimeout(task);
  }, [atlasReady, province, publishedStories, statuses, story]);

  useEffect(() => {
    if (!province && !story && !searchOpen) return;
    const previousOverflow = document.body.style.overflow;
    previousFocus.current = searchOpen && searchOpenerFocus.current
      ? searchOpenerFocus.current
      : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusTask = window.setTimeout(() => {
      const layer = document.querySelector<HTMLElement>(".story-lightbox") || document.querySelector<HTMLElement>("[data-focus-layer], .story-overlay, .province-panel");
      if (!layer) return;
      if (!layer.hasAttribute("tabindex")) layer.tabIndex = -1;
      const first = layer.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      (first || layer).focus();
    }, 0);
    const handleLayerKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.querySelector(".story-lightbox")) return;
        if (searchOpen) setSearchOpen(false);
        else closeOverlay();
        return;
      }
      if (event.key !== "Tab") return;
      const layer = document.querySelector<HTMLElement>(".story-lightbox") || document.querySelector<HTMLElement>("[data-focus-layer], .story-overlay, .province-panel");
      const focusable = layer ? Array.from(layer.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')).filter((item) => item.offsetParent !== null) : [];
      if (!focusable.length) { event.preventDefault(); layer?.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleLayerKeys);
    return () => {
      window.clearTimeout(focusTask);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleLayerKeys);
      const target = previousFocus.current;
      window.setTimeout(() => {
        const rect = target?.getBoundingClientRect();
        const targetIsVisible = Boolean(
          target?.isConnected
          && rect
          && rect.right > 0
          && rect.left < window.innerWidth
          && rect.bottom > 0
          && rect.top < window.innerHeight,
        );
        const fallback = document.querySelector<HTMLElement>(".mobile-menu");
        (targetIsVisible ? target : fallback)?.focus();
        if (searchOpenerFocus.current === target) searchOpenerFocus.current = null;
      }, 0);
    };
  }, [closeOverlay, province, searchOpen, story]);

  function enter(name: string, admin = false) {
    setUser({ email: "", name, admin });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }
  async function logout() { await createSupabaseBrowserClient()?.auth.signOut(); setUser(null); window.history.replaceState({}, "", "/login"); setView("map"); }
  async function cancelRecovery() { await createSupabaseBrowserClient()?.auth.signOut(); setRecoveryMode(false); setRecoveryTokenHash(undefined); setUser(null); setAuthMessage(""); window.history.replaceState({}, "", "/login"); }
  const page = useMemo(() => {
    if (!user) return null;
    if (view === "wall") return <WallPage user={user} />;
    if (view === "notifications") return <NotificationPage user={user} onNavigate={navigateUrl} onUnreadChange={setUnreadCount} />;
    if (view === "profile") return <ProfilePage user={user} onUpdated={refreshCurrentUser} onOpenNotifications={() => navigateView("notifications")} />;
    if (view === "admin" && user.admin) return <AdminPage stats={stats} provinceCount={provinceOptions.length} stories={adminStories} onManageProvinces={() => navigateView("admin-provinces")} onManagePlans={() => navigateView("admin-plans")} onManagePhotos={() => navigateView("admin-photos")} onOptimizeMedia={() => navigateView("admin-optimize")} onManageComments={() => navigateView("admin-comments")} onManageUsers={() => navigateView("admin-users")} onNewStory={() => { setSelectedAdminStoryId(undefined); navigateView("admin-story-new"); }} onEditStory={(id) => { setSelectedAdminStoryId(id); window.history.pushState({}, "", `/admin/stories/${id}`); setView("admin-story-new"); }} />;
    if (view === "admin-provinces" && user.admin) return <ProvinceAdminPage key={Object.entries(statuses).sort(([left], [right]) => left.localeCompare(right)).map(([name, status]) => `${name}:${status}`).join("|")} statuses={statuses} onBack={() => navigateView("admin")} onUpdated={loadAtlasData} />;
    if (view === "admin-story-new" && user.admin) {
      const selectedAdminStory = adminStories.find((item) => item.id === selectedAdminStoryId);
      if (selectedAdminStoryId && atlasError) return <AdminStoryRouteStatePage state="error" onBack={() => navigateView("admin")} />;
      if (selectedAdminStoryId && !atlasReady) return <AdminStoryRouteStatePage state="loading" onBack={() => navigateView("admin")} />;
      if (selectedAdminStoryId && !selectedAdminStory) return <AdminStoryRouteStatePage state="missing" onBack={() => navigateView("admin")} />;
      return <StoryEditorPage key={`${selectedAdminStoryId || "new"}:${selectedAdminStory ? "ready" : "new"}:${provinceOptions.length}`} provinces={provinceOptions} story={selectedAdminStory} onBack={() => navigateView("admin")} onSaved={loadAtlasData} />;
    }
    if (view === "admin-comments" && user.admin) return <AdminCommentsPage onBack={() => navigateView("admin")} />;
    if (view === "admin-users" && user.admin) return <AdminUsersPage currentUserId={user.id} onBack={() => navigateView("admin")} />;
    if (view === "admin-photos" && user.admin) return <AdminPhotoLibraryPage key={adminPhotos.map((photo) => photo.id).join("|")} photos={adminPhotos} onBack={() => navigateView("admin")} onUpdated={loadAtlasData} />;
    if (view === "admin-plans" && user.admin) return <AdminPlansPage key={JSON.stringify(plans)} plans={Object.values(plans)} onBack={() => navigateView("admin")} onUpdated={loadAtlasData} />;
    if (view === "admin-optimize" && user.admin) return <AdminMediaOptimizerPage stories={adminStories} photos={adminPhotos} onBack={() => navigateView("admin")} onUpdated={loadAtlasData} />;
    return <MapHome statuses={statuses} stats={stats} stories={publishedStories} usingDemoData={usingDemoData} onProvince={openProvince} onStory={openStory} onNavigate={navigateView} onSearch={openSearch} />;
  }, [adminPhotos, adminStories, atlasError, atlasReady, loadAtlasData, navigateUrl, navigateView, openProvince, openSearch, openStory, plans, provinceOptions, publishedStories, refreshCurrentUser, selectedAdminStoryId, stats, statuses, usingDemoData, view, user]);
  if (!authReady) return <main className="auth-loading"><Brand /><span>正在确认访问权限…</span></main>;
  if (recoveryMode) return <PasswordRecoveryPage tokenHash={recoveryTokenHash} onTokenConsumed={() => setRecoveryTokenHash(undefined)} onComplete={(message) => { setRecoveryMode(false); setRecoveryTokenHash(undefined); setUser(null); setAuthMessage(message); }} onCancel={cancelRecovery} />;
  if (!user) return <AuthGate onEnter={enter} initialMessage={authMessage} />;
  return <main className="app-shell"><Sidebar view={view} setView={navigateView} name={user.name} avatarUrl={user.avatarUrl} admin={user.admin} unreadCount={unreadCount} onSearch={openSearch} onLogout={logout} /><div className="app-content">{(atlasLoading || atlasError) && <div className={`global-status ${atlasError ? "error" : ""}`}>{atlasError || "正在同步旅行数据…"}{atlasError && <button onClick={() => void loadAtlasData()}>重试</button>}</div>}{page}</div>{province && <ProvincePanel province={province.name} status={province.status} plan={plans[province.name]} allStories={publishedStories} user={user} onClose={closeOverlay} onStory={openStory} />}{story && <StoryDetail id={story} stories={publishedStories} user={user} onClose={closeOverlay} />}{searchOpen && <SearchOverlay statuses={statuses} stories={publishedStories} onClose={() => setSearchOpen(false)} onProvince={openProvince} onStory={openStory} />}</main>;
}
