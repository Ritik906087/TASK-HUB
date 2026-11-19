import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ClipboardCheck,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  RefreshCw,
  X,
} from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { apiFetch, setUserToken } from '../lib/api.ts';
import { PWAInstallButton } from './PWAInstall.tsx';

export type AuthScreenMode = 'login' | 'register' | 'forgot';

interface AuthViewsProps {
  initialMode?: AuthScreenMode;
  initialInviteCode?: string;
  onAuthenticated: () => void;
}

interface CaptchaChallenge {
  challengeToken: string;
  question: string;
}

interface PublicConfig {
  referralRequired: boolean;
  registrationEnabled: boolean;
  maintenanceMode: boolean;
}

const IndiaFlagIcon: React.FC = () => (
  <svg className="h-4 w-6 rounded-[3px] shrink-0 border border-slate-200" viewBox="0 0 24 16" aria-hidden="true">
    <rect width="24" height="5.33" fill="#FF9933" />
    <rect y="5.33" width="24" height="5.34" fill="#FFFFFF" />
    <rect y="10.67" width="24" height="5.33" fill="#138808" />
    <circle cx="12" cy="8" r="1.8" fill="none" stroke="#000080" strokeWidth="0.7" />
  </svg>
);

export const AuthViews: React.FC<AuthViewsProps> = ({
  initialMode = 'login',
  initialInviteCode = '',
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<AuthScreenMode>(initialMode);
  const [config, setConfig] = useState<PublicConfig>({
    referralRequired: false,
    registrationEnabled: true,
    maintenanceMode: false,
  });

  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);

  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState<string | null>(null);

  const [showSupportModal, setShowSupportModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadCaptcha = async () => {
    setLoadingCaptcha(true);
    try {
      const data = await apiFetch<CaptchaChallenge>('/api/auth/captcha', { tokenType: 'none' });
      setCaptcha(data);
      setCaptchaAnswer('');
    } catch {
      // handled silently
    } finally {
      setLoadingCaptcha(false);
    }
  };

  useEffect(() => {
    apiFetch<PublicConfig>('/api/auth/public-config', { tokenType: 'none' })
      .then((c) => setConfig(c))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode === 'register' || mode === 'forgot') {
      loadCaptcha();
    }
    setError(null);
    setSuccessMsg(null);
  }, [mode]);

  useEffect(() => {
    if (initialInviteCode) {
      setInviteCode(initialInviteCode);
      setMode('register');
    }
  }, [initialInviteCode]);

  const getDeviceFingerprint = () => {
    try {
      const raw = `${navigator.userAgent}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
      return btoa(unescape(encodeURIComponent(raw))).slice(0, 48);
    } catch {
      return 'web-client';
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/login', {
        method: 'POST',
        tokenType: 'none',
        body: JSON.stringify({ phone, password }),
      });
      setUserToken(res.token);
      onAuthenticated();
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!captcha) {
      setError('CAPTCHA is loading. Please wait.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Set Password and Confirm Password must match.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/register', {
        method: 'POST',
        tokenType: 'none',
        body: JSON.stringify({
          fullName,
          phone,
          password,
          confirmPassword,
          inviteCode,
          captchaToken: captcha.challengeToken,
          captchaAnswer,
          deviceFingerprint: getDeviceFingerprint(),
        }),
      });
      setUserToken(res.token);
      onAuthenticated();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!captcha) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string; verificationPreviewCode?: string }>(
        '/api/auth/forgot-password/request',
        {
          method: 'POST',
          tokenType: 'none',
          body: JSON.stringify({
            phone,
            captchaToken: captcha.challengeToken,
            captchaAnswer,
          }),
        }
      );
      setSuccessMsg(res.message);
      setOtpHint(res.verificationPreviewCode ?? null);
      setOtpStep('verify');
    } catch (err: any) {
      setError(err.message || 'Could not send OTP');
      loadCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/forgot-password/reset', {
        method: 'POST',
        tokenType: 'none',
        body: JSON.stringify({
          phone,
          otp: otpCode,
          newPassword: password,
          confirmPassword,
        }),
      });
      setSuccessMsg(res.message);
      setOtpStep('request');
      setOtpCode('');
      setOtpHint(null);
      setPassword('');
      setConfirmPassword('');
      setTimeout(() => setMode('login'), 1200);
    } catch (err: any) {
      setError(err.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await result.user.getIdToken();
      const res = await apiFetch<{ token: string }>('/api/auth/firebase', {
        method: 'POST',
        tokenType: 'none',
        body: JSON.stringify({ idToken, inviteCode }),
      });
      setUserToken(res.token);
      onAuthenticated();
    } catch (err: any) {
      setError(err.message || 'Google sign-in could not be completed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] top-aura-bg flex flex-col">
      {/* Clean Header (No Admin Link) */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {mode !== 'login' ? (
          <button
            type="button"
            onClick={() => setMode('login')}
            className="h-11 w-11 rounded-full flex items-center justify-center text-slate-700 hover:bg-white/80 transition-colors"
            aria-label="Back to Login"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <PWAInstallButton compact />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 pb-8 pt-2">
        <div className="w-full max-w-md lg:max-w-4xl lg:grid lg:grid-cols-12 lg:gap-10 lg:items-center">
          {/* Desktop Brand Showcase */}
          <div className="hidden lg:flex lg:col-span-6 flex-col justify-center space-y-5 pr-4">
            <p className="text-xs font-semibold text-[#5B46F6]">
              TASK HUB · Verified Rewards Platform
            </p>
            <h1 className="font-display text-4xl font-bold text-slate-900 leading-tight text-balance">
              Complete daily tasks and withdraw rewards directly to Bank or UPI.
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Watch videos, review photo galleries, visit partner pages, and build a verified team to earn direct and Level-2 commissions.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-2xl bg-white border border-slate-200/80 p-4">
                <p className="font-mono-num text-xl font-bold text-[#5B46F6]">₹10 – ₹500</p>
                <p className="text-xs text-slate-500 mt-1">Instant UPI &amp; Bank Payouts</p>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200/80 p-4">
                <p className="font-mono-num text-xl font-bold text-slate-900">10% + 5%</p>
                <p className="text-xs text-slate-500 mt-1">Direct &amp; Team Commissions</p>
              </div>
            </div>
          </div>

          {/* Auth Form Card */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto">
            {config.maintenanceMode && (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
                Platform maintenance is active. Some actions may be temporarily restricted.
              </div>
            )}

            {mode === 'login' && (
              <div className="space-y-6">
                <div className="text-center space-y-3">
                  <div className="h-16 w-16 rounded-2xl bg-[#5B46F6] text-white mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/25">
                    <ClipboardCheck className="h-8 w-8" strokeWidth={2.2} />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-bold text-slate-900">
                      Sign in to TASK HUB
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Enter your registered mobile number and password
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="flex items-center gap-2.5 rounded-2xl bg-white border border-slate-200 px-4 h-14 focus-within:border-[#5B46F6] focus-within:ring-2 focus-within:ring-[#5B46F6]/15 transition-all">
                    <IndiaFlagIcon />
                    <span className="text-sm font-semibold text-slate-700 shrink-0">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone Number"
                      className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-4 h-14 focus-within:border-[#5B46F6] focus-within:ring-2 focus-within:ring-[#5B46F6]/15 transition-all">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-2 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-start px-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setOtpStep('request');
                      }}
                      className="text-xs font-semibold text-[#5B46F6] hover:text-[#4338CA]"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-13 rounded-2xl bg-[#5B46F6] hover:bg-[#4B36E6] text-white text-base font-bold shadow-md shadow-indigo-500/20 transition-all disabled:opacity-60"
                  >
                    {loading ? 'Signing in...' : 'Login'}
                  </button>
                </form>

                <div className="flex items-center justify-between px-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="text-[#5B46F6] hover:text-[#4338CA] py-2"
                  >
                    Google Sign-In
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className="text-[#5B46F6] hover:text-[#4338CA] py-2"
                  >
                    Create Account
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div className="space-y-5">
                <div className="text-center">
                  <h2 className="font-display text-2xl font-bold text-slate-900">
                    Create Account
                  </h2>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handleRegister} className="space-y-3.5">
                  <div className="flex items-center gap-2.5 rounded-2xl bg-white border border-slate-200 px-4 h-13 focus-within:border-[#5B46F6] focus-within:ring-2 focus-within:ring-[#5B46F6]/15">
                    <IndiaFlagIcon />
                    <span className="text-sm font-semibold text-slate-700 shrink-0">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone Number"
                      className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>

                  {/* Simple Math CAPTCHA row (e.g. 10 + 2) */}
                  <div className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 pl-4 pr-2 h-13 focus-within:border-[#5B46F6] focus-within:ring-2 focus-within:ring-[#5B46F6]/15">
                    <input
                      type="number"
                      inputMode="numeric"
                      required
                      value={captchaAnswer}
                      onChange={(e) => setCaptchaAnswer(e.target.value)}
                      placeholder="Enter Captcha Answer"
                      className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={loadCaptcha}
                      disabled={loadingCaptcha}
                      title="Tap for new math question"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#5B46F6] hover:bg-[#4B36E6] text-white px-3.5 h-9 text-xs font-mono font-bold whitespace-nowrap shrink-0 transition-colors"
                    >
                      <span>{captcha ? captcha.question : '...'}</span>
                      <RefreshCw className={`h-3 w-3 ${loadingCaptcha ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  <div className="flex items-center rounded-2xl bg-white border border-slate-200 px-4 h-13 focus-within:border-[#5B46F6] focus-within:ring-2 focus-within:ring-[#5B46F6]/15">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Full Name (Optional)"
                      className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-4 h-13 focus-within:border-[#5B46F6] focus-within:ring-2 focus-within:ring-[#5B46F6]/15">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set Password"
                      className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-2 text-slate-400 hover:text-slate-600"
                      aria-label="Toggle password"
                    >
                      {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-4 h-13 focus-within:border-[#5B46F6] focus-within:ring-2 focus-within:ring-[#5B46F6]/15">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm Password"
                      className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="p-2 text-slate-400 hover:text-slate-600"
                      aria-label="Toggle confirm password"
                    >
                      {showConfirmPassword ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center rounded-2xl bg-white border border-slate-200 px-4 h-13 focus-within:border-[#5B46F6] focus-within:ring-2 focus-within:ring-[#5B46F6]/15">
                    <input
                      type="text"
                      required={config.referralRequired}
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder={
                        config.referralRequired
                          ? 'Invitation Code (Required)'
                          : 'Invitation Code (Optional)'
                      }
                      className="flex-1 min-w-0 bg-transparent text-sm font-mono uppercase text-slate-900 placeholder:font-sans placeholder:normal-case placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !config.registrationEnabled}
                    className="w-full h-13 rounded-2xl bg-[#5B46F6] hover:bg-[#4B36E6] text-white text-base font-bold shadow-md shadow-indigo-500/20 transition-all disabled:opacity-60 mt-2"
                  >
                    {loading ? 'Creating Account...' : 'Sign Up'}
                  </button>
                </form>

                <p className="text-center text-xs text-slate-500">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="font-bold text-[#5B46F6] hover:underline"
                  >
                    Login
                  </button>
                </p>
              </div>
            )}

            {mode === 'forgot' && (
              <div className="space-y-5">
                <div className="text-center">
                  <h2 className="font-display text-2xl font-bold text-slate-900">
                    Reset Password
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Verify your registered phone number with a one-time OTP.
                  </p>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {successMsg && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {successMsg}
                  </div>
                )}

                {otpStep === 'request' ? (
                  <form onSubmit={handleRequestOtp} className="space-y-4">
                    <div className="flex items-center gap-2.5 rounded-2xl bg-white border border-slate-200 px-4 h-13">
                      <IndiaFlagIcon />
                      <span className="text-sm font-semibold text-slate-700">+91</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Registered Phone Number"
                        className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 pl-4 pr-2 h-13">
                      <input
                        type="number"
                        inputMode="numeric"
                        required
                        value={captchaAnswer}
                        onChange={(e) => setCaptchaAnswer(e.target.value)}
                        placeholder="Enter Captcha Answer"
                        className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={loadCaptcha}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#5B46F6] text-white px-3.5 h-9 text-xs font-mono font-bold"
                      >
                        <span>{captcha ? captcha.question : '...'}</span>
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full h-13 rounded-2xl bg-[#5B46F6] hover:bg-[#4B36E6] text-white text-sm font-bold shadow-md shadow-indigo-500/20"
                    >
                      {loading ? 'Sending OTP...' : 'Send Recovery OTP'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    {otpHint && (
                      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
                        Verification OTP: <strong className="font-mono text-sm">{otpHint}</strong>
                      </div>
                    )}

                    <div className="flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-4 h-13">
                      <KeyRound className="h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="6-Digit OTP"
                        className="flex-1 bg-transparent text-sm font-mono focus:outline-none"
                      />
                    </div>

                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="New Password"
                      className="w-full rounded-2xl bg-white border border-slate-200 px-4 h-13 text-sm"
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm New Password"
                      className="w-full rounded-2xl bg-white border border-slate-200 px-4 h-13 text-sm"
                    />

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full h-13 rounded-2xl bg-[#5B46F6] hover:bg-[#4B36E6] text-white text-sm font-bold"
                    >
                      {loading ? 'Updating...' : 'Verify OTP & Reset Password'}
                    </button>
                  </form>
                )}

                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Login</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Customer Service Footer (No Admin Link) */}
      <footer className="py-5 text-center">
        <button
          type="button"
          onClick={() => setShowSupportModal(true)}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-[#5B46F6] py-2 px-4"
        >
          <Headphones className="h-4 w-4 text-[#5B46F6]" />
          <span>Customer Service</span>
        </button>
      </footer>

      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 border border-slate-200 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                Customer Service &amp; Help
              </h3>
              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Having trouble signing in? Use <strong>Forgot Password?</strong> on the Login screen to reset your password via 6-digit OTP verification, or sign in with Google.
            </p>
            <button
              type="button"
              onClick={() => setShowSupportModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#5B46F6] text-white text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
