export default function Logo({ size = 30 }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4F46E5" /><stop offset="1" stopColor="#06B6D4" /></linearGradient></defs>
        <rect width="32" height="32" rx="9" fill="url(#lg)" />
        <g stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><path d="M16 9L9 21M16 9L23 21M9 21H23" /></g>
        <g fill="#fff"><circle cx="16" cy="9" r="3" /><circle cx="9" cy="21" r="3" /><circle cx="23" cy="21" r="3" /></g>
      </svg>
      <span>CodeMap <b>AI</b></span>
    </span>
  );
}
