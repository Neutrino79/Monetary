import { appConfig } from "@/config/app";

/**
 * The product mark: the Monetary wallet on a dark tile. If `VITE_APP_LOGO_MARK` is set, that
 * character is shown instead (a white-label override); by default it is empty and the wallet is used.
 */
export function LogoMark({ size = 34 }: { size?: number }) {
  if (appConfig.logoMark) {
    return (
      <span
        className="flex flex-none items-center justify-center rounded-[10px] bg-ink font-semibold text-paper"
        style={{ width: size, height: size, fontFamily: "var(--font-ledger)", fontSize: Math.round(size * 0.47) }}
      >
        {appConfig.logoMark}
      </span>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" role="img" aria-label="Monetary" className="flex-none">
      <rect x=".75" y=".75" width="106.5" height="106.5" rx="24" fill="#171b22" stroke="#333a47" strokeWidth="1.5" />
      <g transform="translate(-1 1)">
        <rect x="30" y="26" width="46" height="18" rx="7" fill="#e28b96" />
        <rect x="24" y="34" width="58" height="46" rx="10" fill="#49b98b" />
        <rect x="58" y="48" width="28" height="18" rx="9" fill="#fbfaf6" />
        <circle cx="68" cy="57" r="4.5" fill="#171b22" />
      </g>
    </svg>
  );
}
