export function Header() {
  return (
    <header className="w-full flex items-center justify-between px-5 sm:px-8 pt-5 sm:pt-7">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-6 w-6 rounded-full bg-gradient-to-br from-rizz-accent2 via-rizz-accent to-rizz-cool shadow-glow"
        />
        <span className="text-[13px] sm:text-sm tracking-[0.22em] font-medium text-rizz-mute">
          RIZZ<span className="text-rizz-ink">OS</span>
        </span>
      </div>
      <nav className="hidden sm:flex items-center gap-6 text-xs text-rizz-mute">
        <span className="opacity-70">v0.1 · MVP</span>
      </nav>
    </header>
  );
}
