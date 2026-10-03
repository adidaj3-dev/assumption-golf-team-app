// Assumption University / Greyhounds Athletics brand colors,
// pulled from the official athletics brand guidelines (PMS 301 blue).
// Real logo + conference assets live in /public/branding (see LOGO_URL,
// SEAL_URL, NE10_URL below) — swap the files there to update branding
// anywhere in the app.

export const colors = {
  primary: '#004b87',      // Assumption Blue (PMS 301)
  primaryDark: '#00325c',
  gray: '#b6bfc5',         // Assumption Cool Gray
  grayLight: '#eef1f5',
  black: '#111111',
  white: '#ffffff',
  textMuted: '#5a6672',
  error: '#b00020',
  gold: '#d4af37',         // accent for "LIVE"/highlight tags on dark banners
  scoreUnder: '#c8102e',   // PGA-style red for under-par scores
}

export const fonts = {
  heading: "'Georgia', 'Times New Roman', serif",
  body: "system-ui, -apple-system, 'Segoe UI', sans-serif",
}

// Real Assumption + NE10 assets (dropped into /public/branding).
export const LOGO_URL = '/branding/assumption-wordmark.webp'
export const SEAL_URL = '/branding/assumption-seal.png'
export const NE10_URL = '/branding/ne10-logo.jpg'
export const NE10_CHAMPIONSHIP_URL = '/branding/ne10-championship.jpg'
export const HERO_TEE_URL = '/branding/hero-tee-shot.jpg'
export const HERO_PUTTING_URL = '/branding/hero-putting-green.jpg'
export const GREYHOUNDS_SIGN_URL = '/branding/greyhounds-sign.jpg'

// A very light wash over a background photo so it reads as a subtle texture
// behind white content instead of competing with the text sitting on top.
export function subtleBackdrop(url) {
  return {
    backgroundImage: `linear-gradient(rgba(255,255,255,0.94), rgba(255,255,255,0.94)), url(${url})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
}
