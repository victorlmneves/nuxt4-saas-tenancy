import type { Tenant as BaseTenant } from '../../../src/types';

export interface TenantTheme {
    /** Primary brand color — used for navbar, badges, accents */
    brand: string;
    /** Text color on top of brand-colored surfaces (e.g. navbar) */
    brandText: string;
    /** Page background color */
    colorBgPage: string;
    /** Font stack */
    fontSans: string;
    /** Base border-radius for cards and inputs */
    radiusMd: string;
    /** Pill border-radius for badges */
    radiusPill: string;
}

declare module '../../../src/types' {
    interface Tenant {
        plan: 'free' | 'pro' | 'enterprise';
        logoUrl: string | null;
        theme: TenantTheme;
    }
}

export {};
