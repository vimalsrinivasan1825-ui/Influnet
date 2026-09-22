// The visitor's side of the site, remembered per browser so a returning
// creator lands on /creators and a business on /business without the intro.
export type Role = 'creator' | 'business';

export const ROLE_KEY = 'influnet.role';

export const ROLE_PATH: Record<Role, string> = {
  creator: '/creators',
  business: '/business',
};

export function saveRole(role: Role) {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // Private mode or blocked storage: the site still works, it just asks again.
  }
}

// Runs before React on every page (root layout, beforeInteractive). On `/` it
// sends a returning visitor straight to their side. On /creators and
// /business it raises the flag that makes the hero wait for the logo intro,
// unless the visitor prefers reduced motion. Kept as a string on purpose.
export const BOOT_SCRIPT = `try{var d=document.documentElement,p=location.pathname,r=localStorage.getItem('${ROLE_KEY}');if(p==='/'&&(r==='creator'||r==='business')){d.style.background='#141118';location.replace(r==='creator'?'/creators':'/business')}else if((p==='/creators'||p==='/business')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){d.dataset.gate='on'}}catch(e){}`;
