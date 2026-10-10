import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useBranding } from '@/lib/queries';
import { APP_ICON } from '@/lib/assets';

interface Props {
  size?: number;
  rounded?: 'lg' | 'full';
  className?: string;
}

const FALLBACK_NAME = '智核商店';
// A logo can be replaced at the same public Storage URL. Browsers/CDNs may then
// paint the old cached bytes for one frame even after site_settings is up to date.
// Use a per-page cache key for remote logos so every page load requests the current asset.
// Keep data/blob URLs untouched and preserve any existing signed URL parameters.
const LOGO_CACHE_KEY = Date.now().toString(36);
function currentLogoUrl(raw: string): string {
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw;
    url.searchParams.set('_brand_v', LOGO_CACHE_KEY);
    return url.toString();
  } catch {
    return raw;
  }
}

export function BrandLogo({ size = 32, rounded = 'lg', className }: Props) {
  const { logo_url, name } = useBranding();
  const [broken, setBroken] = useState(false);
  const label = (name || FALLBACK_NAME).trim();
  const radius = rounded === 'full' ? 'rounded-full' : 'rounded-xl';

  if (logo_url?.trim() && !broken) {
    const imageUrl = currentLogoUrl(logo_url.trim());
    return (
      <img key={imageUrl} src={imageUrl} alt={label} width={size} height={size}
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className={cn('shrink-0 object-cover', radius, className)} />
    );
  }

  return (
    <span
      style={{ width: size, height: size }}
      className={cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#101528] text-white shadow-[0_10px_30px_rgba(31,39,74,.18)]', radius, className)}
    >
      {APP_ICON ? (
        <img src={APP_ICON} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ width: size * 0.82, height: size * 0.82 }} className="object-contain" />
      ) : null}
      <span className="absolute font-black text-xl">知</span>
    </span>
  );
}

export function useBrandName(fallback = FALLBACK_NAME): string {
  const { name } = useBranding();
  const raw = name?.trim();
  if (!raw || raw === '智核' || raw === '知禾商城') return fallback;
  return raw;
}
